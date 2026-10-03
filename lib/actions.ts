// lib/actions.ts
//
// Server actions. Two rules:
//
// 1. Every action scopes by clinicId. A missing filter is how one clinic
//    ends up seeing another's patients. Ids from forms are re-checked.
// 2. User mistakes RETURN an error, they do not throw. Throwing shows a
//    stack trace and loses what they typed. Only impossible states throw.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "./db";
import { currentClinicId, requireSession } from "./session";
import { audit } from "./audit";
import {
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from "./auth";
import { isConfigured, sendReminder } from "./whatsapp";
import {
  fail,
  done,
  isError,
  optionalNumber,
  requirePhone,
  requireText,
  type ActionState,
} from "./result";

// ---------------------------------------------------------------
// Auth
// ---------------------------------------------------------------

const MAX_ATTEMPTS = 8;
const WINDOW_MINUTES = 15;

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null
  );
}

export async function signIn(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!phone || !password) {
    return fail("Enter your phone number and password.");
  }

  const ip = await clientIp();
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);

  // Throttle on both the phone number and the IP, so neither a targeted
  // attack on one account nor a spray across many gets far.
  const recentFailures = await db.loginAttempt.count({
    where: {
      success: false,
      createdAt: { gte: since },
      OR: [{ phone }, ...(ip ? [{ ip }] : [])],
    },
  });

  if (recentFailures >= MAX_ATTEMPTS) {
    return fail(
      `Too many failed attempts. Wait ${WINDOW_MINUTES} minutes and try again, or ask the clinic owner to reset your password.`
    );
  }

  const staff = await db.staff.findFirst({
    where: { phone, active: true, deletedAt: null },
  });

  const okCredentials =
    staff?.passwordHash && verifyPassword(password, staff.passwordHash);

  await db.loginAttempt.create({
    data: { phone, ip, success: Boolean(okCredentials) },
  });

  // Same message either way — never reveal whether the number exists.
  if (!staff || !okCredentials) {
    const left = MAX_ATTEMPTS - recentFailures - 1;

    return fail(
      left <= 3
        ? `That phone number and password do not match. ${left} attempt${
            left === 1 ? "" : "s"
          } left before this is locked.`
        : "That phone number and password do not match."
    );
  }

  await createSession({
    staffId: staff.id,
    clinicId: staff.clinicId,
    name: staff.name,
    role: staff.role,
  });

  redirect("/");
}

export async function signOut() {
  await destroySession();
  redirect("/login");
}

export async function changeOwnPassword(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireSession();

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) {
    return fail("Your new password needs at least 8 characters.");
  }
  if (next !== confirm) {
    return fail("The two new passwords do not match.");
  }

  const staff = await db.staff.findUnique({ where: { id: session.staffId } });

  if (!staff?.passwordHash || !verifyPassword(current, staff.passwordHash)) {
    return fail("Your current password is not correct.");
  }

  await db.staff.update({
    where: { id: staff.id },
    data: { passwordHash: hashPassword(next), passwordSetByOwner: false },
  });

  await audit({
    action: "staff.password.change",
    entityType: "Staff",
    entityId: staff.id,
  });

  return done("Password changed.");
}

// There is no email in this system, so password reset is done in person
// by the owner — which is how a five-person clinic actually works.
export async function resetStaffPassword(
  staffId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireSession();
  const clinicId = await currentClinicId();

  if (session.role !== "OWNER") {
    return fail("Only the clinic owner can reset someone else's password.");
  }

  const next = String(formData.get("password") ?? "");

  if (next.length < 8) {
    return fail("The new password needs at least 8 characters.");
  }

  const updated = await db.staff.updateMany({
    where: { id: staffId, clinicId },
    data: { passwordHash: hashPassword(next), passwordSetByOwner: true },
  });

  if (updated.count === 0) return fail("That staff member was not found.");

  // Clear the lockout so they can sign in straight away.
  const staff = await db.staff.findUnique({ where: { id: staffId } });
  if (staff) {
    await db.loginAttempt.deleteMany({ where: { phone: staff.phone } });
  }

  await audit({
    action: "staff.password.reset",
    entityType: "Staff",
    entityId: staffId,
  });

  revalidatePath("/settings");
  return done("Password reset. Ask them to change it after signing in.");
}

// ---------------------------------------------------------------
// Patients
// ---------------------------------------------------------------

function patientFields(formData: FormData) {
  const name = requireText(formData.get("name"), "Name", 120);
  if (isError(name)) return name;

  const phone = requirePhone(formData.get("phone"));
  if (isError(phone)) return phone;

  const age = optionalNumber(formData.get("age"), "Age", { min: 0, max: 130 });
  if (isError(age)) return age;

  const genderInput = String(formData.get("gender") ?? "").trim();

  return {
    value: {
      name: name.value,
      phone: phone.value,
      ageAtRegistration: age.value,
      gender:
        genderInput === "MALE" ||
        genderInput === "FEMALE" ||
        genderInput === "OTHER"
          ? (genderInput as "MALE" | "FEMALE" | "OTHER")
          : null,
      address: String(formData.get("address") ?? "").trim() || null,
      allergies: String(formData.get("allergies") ?? "").trim() || null,
      conditions: String(formData.get("conditions") ?? "").trim() || null,
      marketingConsent: formData.get("marketingConsent") === "on",
    },
  };
}

export async function createPatient(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const clinicId = await currentClinicId();

  const fields = patientFields(formData);
  if (isError(fields)) return fail(fields.error);

  // Warn rather than block — families genuinely share numbers, but a
  // duplicate is usually a receptionist re-registering someone.
  const existing = await db.patient.findFirst({
    where: { clinicId, phone: fields.value.phone, deletedAt: null },
    select: { name: true, code: true },
  });

  if (existing && formData.get("allowDuplicate") !== "on") {
    return fail(
      `${existing.name} (${existing.code}) already has this number. Tick "register anyway" if this is a different family member.`
    );
  }

  // Code generation and insert in one transaction so two receptionists
  // registering at once cannot produce the same code.
  const patient = await db.$transaction(async (tx) => {
    const count = await tx.patient.count({ where: { clinicId } });

    return tx.patient.create({
      data: {
        clinicId,
        code: `P-${String(count + 1).padStart(4, "0")}`,
        ...fields.value,
        consentGivenAt: new Date(),
      },
    });
  });

  await audit({
    action: "patient.create",
    entityType: "Patient",
    entityId: patient.id,
    after: { code: patient.code, name: patient.name },
  });

  revalidatePath("/patients");
  redirect(`/patients/${patient.id}`);
}

export async function updatePatient(
  patientId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const clinicId = await currentClinicId();

  const fields = patientFields(formData);
  if (isError(fields)) return fail(fields.error);

  const before = await db.patient.findFirst({
    where: { id: patientId, clinicId, deletedAt: null },
  });

  if (!before) return fail("That patient was not found.");

  await db.patient.update({
    where: { id: before.id },
    data: fields.value,
  });

  await audit({
    action: "patient.update",
    entityType: "Patient",
    entityId: before.id,
    before: {
      name: before.name,
      phone: before.phone,
      allergies: before.allergies,
    },
    after: fields.value,
  });

  revalidatePath(`/patients/${before.id}`);
  redirect(`/patients/${before.id}`);
}

// ---------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------

export async function createAppointment(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const clinicId = await currentClinicId();

  const patientId = String(formData.get("patientId") ?? "");
  const doctorId = String(formData.get("doctorId") ?? "");
  const scheduledAt = String(formData.get("scheduledAt") ?? "");

  if (!patientId || !doctorId || !scheduledAt) {
    return fail("Choose a patient, a doctor and a time.");
  }

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime())) return fail("That date and time is not valid.");

  // Confirm both belong to THIS clinic before writing anything.
  const [patient, doctor] = await Promise.all([
    db.patient.findFirst({ where: { id: patientId, clinicId, deletedAt: null } }),
    db.staff.findFirst({ where: { id: doctorId, clinicId, deletedAt: null } }),
  ]);

  if (!patient || !doctor) return fail("That patient or doctor was not found.");

  const durationMin = Number(formData.get("durationMin") ?? 15) || 15;

  // Warn about a clash rather than forbid it — clinics double-book on
  // purpose all the time.
  const clash = await db.appointment.findFirst({
    where: {
      clinicId,
      doctorId,
      cancelledAt: null,
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      scheduledAt: {
        gte: new Date(when.getTime() - durationMin * 60_000),
        lt: new Date(when.getTime() + durationMin * 60_000),
      },
    },
    include: { patient: { select: { name: true } } },
  });

  if (clash && formData.get("allowClash") !== "on") {
    return fail(
      `${doctor.name} already has ${clash.patient.name} around that time. Tick "book anyway" to double-book.`
    );
  }

  const appointment = await db.appointment.create({
    data: {
      clinicId,
      patientId,
      doctorId,
      scheduledAt: when,
      durationMin,
      reason: String(formData.get("reason") ?? "").trim() || null,
      source: "WALK_IN",
    },
  });

  await audit({
    action: "appointment.create",
    entityType: "Appointment",
    entityId: appointment.id,
    after: { patientId, scheduledAt: when.toISOString() },
  });

  revalidatePath("/");
  redirect(`/?day=${when.toISOString().slice(0, 10)}`);
}

export async function rescheduleAppointment(
  appointmentId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const clinicId = await currentClinicId();

  const scheduledAt = String(formData.get("scheduledAt") ?? "");
  const when = new Date(scheduledAt);

  if (Number.isNaN(when.getTime())) return fail("That date and time is not valid.");

  const before = await db.appointment.findFirst({
    where: { id: appointmentId, clinicId, cancelledAt: null },
  });

  if (!before) return fail("That appointment was not found.");

  if (before.status === "COMPLETED") {
    return fail("That consultation is already finished.");
  }

  await db.appointment.update({
    where: { id: before.id },
    data: {
      scheduledAt: when,
      status: "SCHEDULED",
      // A moved appointment needs reminding again.
      reminderSentAt: null,
    },
  });

  await audit({
    action: "appointment.reschedule",
    entityType: "Appointment",
    entityId: before.id,
    before: { scheduledAt: before.scheduledAt.toISOString() },
    after: { scheduledAt: when.toISOString() },
  });

  revalidatePath("/");
  redirect(`/?day=${when.toISOString().slice(0, 10)}`);
}

export async function cancelAppointment(
  appointmentId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const clinicId = await currentClinicId();

  const updated = await db.appointment.updateMany({
    where: { id: appointmentId, clinicId, cancelledAt: null },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledReason: String(formData.get("reason") ?? "").trim() || null,
    },
  });

  if (updated.count === 0) return fail("That appointment was not found.");

  await audit({
    action: "appointment.cancel",
    entityType: "Appointment",
    entityId: appointmentId,
  });

  revalidatePath("/");
  redirect("/");
}

export async function markArrived(appointmentId: string) {
  const clinicId = await currentClinicId();

  await db.appointment.updateMany({
    where: { id: appointmentId, clinicId },
    data: { status: "ARRIVED", arrivedAt: new Date() },
  });

  revalidatePath("/");
}

export async function markNoShow(appointmentId: string) {
  const clinicId = await currentClinicId();

  await db.appointment.updateMany({
    where: { id: appointmentId, clinicId },
    data: { status: "NO_SHOW" },
  });

  revalidatePath("/");
}

// ---------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------

export async function sendTomorrowReminders(): Promise<void> {
  const clinicId = await currentClinicId();

  if (!isConfigured()) {
    revalidatePath("/reminders");
    return;
  }

  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  const due = await db.appointment.findMany({
    where: {
      clinicId,
      scheduledAt: { gte: start, lte: end },
      cancelledAt: null,
      reminderSentAt: null,
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      patient: { marketingConsent: true },
    },
    include: { patient: true, clinic: { select: { name: true } } },
  });

  for (const a of due) {
    const when = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(a.scheduledAt);

    const result = await sendReminder(a.patient.phone, {
      patientName: a.patient.name,
      clinicName: a.clinic.name,
      when,
    });

    if (result.ok) {
      await db.appointment.update({
        where: { id: a.id },
        data: { reminderSentAt: new Date() },
      });
    }
  }

  revalidatePath("/reminders");
}

// ---------------------------------------------------------------
// Visits
// ---------------------------------------------------------------

export async function startVisit(appointmentId: string) {
  const clinicId = await currentClinicId();

  const appointment = await db.appointment.findFirst({
    where: { id: appointmentId, clinicId, cancelledAt: null },
    include: { visit: true },
  });

  if (!appointment) throw new Error("Unknown appointment");

  if (appointment.visit) redirect(`/visits/${appointment.visit.id}`);

  const visit = await db.visit.create({
    data: {
      clinicId,
      patientId: appointment.patientId,
      doctorId: appointment.doctorId,
      appointmentId: appointment.id,
      chiefComplaint: appointment.reason,
    },
  });

  await db.appointment.update({
    where: { id: appointment.id },
    data: { status: "IN_PROGRESS" },
  });

  await audit({
    action: "visit.start",
    entityType: "Visit",
    entityId: visit.id,
    after: { patientId: appointment.patientId },
  });

  revalidatePath("/");
  redirect(`/visits/${visit.id}`);
}

function num(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function text(formData: FormData, key: string): string | null {
  return String(formData.get(key) ?? "").trim() || null;
}

export async function saveVisit(
  visitId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const clinicId = await currentClinicId();

  const visit = await db.visit.findFirst({
    where: { id: visitId, clinicId, deletedAt: null },
    include: { prescription: true },
  });

  if (!visit) return fail("That consultation was not found.");

  const complete = formData.get("complete") === "yes";

  // A closed visit needs at least a diagnosis or a complaint on record.
  if (
    complete &&
    !text(formData, "diagnosis") &&
    !text(formData, "chiefComplaint")
  ) {
    return fail("Record at least a complaint or a diagnosis before closing.");
  }

  const bp = {
    sys: num(formData, "bpSystolic"),
    dia: num(formData, "bpDiastolic"),
  };

  if (bp.sys !== null && (bp.sys < 50 || bp.sys > 300)) {
    return fail("That systolic blood pressure looks mistyped.");
  }
  if (bp.dia !== null && (bp.dia < 30 || bp.dia > 200)) {
    return fail("That diastolic blood pressure looks mistyped.");
  }

  const followUp = String(formData.get("followUpDate") ?? "").trim();

  const before = {
    chiefComplaint: visit.chiefComplaint,
    diagnosis: visit.diagnosis,
    advice: visit.advice,
  };

  await db.visit.update({
    where: { id: visit.id },
    data: {
      chiefComplaint: text(formData, "chiefComplaint"),
      examination: text(formData, "examination"),
      diagnosis: text(formData, "diagnosis"),
      advice: text(formData, "advice"),

      heightCm: num(formData, "heightCm"),
      weightKg: num(formData, "weightKg"),
      bpSystolic: bp.sys,
      bpDiastolic: bp.dia,
      pulse: num(formData, "pulse"),
      tempC: num(formData, "tempC"),
      spo2: num(formData, "spo2"),

      followUpDate: followUp ? new Date(followUp) : null,
      endedAt: complete ? (visit.endedAt ?? new Date()) : visit.endedAt,

      // Editing a closed visit is an amendment, not a rewrite.
      amendedAt: visit.endedAt ? new Date() : null,
    },
  });

  await audit({
    action: visit.endedAt ? "visit.amend" : "visit.update",
    entityType: "Visit",
    entityId: visit.id,
    before,
    after: {
      chiefComplaint: text(formData, "chiefComplaint"),
      diagnosis: text(formData, "diagnosis"),
      advice: text(formData, "advice"),
    },
  });

  // --- prescription: fixed-index rows, blanks ignored ---------------
  const items: {
    drugName: string;
    strength: string | null;
    dosage: string | null;
    durationDays: number | null;
    timing: string | null;
  }[] = [];

  for (let i = 0; i < 8; i++) {
    const drugName = String(formData.get(`drug${i}`) ?? "").trim();
    if (!drugName) continue;

    const days = String(formData.get(`days${i}`) ?? "").trim();

    items.push({
      drugName,
      strength: String(formData.get(`strength${i}`) ?? "").trim() || null,
      dosage: String(formData.get(`dosage${i}`) ?? "").trim() || null,
      durationDays: days ? Number(days) : null,
      timing: String(formData.get(`timing${i}`) ?? "").trim() || null,
    });
  }

  if (items.length > 0) {
    if (visit.prescription) {
      await db.prescriptionItem.deleteMany({
        where: { prescriptionId: visit.prescription.id },
      });
      await db.prescription.update({
        where: { id: visit.prescription.id },
        data: {
          instructions: text(formData, "instructions"),
          items: { create: items },
        },
      });
    } else {
      await db.prescription.create({
        data: {
          visitId: visit.id,
          doctorId: visit.doctorId,
          instructions: text(formData, "instructions"),
          items: { create: items },
        },
      });
    }
  }

  if (complete && visit.appointmentId) {
    await db.appointment.update({
      where: { id: visit.appointmentId },
      data: { status: "COMPLETED" },
    });
  }

  revalidatePath("/");
  revalidatePath(`/visits/${visit.id}`);

  if (complete) redirect(`/visits/${visit.id}/bill`);

  return done("Saved.");
}

// ---------------------------------------------------------------
// Billing
// ---------------------------------------------------------------

// Indian financial year runs April to March: "2026-27".
function financialYear(d = new Date()): string {
  const y = d.getFullYear();
  const start = d.getMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export async function createInvoice(
  visitId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const clinicId = await currentClinicId();

  const visit = await db.visit.findFirst({
    where: { id: visitId, clinicId, deletedAt: null },
    include: { invoice: true },
  });

  if (!visit) return fail("That consultation was not found.");
  if (visit.invoice) redirect(`/visits/${visitId}/bill`);

  const services = await db.service.findMany({
    where: { clinicId, active: true, deletedAt: null },
  });

  const lines = services
    .map((s) => {
      const qty = Number(formData.get(`qty_${s.id}`) ?? 0);
      if (!qty || qty < 1) return null;

      const unitPrice = Number(s.price);

      return {
        serviceId: s.id,
        // Snapshot name and price — never read Service again for this
        // invoice. See CONTEXT.md section 5.
        description: s.name,
        quantity: qty,
        unitPrice,
        gstRate: Number(s.gstRate),
        amount: unitPrice * qty,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  if (lines.length === 0) {
    return fail("Add a quantity against at least one service.");
  }

  const discount = Number(formData.get("discount") ?? 0) || 0;

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const taxTotal = lines.reduce((s, l) => s + (l.amount * l.gstRate) / 100, 0);

  if (discount < 0) return fail("Discount cannot be negative.");
  if (discount > subtotal + taxTotal) {
    return fail("Discount is larger than the bill.");
  }

  const total = subtotal + taxTotal - discount;

  // Numbers must be sequential and gapless per clinic per FY. Count and
  // insert in one transaction.
  const invoice = await db.$transaction(async (tx) => {
    const prefix = `INV/${financialYear()}/`;

    const used = await tx.invoice.count({
      where: { clinicId, number: { startsWith: prefix } },
    });

    return tx.invoice.create({
      data: {
        clinicId,
        patientId: visit.patientId,
        visitId: visit.id,
        number: `${prefix}${String(used + 1).padStart(4, "0")}`,
        subtotal,
        discount,
        taxTotal,
        total,
        status: "ISSUED",
        issuedAt: new Date(),
        lines: { create: lines },
      },
    });
  });

  await audit({
    action: "invoice.create",
    entityType: "Invoice",
    entityId: invoice.id,
    after: { number: invoice.number, total },
  });

  revalidatePath(`/visits/${visitId}/bill`);
  redirect(`/visits/${visitId}/bill`);
}

export async function cancelInvoice(
  invoiceId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireSession();
  const clinicId = await currentClinicId();

  if (session.role !== "OWNER" && session.role !== "DOCTOR") {
    return fail("Only the owner or a doctor can cancel a bill.");
  }

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, clinicId, cancelledAt: null },
    include: { payments: { where: { reversedAt: null } } },
  });

  if (!invoice) return fail("That bill was not found, or is already cancelled.");

  if (invoice.payments.length > 0) {
    return fail(
      "Reverse the payments on this bill before cancelling it, so the day's collection still reconciles."
    );
  }

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return fail("Give a reason — this stays on the record.");

  // The number is NOT reused. A gap in the sequence is worse than a
  // cancelled row.
  await db.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledReason: reason,
    },
  });

  await audit({
    action: "invoice.cancel",
    entityType: "Invoice",
    entityId: invoice.id,
    before: { status: invoice.status, total: Number(invoice.total) },
    after: { reason },
  });

  if (invoice.visitId) revalidatePath(`/visits/${invoice.visitId}/bill`);
  revalidatePath("/reports");

  return done("Bill cancelled.");
}

export async function recordPayment(
  invoiceId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const clinicId = await currentClinicId();

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, clinicId },
  });

  if (!invoice) return fail("That bill was not found.");
  if (invoice.cancelledAt) return fail("That bill has been cancelled.");

  const amount = Number(formData.get("amount") ?? 0);

  if (!Number.isFinite(amount) || amount <= 0) {
    return fail("Enter an amount greater than zero.");
  }

  const due = Number(invoice.total) - Number(invoice.paid);

  if (amount > due + 0.01) {
    return fail(
      `That is more than the ₹${due.toLocaleString("en-IN")} outstanding.`
    );
  }

  const mode = String(formData.get("mode") ?? "CASH");

  await db.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amount,
        mode: mode as "CASH" | "UPI" | "CARD" | "BANK_TRANSFER" | "OTHER",
        reference: String(formData.get("reference") ?? "").trim() || null,
      },
    });

    const paid = Number(invoice.paid) + amount;

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        paid,
        status: paid >= Number(invoice.total) ? "PAID" : "PARTIALLY_PAID",
      },
    });
  });

  await audit({
    action: "payment.record",
    entityType: "Invoice",
    entityId: invoice.id,
    after: { amount, mode },
  });

  revalidatePath("/reports");
  if (invoice.visitId) revalidatePath(`/visits/${invoice.visitId}/bill`);

  return done("Payment recorded.");
}

// Reversed, never deleted — both rows stay so the day still reconciles.
export async function reversePayment(
  paymentId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireSession();
  const clinicId = await currentClinicId();

  if (session.role !== "OWNER" && session.role !== "DOCTOR") {
    return fail("Only the owner or a doctor can reverse a payment.");
  }

  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return fail("Give a reason — this stays on the record.");

  const payment = await db.payment.findFirst({
    where: { id: paymentId, reversedAt: null, invoice: { clinicId } },
    include: { invoice: true },
  });

  if (!payment) return fail("That payment was not found.");

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { reversedAt: new Date(), reversedReason: reason },
    });

    const paid = Number(payment.invoice.paid) - Number(payment.amount);

    await tx.invoice.update({
      where: { id: payment.invoiceId },
      data: {
        paid,
        status:
          paid <= 0
            ? "ISSUED"
            : paid >= Number(payment.invoice.total)
              ? "PAID"
              : "PARTIALLY_PAID",
      },
    });
  });

  await audit({
    action: "payment.reverse",
    entityType: "Invoice",
    entityId: payment.invoiceId,
    before: { amount: Number(payment.amount), mode: payment.mode },
    after: { reason },
  });

  revalidatePath("/reports");
  if (payment.invoice.visitId) {
    revalidatePath(`/visits/${payment.invoice.visitId}/bill`);
  }

  return done("Payment reversed.");
}

// ---------------------------------------------------------------
// Settings
// ---------------------------------------------------------------

export async function saveClinic(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const clinicId = await currentClinicId();

  const name = requireText(formData.get("name"), "Clinic name", 120);
  if (isError(name)) return fail(name.error);

  const phone = requirePhone(formData.get("phone"));
  if (isError(phone)) return fail(phone.error);

  await db.clinic.update({
    where: { id: clinicId },
    data: {
      name: name.value,
      phone: phone.value,
      address: String(formData.get("address") ?? "").trim(),
      city: String(formData.get("city") ?? "").trim(),
      registrationNo: text(formData, "registrationNo"),
      gstin: text(formData, "gstin"),
    },
  });

  revalidatePath("/settings");
  return done("Clinic details saved.");
}

export async function addService(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const clinicId = await currentClinicId();

  const name = requireText(formData.get("name"), "Service name", 120);
  if (isError(name)) return fail(name.error);

  const price = optionalNumber(formData.get("price"), "Price", {
    min: 0,
    max: 10_000_000,
  });
  if (isError(price)) return fail(price.error);
  if (price.value === null) return fail("Price is required.");

  const existing = await db.service.findFirst({
    where: { clinicId, name: name.value, deletedAt: null },
  });

  if (existing) return fail("You already have a service with that name.");

  await db.service.create({
    data: {
      clinicId,
      name: name.value,
      price: price.value,
      gstRate: Number(formData.get("gstRate") ?? 0) || 0,
    },
  });

  revalidatePath("/settings");
  return done("Service added.");
}

export async function updateServicePrice(
  serviceId: string,
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const clinicId = await currentClinicId();

  const price = optionalNumber(formData.get("price"), "Price", { min: 0 });
  if (isError(price)) return fail(price.error);
  if (price.value === null) return fail("Price is required.");

  // updateMany so the clinicId filter applies.
  const updated = await db.service.updateMany({
    where: { id: serviceId, clinicId },
    data: { price: price.value },
  });

  if (updated.count === 0) return fail("That service was not found.");

  revalidatePath("/settings");
  return done("Price updated. Bills already issued are unchanged.");
}

export async function retireService(serviceId: string) {
  const clinicId = await currentClinicId();

  // Deactivated, not deleted — old invoices still reference it.
  await db.service.updateMany({
    where: { id: serviceId, clinicId },
    data: { active: false },
  });

  revalidatePath("/settings");
}

export async function addStaff(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireSession();
  const clinicId = await currentClinicId();

  if (session.role !== "OWNER") {
    return fail("Only the clinic owner can add staff.");
  }

  const name = requireText(formData.get("name"), "Name", 120);
  if (isError(name)) return fail(name.error);

  const phone = requirePhone(formData.get("phone"));
  if (isError(phone)) return fail(phone.error);

  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return fail("The password needs at least 8 characters.");
  }

  const clash = await db.staff.findFirst({
    where: { clinicId, phone: phone.value },
  });

  if (clash) return fail("Someone already signs in with that number.");

  await db.staff.create({
    data: {
      clinicId,
      name: name.value,
      phone: phone.value,
      role: String(formData.get("role") ?? "RECEPTIONIST") as
        | "OWNER"
        | "DOCTOR"
        | "RECEPTIONIST"
        | "ASSISTANT",
      passwordHash: hashPassword(password),
      passwordSetByOwner: true,
      qualification: text(formData, "qualification"),
      registrationNo: text(formData, "registrationNo"),
    },
  });

  revalidatePath("/settings");
  return done("Staff member added.");
}

export async function deactivateStaff(staffId: string) {
  const session = await requireSession();
  const clinicId = await currentClinicId();

  if (session.role !== "OWNER") return;
  if (staffId === session.staffId) return; // cannot lock yourself out

  await db.staff.updateMany({
    where: { id: staffId, clinicId },
    data: { active: false },
  });

  revalidatePath("/settings");
}

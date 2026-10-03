// app/export/route.ts
//
// Data export. "What happens to my patient records if I stop paying you?"
// is the first question a careful clinic owner asks, and the honest answer
// has to be a working download, not a promise.
//
//   /export?type=patients    CSV
//   /export?type=visits      CSV
//   /export?type=invoices    CSV
//   /export?type=payments    CSV
//   /export?type=full        JSON — everything, for a real backup
//
// Owners and doctors only. Every export is audited: a full dump of a
// clinic's patient list is exactly the event you want a record of.

import { db } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { audit } from "@/lib/audit";

function csv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);

  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";

    const s = v instanceof Date ? v.toISOString() : String(v);

    // Excel interprets a leading =, +, - or @ as a formula. Prefix with
    // a quote so a patient named "=cmd" cannot become a spreadsheet
    // injection in whoever opens this.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;

    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };

  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

function file(body: string, name: string, mime: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": `${mime}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${name}"`,
      // Never let a proxy or the browser cache patient data.
      "Cache-Control": "no-store, private",
    },
  });
}

export async function GET(req: Request) {
  const session = await requireSession();

  if (session.role !== "OWNER" && session.role !== "DOCTOR") {
    return new Response("Only the owner or a doctor can export data.", {
      status: 403,
    });
  }

  const clinicId = session.clinicId;
  const type = new URL(req.url).searchParams.get("type") ?? "patients";
  const stamp = new Date().toISOString().slice(0, 10);

  await audit({
    action: `export.${type}`,
    entityType: "Clinic",
    entityId: clinicId,
  });

  if (type === "patients") {
    const rows = await db.patient.findMany({
      where: { clinicId, deletedAt: null },
      orderBy: { code: "asc" },
    });

    return file(
      csv(
        rows.map((p) => ({
          code: p.code,
          name: p.name,
          phone: p.phone,
          age: p.ageAtRegistration,
          dob: p.dob,
          gender: p.gender,
          address: p.address,
          city: p.city,
          allergies: p.allergies,
          conditions: p.conditions,
          marketing_consent: p.marketingConsent,
          registered: p.createdAt,
        }))
      ),
      `patients-${stamp}.csv`,
      "text/csv"
    );
  }

  if (type === "visits") {
    const rows = await db.visit.findMany({
      where: { clinicId, deletedAt: null },
      orderBy: { startedAt: "desc" },
      include: {
        patient: { select: { code: true, name: true } },
        doctor: { select: { name: true } },
        prescription: { include: { items: true } },
      },
    });

    return file(
      csv(
        rows.map((v) => ({
          date: v.startedAt,
          patient_code: v.patient.code,
          patient_name: v.patient.name,
          doctor: v.doctor.name,
          complaint: v.chiefComplaint,
          examination: v.examination,
          diagnosis: v.diagnosis,
          advice: v.advice,
          follow_up: v.followUpDate,
          prescription: v.prescription?.items
            .map(
              (i) =>
                `${i.drugName} ${i.strength ?? ""} ${i.dosage ?? ""} ${
                  i.durationDays ? `${i.durationDays}d` : ""
                }`.trim()
            )
            .join(" | "),
        }))
      ),
      `visits-${stamp}.csv`,
      "text/csv"
    );
  }

  if (type === "invoices") {
    const rows = await db.invoice.findMany({
      where: { clinicId },
      orderBy: { number: "asc" },
      include: {
        patient: { select: { code: true, name: true } },
        lines: true,
      },
    });

    return file(
      csv(
        rows.map((i) => ({
          number: i.number,
          date: i.issuedAt,
          patient_code: i.patient.code,
          patient_name: i.patient.name,
          items: i.lines
            .map((l) => `${l.description} x${l.quantity}`)
            .join(" | "),
          subtotal: Number(i.subtotal),
          discount: Number(i.discount),
          gst: Number(i.taxTotal),
          total: Number(i.total),
          paid: Number(i.paid),
          status: i.status,
          cancelled_reason: i.cancelledReason,
        }))
      ),
      `invoices-${stamp}.csv`,
      "text/csv"
    );
  }

  if (type === "payments") {
    const rows = await db.payment.findMany({
      where: { invoice: { clinicId } },
      orderBy: { receivedAt: "desc" },
      include: {
        invoice: {
          select: {
            number: true,
            patient: { select: { code: true, name: true } },
          },
        },
      },
    });

    return file(
      csv(
        rows.map((p) => ({
          received: p.receivedAt,
          invoice: p.invoice.number,
          patient_code: p.invoice.patient.code,
          patient_name: p.invoice.patient.name,
          amount: Number(p.amount),
          mode: p.mode,
          reference: p.reference,
          reversed: p.reversedAt,
          reversed_reason: p.reversedReason,
        }))
      ),
      `payments-${stamp}.csv`,
      "text/csv"
    );
  }

  if (type === "full") {
    // Everything, structured, for an actual backup or a migration to
    // another system. Deliberately includes the audit log.
    const [clinic, staff, patients, appointments, visits, services, invoices, auditLogs] =
      await Promise.all([
        db.clinic.findUnique({ where: { id: clinicId } }),
        db.staff.findMany({
          where: { clinicId },
          // Never export password hashes.
          select: {
            id: true,
            name: true,
            phone: true,
            role: true,
            qualification: true,
            registrationNo: true,
            active: true,
          },
        }),
        db.patient.findMany({ where: { clinicId } }),
        db.appointment.findMany({ where: { clinicId } }),
        db.visit.findMany({
          where: { clinicId },
          include: { prescription: { include: { items: true } } },
        }),
        db.service.findMany({ where: { clinicId } }),
        db.invoice.findMany({
          where: { clinicId },
          include: { lines: true, payments: true },
        }),
        db.auditLog.findMany({
          where: { clinicId },
          orderBy: { createdAt: "desc" },
          take: 10_000,
        }),
      ]);

    const dump = {
      exportedAt: new Date().toISOString(),
      exportedBy: session.name,
      schemaNote:
        "Full export from clinic-ms. Decimal fields are strings; dates are ISO 8601 UTC.",
      clinic,
      staff,
      patients,
      appointments,
      visits,
      services,
      invoices,
      auditLogs,
    };

    return file(
      JSON.stringify(dump, null, 2),
      `clinic-backup-${stamp}.json`,
      "application/json"
    );
  }

  return new Response("Unknown export type.", { status: 400 });
}

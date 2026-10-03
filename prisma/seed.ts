// prisma/seed.ts
//
// One clinic, three staff, a price list, six patients, and a plausible
// day of appointments — so a demo opens on a screen that looks alive.
//
// Run: npm run db:seed

import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const db = new PrismaClient();

// Same algorithm as lib/auth.ts. Duplicated because the seed runs
// outside Next and importing the app's module pulls in next/headers.
function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// Today at a given IST hour, as a real instant.
function todayAt(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

function tomorrowAt(hour: number, minute = 0): Date {
  const d = todayAt(hour, minute);
  d.setDate(d.getDate() + 1);
  return d;
}

const DEMO_PASSWORD = "clinic123";

async function main() {
  console.log("seeding...");

  const clinic = await db.clinic.create({
    data: {
      name: "Sharma Dental Care",
      phone: "9810000000",
      address: "12 Ring Road, Lajpat Nagar IV",
      city: "New Delhi",
      registrationNo: "DL/CE/2019/4421",
    },
  });

  const [drSharma, drKhan] = await Promise.all([
    db.staff.create({
      data: {
        clinicId: clinic.id,
        name: "Dr. Anil Sharma",
        phone: "9810000001",
        role: "OWNER",
        qualification: "BDS, MDS (Prosthodontics)",
        registrationNo: "DCI-A-14882",
        specialisation: "Prosthodontics",
        passwordHash: hashPassword(DEMO_PASSWORD),
      },
    }),
    db.staff.create({
      data: {
        clinicId: clinic.id,
        name: "Dr. Sana Khan",
        phone: "9810000002",
        role: "DOCTOR",
        qualification: "BDS",
        registrationNo: "DCI-A-20913",
        specialisation: "General dentistry",
        passwordHash: hashPassword(DEMO_PASSWORD),
      },
    }),
  ]);

  await db.staff.create({
    data: {
      clinicId: clinic.id,
      name: "Priya Nair",
      phone: "9810000003",
      role: "RECEPTIONIST",
      passwordHash: hashPassword(DEMO_PASSWORD),
    },
  });

  await db.service.createMany({
    data: [
      { clinicId: clinic.id, name: "Consultation", price: 300 },
      { clinicId: clinic.id, name: "Scaling and polishing", price: 1500 },
      { clinicId: clinic.id, name: "Tooth filling", price: 1200 },
      { clinicId: clinic.id, name: "Root canal (single sitting)", price: 6000 },
      { clinicId: clinic.id, name: "Tooth extraction", price: 1000 },
      { clinicId: clinic.id, name: "X-ray (IOPA)", price: 200 },
    ],
  });

  const people = [
    { name: "Ramesh Gupta", phone: "9811111111", age: 54, gender: "MALE" as const, allergies: "Penicillin", consent: true },
    { name: "Sunita Verma", phone: "9811111112", age: 38, gender: "FEMALE" as const, consent: true },
    { name: "Arjun Mehta", phone: "9811111113", age: 27, gender: "MALE" as const, consent: true },
    { name: "Fatima Sheikh", phone: "9811111114", age: 61, gender: "FEMALE" as const, conditions: "Diabetes", consent: false },
    { name: "Karan Bhatia", phone: "9811111115", age: 9, gender: "MALE" as const, consent: true },
    { name: "Meera Iyer", phone: "9811111116", age: 44, gender: "FEMALE" as const, consent: true },
  ];

  const patients = [];

  for (let i = 0; i < people.length; i++) {
    const p = people[i];

    patients.push(
      await db.patient.create({
        data: {
          clinicId: clinic.id,
          code: `P-${String(i + 1).padStart(4, "0")}`,
          name: p.name,
          phone: p.phone,
          ageAtRegistration: p.age,
          gender: p.gender,
          allergies: p.allergies ?? null,
          conditions: p.conditions ?? null,
          city: "New Delhi",
          consentGivenAt: new Date(),
          marketingConsent: p.consent,
        },
      })
    );
  }

  // A plausible morning: two done, one in progress, one waiting, two ahead.
  const slots = [
    { patient: 0, doctor: drSharma.id, hour: 10, minute: 0, status: "COMPLETED" as const, reason: "Follow-up, crown fitting" },
    { patient: 1, doctor: drKhan.id, hour: 10, minute: 30, status: "COMPLETED" as const, reason: "Scaling" },
    { patient: 2, doctor: drSharma.id, hour: 11, minute: 0, status: "IN_PROGRESS" as const, reason: "Pain upper left" },
    { patient: 3, doctor: drKhan.id, hour: 11, minute: 30, status: "ARRIVED" as const, reason: "Routine check" },
    { patient: 4, doctor: drKhan.id, hour: 12, minute: 0, status: "SCHEDULED" as const, reason: "Cavity, milk tooth" },
    { patient: 5, doctor: drSharma.id, hour: 16, minute: 30, status: "SCHEDULED" as const, reason: "Root canal, sitting 2" },
  ];

  for (const slot of slots) {
    await db.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: patients[slot.patient].id,
        doctorId: slot.doctor,
        scheduledAt: todayAt(slot.hour, slot.minute),
        status: slot.status,
        reason: slot.reason,
        source: "PHONE",
        arrivedAt:
          slot.status === "SCHEDULED" ? null : todayAt(slot.hour, slot.minute - 8),
      },
    });
  }

  // Tomorrow, so the reminders screen has something to show. One of these
  // patients has no marketing consent, which is the point.
  await db.appointment.createMany({
    data: [
      {
        clinicId: clinic.id,
        patientId: patients[0].id,
        doctorId: drSharma.id,
        scheduledAt: tomorrowAt(10, 0),
        reason: "Crown review",
        source: "PHONE",
      },
      {
        clinicId: clinic.id,
        patientId: patients[3].id,
        doctorId: drKhan.id,
        scheduledAt: tomorrowAt(11, 0),
        reason: "Cleaning",
        source: "WALK_IN",
      },
      {
        clinicId: clinic.id,
        patientId: patients[5].id,
        doctorId: drSharma.id,
        scheduledAt: tomorrowAt(17, 0),
        reason: "Root canal, sitting 3",
        source: "PHONE",
      },
    ],
  });

  // One completed visit with a prescription and a paid bill, so the
  // patient history and collection report are not empty in a demo.
  const visit = await db.visit.create({
    data: {
      clinicId: clinic.id,
      patientId: patients[0].id,
      doctorId: drSharma.id,
      startedAt: todayAt(10, 5),
      endedAt: todayAt(10, 25),
      chiefComplaint: "Crown feels loose on upper right",
      examination: "Crown 16 mobile, margins intact, no caries",
      diagnosis: "Decemented crown 16",
      advice: "Avoid hard food on that side for 48 hours",
      followUpDate: tomorrowAt(10, 0),
    },
  });

  await db.prescription.create({
    data: {
      visitId: visit.id,
      doctorId: drSharma.id,
      instructions: "Complete the full course",
      items: {
        create: [
          { drugName: "Amoxicillin", strength: "500mg", dosage: "1-0-1", durationDays: 5, timing: "After food" },
          { drugName: "Paracetamol", strength: "650mg", dosage: "1-1-1", durationDays: 3, timing: "If pain" },
        ],
      },
    },
  });

  const consultation = await db.service.findFirst({
    where: { clinicId: clinic.id, name: "Consultation" },
  });

  if (consultation) {
    const invoice = await db.invoice.create({
      data: {
        clinicId: clinic.id,
        patientId: patients[0].id,
        visitId: visit.id,
        number: `INV/${new Date().getFullYear()}-${String(
          (new Date().getFullYear() + 1) % 100
        ).padStart(2, "0")}/0001`,
        subtotal: 300,
        total: 300,
        paid: 300,
        status: "PAID",
        issuedAt: todayAt(10, 30),
        lines: {
          create: [
            {
              serviceId: consultation.id,
              description: "Consultation",
              quantity: 1,
              unitPrice: 300,
              amount: 300,
            },
          ],
        },
      },
    });

    await db.payment.create({
      data: {
        invoiceId: invoice.id,
        amount: 300,
        mode: "UPI",
        reference: "4299183772",
        receivedAt: todayAt(10, 31),
      },
    });
  }

  console.log(`
seeded ${clinic.name}

  sign in with any of these:
    9810000001   Dr. Anil Sharma  (owner)
    9810000002   Dr. Sana Khan    (doctor)
    9810000003   Priya Nair       (receptionist)

  password for all three: ${DEMO_PASSWORD}
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

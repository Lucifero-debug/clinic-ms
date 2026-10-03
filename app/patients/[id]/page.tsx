// app/patients/[id]/page.tsx
//
// "Find a returning patient's history in under ten seconds" is one of the
// three things clinics actually pay for. Allergies sit at the top, always.
//
// Opening a patient record is an audited event. That is the point of an
// audit log — reads matter as much as writes for health data.

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentClinicId } from "@/lib/session";
import { audit } from "@/lib/audit";
import { age, date, dateTime, rupees, time } from "@/lib/format";
import { Panel, btnPrimary, btnQuiet } from "@/app/ui";

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clinicId = await currentClinicId();

  // Scoped by clinicId — an id from the URL is never trusted on its own.
  const patient = await db.patient.findFirst({
    where: { id, clinicId, deletedAt: null },
    include: {
      visits: {
        where: { deletedAt: null },
        orderBy: { startedAt: "desc" },
        include: {
          doctor: { select: { name: true } },
          prescription: { include: { items: true } },
        },
      },
      appointments: {
        where: { cancelledAt: null, scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: "asc" },
        include: { doctor: { select: { name: true } } },
      },
      invoices: { where: { cancelledAt: null }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!patient) notFound();

  await audit({
    action: "patient.view",
    entityType: "Patient",
    entityId: patient.id,
  });

  const due = patient.invoices.reduce(
    (s, i) => s + (Number(i.total) - Number(i.paid)),
    0
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <div className="text-xs text-[var(--color-faint)]">{patient.code}</div>

        <div className="mt-0.5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">
              {patient.name}
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {age(patient.dob, patient.ageAtRegistration)}
              {patient.gender ? ` · ${patient.gender.toLowerCase()}` : ""} ·{" "}
              {patient.phone}
              {patient.city ? ` · ${patient.city}` : ""}
              {patient.marketingConsent ? "" : " · no reminder consent"}
            </p>
          </div>

          <div className="flex gap-2">
            <Link href={`/patients/${patient.id}/edit`} className={btnQuiet}>
              Edit
            </Link>
            <Link
              href={`/appointments/new?patient=${patient.id}`}
              className={btnPrimary}
            >
              Book appointment
            </Link>
          </div>
        </div>
      </div>

      {patient.allergies && (
        <div className="mb-4 rounded-md border-y border-r border-l-4 border-[var(--color-line)] border-l-[var(--color-missed)] bg-[var(--color-panel)] px-3 py-2 text-sm">
          <span className="font-medium text-[var(--color-missed)]">
            Allergies
          </span>{" "}
          — {patient.allergies}
        </div>
      )}

      {(patient.conditions || due > 0 || patient.address) && (
        <Panel className="mb-6 divide-y divide-[var(--color-line)] text-sm">
          {patient.conditions && (
            <Detail label="Conditions">{patient.conditions}</Detail>
          )}
          {patient.address && (
            <Detail label="Address">{patient.address}</Detail>
          )}
          {due > 0 && (
            <Detail label="Outstanding">
              <span className="font-medium text-[var(--color-missed)]">
                {rupees(due)}
              </span>
            </Detail>
          )}
        </Panel>
      )}

      {patient.appointments.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold">Upcoming</h2>
          <Panel className="divide-y divide-[var(--color-line)] text-sm">
            {patient.appointments.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap justify-between gap-2 px-4 py-2"
              >
                <span>
                  {date(a.scheduledAt)} at {time(a.scheduledAt)}
                  {a.reason ? ` · ${a.reason}` : ""}
                </span>
                <span className="text-[var(--color-muted)]">
                  {a.doctor.name}
                  <Link
                    href={`/appointments/${a.id}`}
                    className="ml-3 text-[var(--color-accent)] underline underline-offset-2"
                  >
                    Move or cancel
                  </Link>
                </span>
              </div>
            ))}
          </Panel>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold">Visit history</h2>

        {patient.visits.length === 0 ? (
          <Panel className="p-8 text-center text-sm text-[var(--color-muted)]">
            No visits recorded yet.
          </Panel>
        ) : (
          <ol className="space-y-3">
            {patient.visits.map((v) => (
              <li key={v.id}>
                <Panel className="p-4 text-sm">
                  <div className="mb-2 flex justify-between text-xs text-[var(--color-muted)]">
                    <span>{dateTime(v.startedAt)}</span>
                    <span>
                      {v.doctor.name}
                      {v.endedAt ? "" : " · in progress"}
                      {v.amendedAt ? " · amended" : ""}
                    </span>
                  </div>

                  {v.chiefComplaint && (
                    <Line label="Complaint" value={v.chiefComplaint} />
                  )}
                  {v.diagnosis && <Line label="Diagnosis" value={v.diagnosis} />}
                  {v.advice && <Line label="Advice" value={v.advice} />}

                  {v.prescription && v.prescription.items.length > 0 && (
                    <div className="mt-2 border-t border-[var(--color-line)] pt-2">
                      {v.prescription.items.map((item) => (
                        <div key={item.id} className="text-xs">
                          {item.drugName}
                          {item.strength ? ` ${item.strength}` : ""}
                          {item.dosage ? ` · ${item.dosage}` : ""}
                          {item.durationDays ? ` · ${item.durationDays}d` : ""}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-2 flex gap-3 text-xs">
                    <Link
                      href={`/visits/${v.id}`}
                      className="text-[var(--color-accent)] underline underline-offset-2"
                    >
                      Open
                    </Link>
                    {v.prescription && (
                      <Link
                        href={`/visits/${v.id}/prescription`}
                        className="text-[var(--color-accent)] underline underline-offset-2"
                      >
                        Prescription
                      </Link>
                    )}
                    <Link
                      href={`/visits/${v.id}/bill`}
                      className="text-[var(--color-accent)] underline underline-offset-2"
                    >
                      Bill
                    </Link>
                  </div>
                </Panel>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 px-4 py-2">
      <span className="w-28 shrink-0 text-xs text-[var(--color-muted)]">
        {label}
      </span>
      <span>{children}</span>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex gap-3">
      <span className="w-20 shrink-0 text-xs text-[var(--color-muted)]">
        {label}
      </span>
      <span>{value}</span>
    </p>
  );
}

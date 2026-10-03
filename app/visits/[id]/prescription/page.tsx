// app/visits/[id]/prescription/page.tsx — printable prescription
//
// This gets printed on paper every single time. Laid out for A5 portrait,
// which is what most Indian clinics use, and still fine on A4.
//
// Legally this must carry the doctor's name, qualification and registration
// number — see CONTEXT.md section 7. Do not remove them from the footer.

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentClinicId } from "@/lib/session";
import { age, date } from "@/lib/format";
import { PrintButton } from "@/app/print-button";

export default async function PrescriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clinicId = await currentClinicId();

  const visit = await db.visit.findFirst({
    where: { id, clinicId, deletedAt: null },
    include: {
      clinic: true,
      patient: true,
      doctor: true,
      prescription: { include: { items: true } },
    },
  });

  if (!visit) notFound();

  const { clinic, patient, doctor, prescription } = visit;

  return (
    <div className="mx-auto max-w-[148mm] text-sm print:max-w-none">
      <div className="no-print mb-4 flex gap-3">
        <PrintButton />
        <Link
          href={`/visits/${visit.id}`}
          className="rounded border border-[var(--color-line)] px-3 py-1.5 text-sm hover:bg-[var(--color-surface)]"
        >
          Back to consultation
        </Link>
      </div>

      <article className="border border-[var(--color-line)] p-6 print:border-0 print:p-0">
        <header className="border-b border-[var(--color-ink)] pb-3">
          <h1 className="text-lg font-semibold tracking-tight">{clinic.name}</h1>
          <p className="text-xs text-[var(--color-muted)]">
            {clinic.address}, {clinic.city} · {clinic.phone}
            {clinic.registrationNo ? ` · Reg. ${clinic.registrationNo}` : ""}
          </p>
        </header>

        <div className="flex justify-between border-b border-[var(--color-line)] py-3 text-xs">
          <div>
            <div className="text-sm font-medium">{patient.name}</div>
            <div className="text-[var(--color-muted)]">
              {patient.code} · {age(patient.dob, patient.ageAtRegistration)}
              {patient.gender ? ` · ${patient.gender.toLowerCase()}` : ""}
            </div>
          </div>
          <div className="text-right text-[var(--color-muted)]">
            {date(visit.startedAt)}
          </div>
        </div>

        {patient.allergies && (
          <p className="mt-3 border border-[var(--color-missed)] px-2 py-1 text-xs">
            <span className="font-semibold">Allergies:</span>{" "}
            {patient.allergies}
          </p>
        )}

        {visit.diagnosis && (
          <p className="mt-3 text-xs">
            <span className="text-[var(--color-muted)]">Diagnosis</span>{" "}
            {visit.diagnosis}
          </p>
        )}

        <div className="mt-4">
          <div className="mb-2 text-2xl leading-none">℞</div>

          {!prescription || prescription.items.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">
              No medicines prescribed.
            </p>
          ) : (
            <ol className="space-y-2">
              {prescription.items.map((item, i) => (
                <li key={item.id} className="flex gap-2">
                  <span className="w-4 shrink-0 text-[var(--color-muted)]">
                    {i + 1}.
                  </span>
                  <div>
                    <div className="font-medium">
                      {item.drugName}
                      {item.strength ? ` ${item.strength}` : ""}
                    </div>
                    <div className="text-xs text-[var(--color-muted)]">
                      {[
                        item.dosage,
                        item.durationDays ? `${item.durationDays} days` : null,
                        item.timing,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {prescription?.instructions && (
            <p className="mt-3 text-xs">{prescription.instructions}</p>
          )}
        </div>

        {visit.advice && (
          <p className="mt-4 text-xs">
            <span className="text-[var(--color-muted)]">Advice</span>{" "}
            {visit.advice}
          </p>
        )}

        {visit.followUpDate && (
          <p className="mt-2 text-xs font-medium">
            Follow-up on {date(visit.followUpDate)}
          </p>
        )}

        <footer className="mt-10 flex justify-end">
          <div className="min-w-48 border-t border-[var(--color-ink)] pt-1 text-right text-xs">
            <div className="font-medium">{doctor.name}</div>
            <div className="text-[var(--color-muted)]">
              {doctor.qualification}
            </div>
            <div className="text-[var(--color-muted)]">
              Reg. No. {doctor.registrationNo ?? "—"}
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}

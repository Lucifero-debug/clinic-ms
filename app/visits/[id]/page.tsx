// app/visits/[id]/page.tsx — the consultation screen
//
// This has to be FASTER THAN PAPER or the doctor will stop using it. That
// is the main reason clinic software fails. Everything is on one screen,
// one form, one save. No tabs, no wizard, no modals.
//
// Prescription rows are a fixed set of eight inputs rather than a dynamic
// "add row" control, because that needs client JS and tabbing through
// static inputs is faster anyway.

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentClinicId } from "@/lib/session";
import { saveVisit } from "@/lib/actions";
import { age, date, dateTime } from "@/lib/format";
import { Form, Submit } from "@/app/form";
import { input, label } from "@/app/ui";

export default async function VisitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clinicId = await currentClinicId();

  const visit = await db.visit.findFirst({
    where: { id, clinicId, deletedAt: null },
    include: {
      patient: true,
      doctor: { select: { name: true } },
      prescription: { include: { items: true } },
    },
  });

  if (!visit) notFound();

  const p = visit.patient;

  const previous = await db.visit.findMany({
    where: {
      clinicId,
      patientId: p.id,
      deletedAt: null,
      endedAt: { not: null },
      id: { not: visit.id },
    },
    orderBy: { startedAt: "desc" },
    take: 3,
  });

  const rx = visit.prescription?.items ?? [];
  const save = saveVisit.bind(null, visit.id);

  return (
    <div className="mx-auto max-w-4xl">
      {/* Patient header. Allergies are impossible to miss, by design. */}
      <div className="mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">
            <Link href={`/patients/${p.id}`} className="hover:underline">
              {p.name}
            </Link>
          </h1>
          <span className="text-sm text-[var(--color-muted)]">
            {visit.doctor.name} · {dateTime(visit.startedAt)}
          </span>
        </div>

        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {p.code} · {age(p.dob, p.ageAtRegistration)}
          {p.gender ? ` · ${p.gender.toLowerCase()}` : ""} · {p.phone}
          {p.conditions ? ` · ${p.conditions}` : ""}
        </p>
      </div>

      {p.allergies && (
        <div className="mb-4 rounded-md border-y border-r border-l-4 border-[var(--color-line)] border-l-[var(--color-missed)] bg-[var(--color-panel)] px-3 py-2 text-sm">
          <span className="font-medium text-[var(--color-missed)]">
            Allergies
          </span>{" "}
          — {p.allergies}
        </div>
      )}

      {previous.length > 0 && (
        <details className="mb-5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2 text-sm">
          <summary className="cursor-pointer text-[var(--color-muted)]">
            Last {previous.length} visit{previous.length > 1 ? "s" : ""}
          </summary>
          <ul className="mt-2 space-y-2">
            {previous.map((v) => (
              <li key={v.id}>
                <span className="text-xs text-[var(--color-muted)]">
                  {date(v.startedAt)}
                </span>
                <div>{v.diagnosis ?? v.chiefComplaint ?? "No note"}</div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Form action={save} className="space-y-5">
        {/* --- clinical notes --- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="chiefComplaint" className={label}>
              Complaint
            </label>
            <textarea
              id="chiefComplaint"
              name="chiefComplaint"
              rows={3}
              autoFocus
              defaultValue={visit.chiefComplaint ?? ""}
              className={`mt-1 ${input}`}
            />
          </div>

          <div>
            <label htmlFor="examination" className={label}>
              Examination
            </label>
            <textarea
              id="examination"
              name="examination"
              rows={3}
              defaultValue={visit.examination ?? ""}
              className={`mt-1 ${input}`}
            />
          </div>

          <div>
            <label htmlFor="diagnosis" className={label}>
              Diagnosis
            </label>
            <textarea
              id="diagnosis"
              name="diagnosis"
              rows={2}
              defaultValue={visit.diagnosis ?? ""}
              className={`mt-1 ${input}`}
            />
          </div>

          <div>
            <label htmlFor="advice" className={label}>
              Advice
            </label>
            <textarea
              id="advice"
              name="advice"
              rows={2}
              defaultValue={visit.advice ?? ""}
              className={`mt-1 ${input}`}
            />
          </div>
        </div>

        {/* --- vitals --- */}
        <details className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2">
          <summary className="cursor-pointer text-sm text-[var(--color-muted)]">
            Vitals
          </summary>

          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-7">
            {[
              { name: "heightCm", text: "Ht cm", value: visit.heightCm },
              { name: "weightKg", text: "Wt kg", value: visit.weightKg },
              { name: "bpSystolic", text: "BP sys", value: visit.bpSystolic },
              { name: "bpDiastolic", text: "BP dia", value: visit.bpDiastolic },
              { name: "pulse", text: "Pulse", value: visit.pulse },
              { name: "tempC", text: "Temp C", value: visit.tempC },
              { name: "spo2", text: "SpO2", value: visit.spo2 },
            ].map((v) => (
              <div key={v.name}>
                <label htmlFor={v.name} className={label}>
                  {v.text}
                </label>
                <input
                  id={v.name}
                  name={v.name}
                  inputMode="decimal"
                  defaultValue={v.value ?? ""}
                  className="mt-1 w-full rounded-md border border-[var(--color-line)] px-2 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>
        </details>

        {/* --- prescription --- */}
        <div>
          <h2 className="mb-2 text-sm font-semibold">Prescription</h2>

          <div className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)]">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-line)] bg-[var(--color-surface)] text-left text-xs text-[var(--color-muted)]">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Medicine</th>
                  <th className="px-2 py-1.5 font-medium">Strength</th>
                  <th className="px-2 py-1.5 font-medium">Dosage</th>
                  <th className="px-2 py-1.5 font-medium">Days</th>
                  <th className="px-2 py-1.5 font-medium">Timing</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, i) => {
                  const item = rx[i];
                  const cell =
                    "w-full border-0 bg-transparent px-2 py-1.5 text-sm focus:bg-[var(--color-surface)]";

                  return (
                    <tr
                      key={i}
                      className="border-b border-[var(--color-line)] last:border-0"
                    >
                      <td>
                        <input
                          name={`drug${i}`}
                          defaultValue={item?.drugName ?? ""}
                          className={cell}
                          aria-label={`Medicine ${i + 1}`}
                        />
                      </td>
                      <td>
                        <input
                          name={`strength${i}`}
                          placeholder="500mg"
                          defaultValue={item?.strength ?? ""}
                          className={cell}
                          aria-label={`Strength ${i + 1}`}
                        />
                      </td>
                      <td>
                        <input
                          name={`dosage${i}`}
                          placeholder="1-0-1"
                          defaultValue={item?.dosage ?? ""}
                          className={cell}
                          aria-label={`Dosage ${i + 1}`}
                        />
                      </td>
                      <td>
                        <input
                          name={`days${i}`}
                          inputMode="numeric"
                          defaultValue={item?.durationDays ?? ""}
                          className={cell}
                          aria-label={`Days ${i + 1}`}
                        />
                      </td>
                      <td>
                        <input
                          name={`timing${i}`}
                          placeholder="After food"
                          defaultValue={item?.timing ?? ""}
                          className={cell}
                          aria-label={`Timing ${i + 1}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-1 text-xs text-[var(--color-faint)]">
            Free text. There is no drug database and no interaction checking
            — see CONTEXT.md section 3.
          </p>

          <div className="mt-3">
            <label htmlFor="instructions" className={label}>
              General instructions
            </label>
            <input
              id="instructions"
              name="instructions"
              defaultValue={visit.prescription?.instructions ?? ""}
              className={`mt-1 ${input}`}
            />
          </div>
        </div>

        <div className="max-w-xs">
          <label htmlFor="followUpDate" className={label}>
            Follow-up date
          </label>
          <input
            id="followUpDate"
            name="followUpDate"
            type="date"
            defaultValue={
              visit.followUpDate
                ? visit.followUpDate.toISOString().slice(0, 10)
                : ""
            }
            className={`mt-1 ${input}`}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-line)] pt-4">
          <Submit
            name="complete"
            value="yes"
            pendingLabel="Saving…"
            className="inline-flex items-center rounded-md bg-[var(--color-accent)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[var(--color-accent-ink)]"
          >
            Save and go to billing
          </Submit>

          <Submit
            name="complete"
            value="no"
            pendingLabel="Saving…"
            className="inline-flex items-center rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] px-3.5 py-2 text-sm font-medium hover:bg-[var(--color-surface)]"
          >
            Save and stay
          </Submit>

          {visit.prescription && (
            <Link
              href={`/visits/${visit.id}/prescription`}
              className="text-sm font-medium text-[var(--color-accent)] underline underline-offset-2"
            >
              Print prescription
            </Link>
          )}

          {visit.endedAt && (
            <span className="ml-auto text-xs text-[var(--color-faint)]">
              Closed {dateTime(visit.endedAt)} — further edits are recorded
              as amendments
            </span>
          )}
        </div>
      </Form>
    </div>
  );
}

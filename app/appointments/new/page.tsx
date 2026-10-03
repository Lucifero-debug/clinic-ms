// app/appointments/new/page.tsx
//
// Booking is a server-rendered form on purpose. A searchable patient
// combobox would be nicer but needs client JS; with up to a few thousand
// patients a native select plus the browser's own type-ahead is faster to
// use and loads instantly on a slow connection.
//
// Revisit this when a clinic crosses ~2000 patients.

import { db } from "@/lib/db";
import { currentClinicId } from "@/lib/session";
import { createAppointment } from "@/lib/actions";
import { Form, Submit } from "@/app/form";
import { Panel, PageHeader, Empty, input, label, btnPrimary } from "@/app/ui";

// Default the time field to the next half-hour, in IST wall-clock form
// that <input type="datetime-local"> understands.
function nextSlotLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30, 0, 0);

  const pad = (n: number) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient: preselect } = await searchParams;
  const clinicId = await currentClinicId();

  const [patients, doctors] = await Promise.all([
    db.patient.findMany({
      where: { clinicId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, phone: true },
    }),
    db.staff.findMany({
      where: { clinicId, role: "DOCTOR", active: true, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (patients.length === 0 || doctors.length === 0) {
    return (
      <div className="mx-auto max-w-lg">
        <Empty
          href={patients.length === 0 ? "/patients/new" : "/settings"}
          cta={patients.length === 0 ? "Register a patient" : "Add a doctor"}
        >
          {patients.length === 0
            ? "No patients on file yet."
            : "No doctors set up yet."}
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Book appointment" />

      <Panel className="p-5">
        <Form action={createAppointment} className="space-y-4">
          <div>
            <label htmlFor="patientId" className={label}>
              Patient
            </label>
            <select
              id="patientId"
              name="patientId"
              required
              autoFocus
              defaultValue={preselect ?? undefined}
              className={`mt-1 ${input}`}
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.phone} ({p.code})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--color-faint)]">
              Start typing the name to jump to it.
            </p>
          </div>

          <div>
            <label htmlFor="doctorId" className={label}>
              Doctor
            </label>
            <select
              id="doctorId"
              name="doctorId"
              required
              className={`mt-1 ${input}`}
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="scheduledAt" className={label}>
                Date and time
              </label>
              <input
                id="scheduledAt"
                name="scheduledAt"
                type="datetime-local"
                required
                defaultValue={nextSlotLocal()}
                className={`mt-1 ${input}`}
              />
            </div>

            <div>
              <label htmlFor="durationMin" className={label}>
                Minutes
              </label>
              <input
                id="durationMin"
                name="durationMin"
                type="number"
                min={5}
                step={5}
                defaultValue={15}
                className={`mt-1 ${input}`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="reason" className={label}>
              Reason
            </label>
            <input
              id="reason"
              name="reason"
              placeholder="Pain upper left, routine check…"
              className={`mt-1 ${input}`}
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-[var(--color-muted)]">
            <input type="checkbox" name="allowClash" className="mt-0.5" />
            <span>Book anyway if the doctor already has someone then.</span>
          </label>

          <Submit className={btnPrimary} pendingLabel="Booking…">
            Book appointment
          </Submit>
        </Form>
      </Panel>
    </div>
  );
}

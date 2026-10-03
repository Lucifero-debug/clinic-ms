// app/appointments/[id]/page.tsx — reschedule or cancel
//
// People ring up to move appointments constantly. Without this the only
// option is to cancel and rebook, which loses the reason and the history.

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentClinicId } from "@/lib/session";
import { rescheduleAppointment, cancelAppointment } from "@/lib/actions";
import { Form, Submit, ConfirmSubmit } from "@/app/form";
import { dateTime } from "@/lib/format";
import { Panel, PageHeader, input, label, btnPrimary } from "@/app/ui";

// A Date as the local wall-clock string datetime-local expects.
function localValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function AppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clinicId = await currentClinicId();

  const appointment = await db.appointment.findFirst({
    where: { id, clinicId },
    include: {
      patient: { select: { id: true, name: true, code: true, phone: true } },
      doctor: { select: { name: true } },
    },
  });

  if (!appointment) notFound();

  const reschedule = rescheduleAppointment.bind(null, appointment.id);
  const cancel = cancelAppointment.bind(null, appointment.id);

  const locked =
    appointment.status === "COMPLETED" || appointment.cancelledAt !== null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="Appointment"
        meta={`${appointment.patient.name} · ${appointment.doctor.name} · ${dateTime(
          appointment.scheduledAt
        )}`}
      />

      {locked ? (
        <Panel className="p-5 text-sm text-[var(--color-muted)]">
          {appointment.cancelledAt
            ? `Cancelled. ${appointment.cancelledReason ?? ""}`
            : "This consultation is already finished, so it cannot be moved."}
          <div className="mt-3">
            <Link
              href={`/patients/${appointment.patient.id}`}
              className="text-[var(--color-accent)] underline underline-offset-2"
            >
              Back to patient
            </Link>
          </div>
        </Panel>
      ) : (
        <>
          <Panel className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Move it</h2>

            <Form action={reschedule} className="space-y-3">
              <div>
                <label htmlFor="scheduledAt" className={label}>
                  New date and time
                </label>
                <input
                  id="scheduledAt"
                  name="scheduledAt"
                  type="datetime-local"
                  required
                  defaultValue={localValue(appointment.scheduledAt)}
                  className={`mt-1 ${input}`}
                />
                <p className="mt-1 text-xs text-[var(--color-faint)]">
                  Moving it clears any reminder already sent, so they get a
                  fresh one.
                </p>
              </div>

              <Submit className={btnPrimary} pendingLabel="Moving…">
                Save new time
              </Submit>
            </Form>
          </Panel>

          <Panel className="p-5">
            <h2 className="mb-3 text-sm font-semibold">Cancel it</h2>

            <Form action={cancel} className="space-y-3">
              <div>
                <label htmlFor="reason" className={label}>
                  Reason
                </label>
                <input
                  id="reason"
                  name="reason"
                  placeholder="Patient called to cancel"
                  className={`mt-1 ${input}`}
                />
              </div>

              <ConfirmSubmit
                message="Cancel this appointment?"
                className="inline-flex items-center rounded-md border border-[var(--color-missed)] px-3.5 py-2 text-sm font-medium text-[var(--color-missed)] hover:bg-[var(--color-missed)] hover:text-white"
              >
                Cancel appointment
              </ConfirmSubmit>
            </Form>
          </Panel>
        </>
      )}
    </div>
  );
}

// app/reminders/page.tsx
//
// "Fewer no-shows" is the first thing a clinic will pay for, so this
// screen has to make the gap visible: who is coming tomorrow, who has
// been reminded, and who cannot be reminded because they never consented.

import { db } from "@/lib/db";
import { currentClinicId } from "@/lib/session";
import { sendTomorrowReminders } from "@/lib/actions";
import { isConfigured } from "@/lib/whatsapp";
import { date, time } from "@/lib/format";
import { Panel, PageHeader, Empty, btnPrimary } from "@/app/ui";

export default async function RemindersPage() {
  const clinicId = await currentClinicId();

  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  const appointments = await db.appointment.findMany({
    where: {
      clinicId,
      scheduledAt: { gte: start, lte: end },
      cancelledAt: null,
      status: { in: ["SCHEDULED", "CONFIRMED"] },
    },
    orderBy: { scheduledAt: "asc" },
    include: {
      patient: {
        select: { name: true, phone: true, code: true, marketingConsent: true },
      },
      doctor: { select: { name: true } },
    },
  });

  const sendable = appointments.filter(
    (a) => a.patient.marketingConsent && !a.reminderSentAt
  );
  const sent = appointments.filter((a) => a.reminderSentAt);
  const blocked = appointments.filter((a) => !a.patient.marketingConsent);

  const configured = isConfigured();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Reminders"
        meta={`Appointments on ${date(start)}`}
        action={
          configured && sendable.length > 0 ? (
            <form action={sendTomorrowReminders}>
              <button className={btnPrimary}>
                Send {sendable.length} reminder
                {sendable.length > 1 ? "s" : ""}
              </button>
            </form>
          ) : null
        }
      />

      {!configured && (
        <Panel className="mb-5 border-[var(--color-waiting)] p-4">
          <p className="text-sm font-medium text-[var(--color-waiting)]">
            WhatsApp is not connected yet
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Reminders are listed below but cannot be sent. Add
            WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID and
            WHATSAPP_TEMPLATE_NAME to the environment, and get the message
            template approved in Meta Business Manager first.
          </p>
        </Panel>
      )}

      {appointments.length === 0 ? (
        <Empty href="/appointments/new" cta="Book one">
          Nothing booked for tomorrow.
        </Empty>
      ) : (
        <Panel className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-line)] bg-[var(--color-surface)] text-left text-xs text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Time</th>
                <th className="px-4 py-2 font-medium">Patient</th>
                <th className="px-4 py-2 font-medium">Doctor</th>
                <th className="px-4 py-2 font-medium">Reminder</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-[var(--color-line)] last:border-0"
                >
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {time(a.scheduledAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    {a.patient.name}
                    <span className="ml-2 text-xs text-[var(--color-faint)]">
                      {a.patient.phone}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-muted)]">
                    {a.doctor.name}
                  </td>
                  <td className="px-4 py-2.5">
                    {a.reminderSentAt ? (
                      <span className="text-[var(--color-muted)]">
                        Sent {time(a.reminderSentAt)}
                      </span>
                    ) : a.patient.marketingConsent ? (
                      <span className="text-[var(--color-waiting)]">
                        Not sent
                      </span>
                    ) : (
                      <span className="text-[var(--color-faint)]">
                        No consent on file
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <p className="mt-4 text-xs text-[var(--color-faint)]">
        {sent.length} sent · {sendable.length} ready ·{" "}
        {blocked.length} cannot be messaged. Patients who have not agreed to
        clinic messages are never contacted — consent is recorded at
        registration and can be changed on the patient&rsquo;s record.
      </p>
    </div>
  );
}

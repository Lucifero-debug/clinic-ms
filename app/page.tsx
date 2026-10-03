// app/page.tsx — the day's queue
//
// The screen the front desk lives in all day, and the one that has to be
// good. Defaults to today; ?day=YYYY-MM-DD shows any other date, because
// clinics book two and three weeks ahead.

import Link from "next/link";
import { db } from "@/lib/db";
import { currentClinicId } from "@/lib/session";
import { markArrived, markNoShow, startVisit } from "@/lib/actions";
import { time, age, rupees } from "@/lib/format";
import { Panel, PageHeader, Empty, btnPrimary, btnQuiet } from "@/app/ui";

const edge: Record<string, string> = {
  SCHEDULED: "border-l-[var(--color-line)]",
  CONFIRMED: "border-l-[var(--color-line)]",
  ARRIVED: "border-l-[var(--color-waiting)]",
  IN_PROGRESS: "border-l-[var(--color-progress)]",
  COMPLETED: "border-l-transparent",
  CANCELLED: "border-l-transparent",
  NO_SHOW: "border-l-[var(--color-missed)]",
};

const label: Record<string, string> = {
  SCHEDULED: "Expected",
  CONFIRMED: "Confirmed",
  ARRIVED: "Waiting",
  IN_PROGRESS: "With doctor",
  COMPLETED: "Done",
  CANCELLED: "Cancelled",
  NO_SHOW: "Did not come",
};

function dayBounds(day?: string) {
  const base = day ? new Date(`${day}T00:00:00`) : new Date();

  if (Number.isNaN(base.getTime())) return dayBounds(undefined);

  const start = new Date(base);
  start.setHours(0, 0, 0, 0);

  const end = new Date(base);
  end.setHours(23, 59, 59, 999);

  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(
    start.getDate()
  )}`;

  const todayIso = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  })();

  return { start, end, iso, isToday: iso === todayIso };
}

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const { day } = await searchParams;
  const clinicId = await currentClinicId();
  const { start, end, iso, isToday } = dayBounds(day);

  const appointments = await db.appointment.findMany({
    where: { clinicId, scheduledAt: { gte: start, lte: end } },
    orderBy: { scheduledAt: "asc" },
    include: {
      patient: true,
      doctor: { select: { name: true } },
      visit: { select: { id: true } },
    },
  });

  const live = appointments.filter((a) => !a.cancelledAt);
  const waiting = live.filter((a) => a.status === "ARRIVED").length;
  const done = live.filter((a) => a.status === "COMPLETED").length;

  const collected = await db.payment.aggregate({
    where: {
      receivedAt: { gte: start, lte: end },
      reversedAt: null,
      invoice: { clinicId },
    },
    _sum: { amount: true },
  });

  const total = Number(collected._sum.amount ?? 0);

  const heading = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(start);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={isToday ? "Today" : heading}
        meta={`${live.length} booked · ${waiting} waiting · ${done} seen${
          total > 0 ? ` · ${rupees(total)} collected` : ""
        }`}
        action={
          <Link href="/appointments/new" className={btnPrimary}>
            Book appointment
          </Link>
        }
      />

      {/* Day navigation. Front desks look ahead constantly. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={`/?day=${shift(iso, -1)}`} className={btnQuiet}>
          ← Previous
        </Link>

        {!isToday && (
          <Link href="/" className={btnQuiet}>
            Today
          </Link>
        )}

        <Link href={`/?day=${shift(iso, 1)}`} className={btnQuiet}>
          Next →
        </Link>

        <form className="ml-auto">
          <input
            type="date"
            name="day"
            defaultValue={iso}
            aria-label="Jump to date"
            className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 text-sm"
          />
        </form>
      </div>

      {appointments.length === 0 ? (
        <Empty href="/appointments/new" cta="Book one">
          Nothing booked for {isToday ? "today" : heading}.
        </Empty>
      ) : (
        <Panel className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-line)] bg-[var(--color-surface)] text-left text-xs text-[var(--color-muted)]">
              <tr>
                <th className="py-2 pl-4 pr-3 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Patient</th>
                <th className="px-3 py-2 font-medium">Doctor</th>
                <th className="px-3 py-2 font-medium">Reason</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="py-2 pl-3 pr-4"></th>
              </tr>
            </thead>

            <tbody>
              {appointments.map((a) => {
                const waited = a.arrivedAt
                  ? Math.floor((Date.now() - a.arrivedAt.getTime()) / 60000)
                  : null;

                const stale =
                  a.status === "ARRIVED" && waited !== null && waited > 20;

                const dim =
                  a.status === "COMPLETED" ||
                  a.status === "NO_SHOW" ||
                  a.cancelledAt !== null;

                return (
                  <tr
                    key={a.id}
                    className={`border-b border-l-4 border-[var(--color-line)] last:border-b-0 ${
                      edge[a.status]
                    } ${dim ? "text-[var(--color-muted)]" : ""}`}
                  >
                    <td className="whitespace-nowrap py-3 pl-4 pr-3 font-medium">
                      {time(a.scheduledAt)}
                    </td>

                    <td className="px-3 py-3">
                      <Link
                        href={`/patients/${a.patient.id}`}
                        className={`font-medium hover:underline ${
                          a.cancelledAt ? "line-through" : ""
                        }`}
                      >
                        {a.patient.name}
                      </Link>
                      <span className="ml-2 text-xs text-[var(--color-faint)]">
                        {a.patient.code} ·{" "}
                        {age(a.patient.dob, a.patient.ageAtRegistration)}
                      </span>

                      {a.patient.allergies && (
                        <div className="mt-0.5 text-xs text-[var(--color-missed)]">
                          Allergy: {a.patient.allergies}
                        </div>
                      )}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-[var(--color-muted)]">
                      {a.doctor.name}
                    </td>

                    <td className="px-3 py-3 text-[var(--color-muted)]">
                      {a.reason ?? "—"}
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      {a.cancelledAt ? "Cancelled" : label[a.status]}
                      {waited !== null && a.status === "ARRIVED" && (
                        <span
                          className={
                            stale
                              ? "ml-1 font-medium text-[var(--color-missed)]"
                              : "ml-1 text-[var(--color-muted)]"
                          }
                        >
                          {waited}m
                        </span>
                      )}
                    </td>

                    <td className="whitespace-nowrap py-3 pl-3 pr-4 text-right">
                      <div className="flex justify-end gap-1">
                        {!a.cancelledAt &&
                          (a.status === "SCHEDULED" ||
                            a.status === "CONFIRMED") && (
                            <>
                              <form action={markArrived.bind(null, a.id)}>
                                <button className={btnQuiet}>Arrived</button>
                              </form>
                              <form action={markNoShow.bind(null, a.id)}>
                                <button className="rounded-md px-2 py-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-missed)]">
                                  No show
                                </button>
                              </form>
                              <Link
                                href={`/appointments/${a.id}`}
                                className="rounded-md px-2 py-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                              >
                                Move
                              </Link>
                            </>
                          )}

                        {a.status === "ARRIVED" && (
                          <form action={startVisit.bind(null, a.id)}>
                            <button className="inline-flex items-center rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-ink)]">
                              Start consultation
                            </button>
                          </form>
                        )}

                        {a.status === "IN_PROGRESS" && a.visit && (
                          <Link
                            href={`/visits/${a.visit.id}`}
                            className={btnQuiet}
                          >
                            Open
                          </Link>
                        )}

                        {a.status === "COMPLETED" && a.visit && (
                          <Link
                            href={`/visits/${a.visit.id}/bill`}
                            className="rounded-md px-2 py-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                          >
                            Bill
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

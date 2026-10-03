// app/reports/page.tsx — daily collection
//
// "A daily collection figure the owner trusts" is one of the three things
// clinics pay for. Keep it simple and verifiable: the owner must be able
// to tally it against the cash box without reading a chart.

import Link from "next/link";
import { db } from "@/lib/db";
import { currentClinicId } from "@/lib/session";
import { date, rupees, time } from "@/lib/format";

function dayRange(day: string | undefined): { start: Date; end: Date; iso: string } {
  const base = day ? new Date(`${day}T00:00:00`) : new Date();

  const start = new Date(base);
  start.setHours(0, 0, 0, 0);

  const end = new Date(base);
  end.setHours(23, 59, 59, 999);

  return { start, end, iso: start.toISOString().slice(0, 10) };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const { day } = await searchParams;
  const clinicId = await currentClinicId();
  const { start, end, iso } = dayRange(day);

  const payments = await db.payment.findMany({
    where: {
      receivedAt: { gte: start, lte: end },
      invoice: { clinicId },
    },
    orderBy: { receivedAt: "asc" },
    include: {
      invoice: {
        select: {
          number: true,
          patient: { select: { name: true, code: true } },
        },
      },
    },
  });

  const total = payments.reduce((s, p) => s + Number(p.amount), 0);

  const byMode = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.mode] = (acc[p.mode] ?? 0) + Number(p.amount);
    return acc;
  }, {});

  // Invoices raised today that still have money outstanding.
  const unpaid = await db.invoice.findMany({
    where: {
      clinicId,
      issuedAt: { gte: start, lte: end },
      status: { in: ["ISSUED", "PARTIALLY_PAID"] },
      cancelledAt: null,
    },
    include: { patient: { select: { name: true, code: true } } },
  });

  const outstanding = unpaid.reduce(
    (s, i) => s + (Number(i.total) - Number(i.paid)),
    0
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Collection</h1>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            {date(start)}
          </p>
        </div>

        <form>
          <input
            type="date"
            name="day"
            defaultValue={iso}
            className="rounded border border-[var(--color-line)] px-3 py-1.5 text-sm"
          />
        </form>
      </div>

      <div className="mb-5 flex gap-8 rounded border border-[var(--color-line)] p-4">
        <div>
          <div className="text-xs text-[var(--color-muted)]">Collected</div>
          <div className="text-2xl font-semibold">{rupees(total)}</div>
        </div>

        {Object.entries(byMode).map(([mode, amount]) => (
          <div key={mode}>
            <div className="text-xs text-[var(--color-muted)]">
              {mode.toLowerCase().replace("_", " ")}
            </div>
            <div className="text-lg">{rupees(amount)}</div>
          </div>
        ))}

        {outstanding > 0 && (
          <div className="ml-auto text-right">
            <div className="text-xs text-[var(--color-muted)]">
              Still due today
            </div>
            <div className="text-lg text-[var(--color-missed)]">
              {rupees(outstanding)}
            </div>
          </div>
        )}
      </div>

      {payments.length === 0 ? (
        <p className="rounded border border-[var(--color-line)] p-8 text-center text-sm text-[var(--color-muted)]">
          No payments recorded on this day.
        </p>
      ) : (
        <div className="overflow-hidden rounded border border-[var(--color-line)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface)] text-left text-xs text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Patient</th>
                <th className="px-3 py-2 font-medium">Invoice</th>
                <th className="px-3 py-2 font-medium">Mode</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-[var(--color-line)]">
                  <td className="px-3 py-2">{time(p.receivedAt)}</td>
                  <td className="px-3 py-2">
                    {p.invoice.patient.name}
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      {p.invoice.patient.code}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">
                    {p.invoice.number}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-muted)]">
                    {p.mode.toLowerCase().replace("_", " ")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {rupees(Number(p.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {unpaid.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Unpaid from today</h2>
          <ul className="space-y-1 text-sm">
            {unpaid.map((i) => (
              <li key={i.id} className="flex justify-between">
                <span>
                  {i.patient.name}{" "}
                  <span className="text-xs text-[var(--color-muted)]">
                    {i.number}
                  </span>
                </span>
                <span className="text-[var(--color-missed)]">
                  {rupees(Number(i.total) - Number(i.paid))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/"
        className="mt-6 inline-block text-sm font-medium text-[var(--color-accent)] underline"
      >
        Back to today
      </Link>
    </div>
  );
}

// app/invoices/page.tsx
//
// Find an invoice and print it.
//
// Two ways in, because there are two situations:
//
//   A patient rings up about a bill from last month  -> search by
//   invoice number, patient name or phone, across all dates.
//
//   The accountant wants everything from a period     -> date range,
//   with the totals for that range.
//
// Search deliberately ignores the date range. Someone with an
// invoice number in their hand does not know which month it was in,
// and making them guess is the most annoying thing a search can do.

import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole, CAN_HANDLE_MONEY } from "@/lib/session";
import { rupees, date, isoDate } from "@/lib/format";
import {
  Panel,
  PageHeader,
  Empty,
  Stat,
  input,
  label,
  btnQuiet,
  th,
  td,
  TableHead,
} from "@/app/ui";

function parseDay(raw: string | undefined, fallback: Date): Date {
  if (!raw) return fallback;

  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return fallback;

  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    from?: string;
    to?: string;
    status?: string;
  }>;
}) {
  const session = await requireRole(CAN_HANDLE_MONEY);
  const clinicId = session.clinicId;

  const { q, from, to, status } = await searchParams;
  const query = (q ?? "").trim();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Default to this month so the page opens on something useful.
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const start = parseDay(from, monthStart);

  const end = parseDay(to, today);
  end.setHours(23, 59, 59, 999);

  const invoices = await db.invoice.findMany({
    where: {
      clinicId,
      ...(query
        ? {
            // A search looks everywhere. Someone holding an invoice
            // number does not know which month it came from.
            OR: [
              { number: { contains: query, mode: "insensitive" } },
              {
                patient: {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { phone: { contains: query } },
                    { code: { contains: query, mode: "insensitive" } },
                  ],
                },
              },
            ],
          }
        : { createdAt: { gte: start, lte: end } }),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      patient: { select: { id: true, name: true, code: true, phone: true } },
      visit: { select: { id: true, doctor: { select: { name: true } } } },
      payments: { where: { reversedAt: null }, select: { mode: true } },
    },
  });

  const live = invoices.filter((i) => i.status !== "CANCELLED");

  const billed = live.reduce((t, i) => t + Number(i.total), 0);
  const collected = live.reduce((t, i) => t + Number(i.paid), 0);
  const outstanding = billed - collected;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Invoices"
        meta={
          query
            ? `${invoices.length} matching “${query}” — all dates`
            : `${date(start)} to ${date(end)}`
        }
        action={
          <Link href="/reports" className={btnQuiet}>
            Daily collection
          </Link>
        }
      />

      {/* --- find one --- */}
      <Panel className="mb-4 p-4">
        <form className="space-y-3">
          <div>
            <label htmlFor="q" className={label}>
              Find a specific invoice
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                id="q"
                name="q"
                defaultValue={query}
                autoFocus
                placeholder="Invoice number, patient name, phone or patient number"
                className={`max-w-md ${input}`}
              />
              <button className={btnQuiet}>Search</button>
              {query && (
                <Link href="/invoices" className={btnQuiet}>
                  Clear
                </Link>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--color-faint)]">
              Searching looks across every date and ignores the range below.
            </p>
          </div>
        </form>
      </Panel>

      {/* --- or a range --- */}
      <Panel className="mb-5 p-4">
        <form className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="from" className={label}>
              From
            </label>
            <input
              id="from"
              type="date"
              name="from"
              defaultValue={isoDate(start)}
              className={`mt-1 ${input}`}
            />
          </div>

          <div>
            <label htmlFor="to" className={label}>
              To
            </label>
            <input
              id="to"
              type="date"
              name="to"
              defaultValue={isoDate(end)}
              className={`mt-1 ${input}`}
            />
          </div>

          <div className="w-40">
            <label htmlFor="status" className={label}>
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status ?? ""}
              className={`mt-1 ${input}`}
            >
              <option value="">All</option>
              <option value="PAID">Paid</option>
              <option value="PARTIALLY_PAID">Part paid</option>
              <option value="ISSUED">Unpaid</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <button className={btnQuiet}>Show range</button>
        </form>
      </Panel>

      {!query && invoices.length > 0 && (
        <Panel className="mb-5 flex flex-wrap gap-10 p-5">
          <Stat label="Invoices" value={String(live.length)} />
          <Stat label="Billed" value={rupees(billed)} />
          <Stat label="Collected" value={rupees(collected)} tone="good" />
          {outstanding > 0 && (
            <Stat label="Outstanding" value={rupees(outstanding)} tone="due" />
          )}
        </Panel>
      )}

      {invoices.length === 0 ? (
        <Empty>
          {query
            ? `No invoice matches “${query}”.`
            : "No invoices in this range."}
        </Empty>
      ) : (
        <Panel className="overflow-hidden">
          <table className="w-full text-sm">
            <TableHead>
              <th className={th}>Invoice</th>
              <th className={th}>Date</th>
              <th className={th}>Patient</th>
              <th className={th}>Paid by</th>
              <th className={th}>Status</th>
              <th className={`${th} text-right`}>Total</th>
              <th className={th}></th>
            </TableHead>

            <tbody>
              {invoices.map((i) => {
                const due = Number(i.total) - Number(i.paid);

                return (
                  <tr
                    key={i.id}
                    className="border-b border-[var(--color-line)] last:border-0"
                  >
                    <td className={td}>
                      <span className="font-medium">
                        {i.number.split("/").pop()}
                      </span>
                      <div className="text-xs text-[var(--color-faint)]">
                        {i.number}
                      </div>
                    </td>

                    <td className={`${td} whitespace-nowrap text-[var(--color-muted)]`}>
                      {i.issuedAt ? date(i.issuedAt) : date(i.createdAt)}
                    </td>

                    <td className={td}>
                      <Link
                        href={`/patients/${i.patient.id}`}
                        className="font-medium hover:underline"
                      >
                        {i.patient.name}
                      </Link>
                      <div className="text-xs text-[var(--color-faint)]">
                        {i.patient.code} · {i.patient.phone}
                      </div>
                    </td>

                    <td className={`${td} text-xs text-[var(--color-muted)]`}>
                      {i.payments.length > 0
                        ? [
                            ...new Set(
                              i.payments.map((p) => p.mode.toLowerCase())
                            ),
                          ].join(", ")
                        : "—"}
                    </td>

                    <td className={`${td} text-xs`}>
                      <span
                        className={
                          i.status === "PAID"
                            ? "text-[var(--color-good)]"
                            : i.status === "CANCELLED"
                              ? "text-[var(--color-muted)]"
                              : "text-[var(--color-due)]"
                        }
                      >
                        {i.status.toLowerCase().replace("_", " ")}
                      </span>

                      {due > 0 && i.status !== "CANCELLED" && (
                        <div className="text-[var(--color-due)]">
                          {rupees(due)} due
                        </div>
                      )}
                    </td>

                    <td
                      className={`${td} text-right font-medium ${
                        i.status === "CANCELLED"
                          ? "line-through opacity-50"
                          : ""
                      }`}
                    >
                      {rupees(Number(i.total))}
                    </td>

                    <td className={`${td} text-right`}>
                      {i.visit && (
                        <Link
                          href={`/visits/${i.visit.id}/bill`}
                          className="text-sm font-medium text-[var(--color-accent)] underline underline-offset-2"
                        >
                          Open &amp; print
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {!query && (
              <tfoot>
                <tr className="bg-[var(--color-surface)]">
                  <td className={`${td} font-semibold`} colSpan={5}>
                    Total for the range
                  </td>
                  <td className={`${td} text-right font-semibold`}>
                    {rupees(billed)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </Panel>
      )}

      {invoices.length === 300 && (
        <p className="mt-3 text-xs text-[var(--color-faint)]">
          Showing the most recent 300. Narrow the range to see more.
        </p>
      )}
    </div>
  );
}

// app/visits/[id]/bill/page.tsx
//
// Two states on one route:
//   no invoice yet  -> pick services and create it
//   invoice exists  -> show it, take payment, print, cancel
//
// Once issued, an invoice is a financial record. It can be paid,
// reversed or cancelled — never edited or deleted. A cancelled invoice
// keeps its number; a gap in the sequence is worse than a cancelled row.

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentClinicId, requireSession } from "@/lib/session";
import {
  createInvoice,
  recordPayment,
  cancelInvoice,
  reversePayment,
} from "@/lib/actions";
import { age, date, dateTime, rupees } from "@/lib/format";
import { PrintButton } from "@/app/print-button";
import { Form, Submit, ConfirmSubmit } from "@/app/form";
import { Panel, PageHeader, input, label, btnPrimary, btnQuiet } from "@/app/ui";

export default async function BillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const clinicId = await currentClinicId();

  const visit = await db.visit.findFirst({
    where: { id, clinicId, deletedAt: null },
    include: {
      clinic: true,
      patient: true,
      doctor: { select: { name: true } },
      invoice: {
        include: { lines: true, payments: { orderBy: { receivedAt: "asc" } } },
      },
    },
  });

  if (!visit) notFound();

  const { patient, invoice } = visit;
  const canVoid = session.role === "OWNER" || session.role === "DOCTOR";

  // ---------------------------------------------------------------
  // No invoice yet — build one
  // ---------------------------------------------------------------
  if (!invoice) {
    const services = await db.service.findMany({
      where: { clinicId, active: true, deletedAt: null },
      orderBy: { name: "asc" },
    });

    const create = createInvoice.bind(null, visit.id);

    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Billing"
          meta={`${patient.name} · ${patient.code} · ${age(
            patient.dob,
            patient.ageAtRegistration
          )}`}
        />

        <Form action={create}>
          <Panel className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-line)] bg-[var(--color-surface)] text-left text-xs text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-4 py-2 text-right font-medium">Price</th>
                  <th className="w-24 px-4 py-2 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-[var(--color-line)] last:border-0"
                  >
                    <td className="px-4 py-2">
                      <label htmlFor={`qty_${s.id}`}>{s.name}</label>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {rupees(Number(s.price))}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        id={`qty_${s.id}`}
                        name={`qty_${s.id}`}
                        type="number"
                        min={0}
                        defaultValue={0}
                        className="w-16 rounded-md border border-[var(--color-line)] px-2 py-1 text-right text-sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="max-w-40">
              <label htmlFor="discount" className={label}>
                Discount
              </label>
              <input
                id="discount"
                name="discount"
                type="number"
                min={0}
                defaultValue={0}
                className={`mt-1 ${input}`}
              />
            </div>

            <Submit className={btnPrimary} pendingLabel="Creating…">
              Create invoice
            </Submit>
          </div>

          <p className="mt-3 text-xs text-[var(--color-faint)]">
            Healthcare services are GST-exempt in India, so tax is zero
            unless a service is configured otherwise. Confirm with a CA.
          </p>
        </Form>
      </div>
    );
  }

  // ---------------------------------------------------------------
  // Invoice exists
  // ---------------------------------------------------------------
  const total = Number(invoice.total);
  const paid = Number(invoice.paid);
  const due = total - paid;
  const cancelled = invoice.cancelledAt !== null;

  const pay = recordPayment.bind(null, invoice.id);
  const voidBill = cancelInvoice.bind(null, invoice.id);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex flex-wrap items-center gap-3">
        <PrintButton label="Print bill" />
        <Link href={`/visits/${visit.id}`} className={btnQuiet}>
          Back to consultation
        </Link>
        <Link
          href="/"
          className="ml-auto text-sm font-medium text-[var(--color-accent)] underline underline-offset-2"
        >
          Done — back to today
        </Link>
      </div>

      {cancelled && (
        <div className="mb-4 rounded-md border border-[var(--color-missed)] px-3 py-2 text-sm text-[var(--color-missed)]">
          Cancelled {dateTime(invoice.cancelledAt!)} —{" "}
          {invoice.cancelledReason}
        </div>
      )}

      <article
        className={`rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-6 shadow-[var(--shadow-panel)] print:border-0 print:p-0 print:shadow-none ${
          cancelled ? "opacity-60" : ""
        }`}
      >
        <header className="flex items-start justify-between border-b border-[var(--color-ink)] pb-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {visit.clinic.name}
            </h1>
            <p className="text-xs text-[var(--color-muted)]">
              {visit.clinic.address}, {visit.clinic.city} ·{" "}
              {visit.clinic.phone}
              {visit.clinic.registrationNo
                ? ` · Reg. ${visit.clinic.registrationNo}`
                : ""}
            </p>
          </div>
          <div className="text-right text-xs">
            <div className="font-medium">{invoice.number}</div>
            <div className="text-[var(--color-muted)]">
              {invoice.issuedAt ? date(invoice.issuedAt) : "—"}
            </div>
            {cancelled && (
              <div className="mt-1 font-semibold text-[var(--color-missed)]">
                CANCELLED
              </div>
            )}
          </div>
        </header>

        <div className="border-b border-[var(--color-line)] py-3 text-xs">
          <div className="text-sm font-medium">{patient.name}</div>
          <div className="text-[var(--color-muted)]">
            {patient.code} · {patient.phone} · seen by {visit.doctor.name}
          </div>
        </div>

        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-[var(--color-muted)]">
            <tr>
              <th className="py-1 font-medium">Item</th>
              <th className="py-1 text-right font-medium">Qty</th>
              <th className="py-1 text-right font-medium">Rate</th>
              <th className="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.id} className="border-t border-[var(--color-line)]">
                <td className="py-1.5">{l.description}</td>
                <td className="py-1.5 text-right">{l.quantity}</td>
                <td className="py-1.5 text-right">
                  {rupees(Number(l.unitPrice))}
                </td>
                <td className="py-1.5 text-right">{rupees(Number(l.amount))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex justify-end">
          <dl className="w-56 space-y-1 text-sm">
            <Row label="Subtotal" value={rupees(Number(invoice.subtotal))} />
            {Number(invoice.discount) > 0 && (
              <Row
                label="Discount"
                value={`− ${rupees(Number(invoice.discount))}`}
              />
            )}
            {Number(invoice.taxTotal) > 0 && (
              <Row label="GST" value={rupees(Number(invoice.taxTotal))} />
            )}
            <div className="flex justify-between border-t border-[var(--color-ink)] pt-1 font-semibold">
              <dt>Total</dt>
              <dd>{rupees(total)}</dd>
            </div>
            <Row label="Paid" value={rupees(paid)} />
            {due > 0 && !cancelled && (
              <div className="flex justify-between font-medium text-[var(--color-missed)]">
                <dt>Due</dt>
                <dd>{rupees(due)}</dd>
              </div>
            )}
          </dl>
        </div>

        {invoice.payments.length > 0 && (
          <div className="mt-4 space-y-0.5 text-xs text-[var(--color-muted)]">
            {invoice.payments.map((p) => (
              <div key={p.id} className={p.reversedAt ? "line-through" : ""}>
                {rupees(Number(p.amount))} by {p.mode.toLowerCase()} ·{" "}
                {dateTime(p.receivedAt)}
                {p.reference ? ` · ${p.reference}` : ""}
                {p.reversedAt ? " · reversed" : ""}
              </div>
            ))}
          </div>
        )}
      </article>

      {/* --- take payment --- */}
      {due > 0 && !cancelled && (
        <Panel className="no-print mt-5 p-4">
          <Form action={pay} className="flex flex-wrap items-end gap-3">
            <div className="w-32">
              <label htmlFor="amount" className={label}>
                Amount
              </label>
              <input
                id="amount"
                name="amount"
                type="number"
                min={1}
                max={due}
                defaultValue={due}
                className={`mt-1 ${input}`}
              />
            </div>

            <div className="w-36">
              <label htmlFor="mode" className={label}>
                Mode
              </label>
              <select id="mode" name="mode" className={`mt-1 ${input}`}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="min-w-40 flex-1">
              <label htmlFor="reference" className={label}>
                Reference
              </label>
              <input
                id="reference"
                name="reference"
                placeholder="UPI transaction id"
                className={`mt-1 ${input}`}
              />
            </div>

            <Submit className={btnPrimary} pendingLabel="Recording…">
              Record payment
            </Submit>
          </Form>
        </Panel>
      )}

      {/* --- corrections --- */}
      {canVoid && !cancelled && (
        <details className="no-print mt-5">
          <summary className="cursor-pointer text-sm text-[var(--color-muted)]">
            Something wrong with this bill?
          </summary>

          <div className="mt-3 space-y-4">
            {invoice.payments
              .filter((p) => !p.reversedAt)
              .map((p) => {
                const reverse = reversePayment.bind(null, p.id);

                return (
                  <Panel key={p.id} className="p-4">
                    <p className="mb-2 text-sm">
                      Reverse {rupees(Number(p.amount))} by{" "}
                      {p.mode.toLowerCase()} on {dateTime(p.receivedAt)}
                    </p>

                    <Form action={reverse} className="flex items-end gap-3">
                      <div className="flex-1">
                        <label htmlFor={`rev_${p.id}`} className={label}>
                          Reason
                        </label>
                        <input
                          id={`rev_${p.id}`}
                          name="reason"
                          required
                          placeholder="Entered twice by mistake"
                          className={`mt-1 ${input}`}
                        />
                      </div>

                      <ConfirmSubmit
                        message="Reverse this payment? Both entries stay on the record."
                        className="inline-flex items-center rounded-md border border-[var(--color-line)] px-3 py-2 text-sm font-medium hover:bg-[var(--color-surface)]"
                      >
                        Reverse
                      </ConfirmSubmit>
                    </Form>
                  </Panel>
                );
              })}

            <Panel className="p-4">
              <p className="mb-2 text-sm">
                Cancel the whole bill. The number {invoice.number} is not
                reused — a gap in the sequence causes more trouble than a
                cancelled row.
              </p>

              <Form action={voidBill} className="flex items-end gap-3">
                <div className="flex-1">
                  <label htmlFor="cancelReason" className={label}>
                    Reason
                  </label>
                  <input
                    id="cancelReason"
                    name="reason"
                    required
                    placeholder="Wrong services billed"
                    className={`mt-1 ${input}`}
                  />
                </div>

                <ConfirmSubmit
                  message="Cancel this bill? This cannot be undone."
                  className="inline-flex items-center rounded-md border border-[var(--color-missed)] px-3 py-2 text-sm font-medium text-[var(--color-missed)] hover:bg-[var(--color-missed)] hover:text-white"
                >
                  Cancel bill
                </ConfirmSubmit>
              </Form>
            </Panel>
          </div>
        </details>
      )}
    </div>
  );
}

function Row({ label: l, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-[var(--color-muted)]">{l}</dt>
      <dd>{value}</dd>
    </div>
  );
}

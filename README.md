# clinic-ms

OPD management system for small Indian clinics — 1 to 5 doctors.

Front desk registers patients and books appointments. Doctor records the
consultation and writes a prescription. Front desk bills and takes payment.

**Read `CONTEXT.md` before working on this.** It defines what is in scope,
what is deliberately excluded, and the decisions that must not be reversed.

## Setup

```
npm install
copy .env.example .env
```

Fill in `.env`:

- `DATABASE_URL` — free Postgres from neon.tech or supabase.com. Use the
  **direct** connection string, not the pooled one.
- `SESSION_SECRET` — generate with:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Then:

```
npx prisma generate
npm run db:push
npm run db:seed
npm run dev
```

The seed prints demo logins. All three use password `clinic123`:

| Phone | Who | Role |
|---|---|---|
| 9810000001 | Dr. Anil Sharma | owner |
| 9810000002 | Dr. Sana Khan | doctor |
| 9810000003 | Priya Nair | receptionist |

**Change these before any real deployment.**

## Demo walkthrough

1. **Today** — a live queue: two seen, one with the doctor, one waiting
   with the wait timer running, two still expected.
2. Press **Arrived** on an expected patient, then **Start consultation**.
3. Fill the notes and a prescription row, **Save and go to billing**.
4. Tick services, create the invoice, record a UPI payment.
5. Print the prescription — A5, with the doctor's registration number.
6. **Collection** — the day's takings split by cash/UPI/card.
7. **Reminders** — tomorrow's list, with one patient marked as having no
   consent on file, so the clinic can see it will not be messaged.
8. **Settings** — the clinic edits its own prices, adds staff.

## Stack

Next.js 15 (App Router, server components) · TypeScript · PostgreSQL ·
Prisma · Tailwind v4

One client component in the whole app (the print button). Everything else
renders on the server, because clinics run this on cheap laptops over slow
connections.

## Scope

In: patients, appointments, consultations, prescriptions, billing,
payments, collection report, WhatsApp reminders, staff roles, audit log.

Out, deliberately: IPD/beds, pharmacy inventory, lab orders, radiology,
insurance/TPA claims, drug interaction checking, telemedicine, patient app.
See `CONTEXT.md` §3 before adding any of these.

## Non-negotiables

1. Every query filters by `clinicId`. One clinic must never see another's
   patients. Ids from URLs and forms are re-checked against the session.
2. Nothing is hard deleted. `deletedAt`, cancel, or amend.
3. Invoice numbers are sequential and gapless, generated in a transaction.
4. Invoice lines snapshot price and description at billing time.
5. Allergies display before any prescription screen.
6. Only patients with `marketingConsent` are ever messaged.

## Before a real clinic uses this

- Change the seeded passwords and delete the demo clinic.
- Get the WhatsApp template approved and set the four `WHATSAPP_*` vars.
- Confirm GST treatment and record retention with a CA and a lawyer —
  see `CONTEXT.md` §7.
- Print a prescription and a bill on the clinic's actual printer.

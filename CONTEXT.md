# CONTEXT.md — read this first

Complete context for **clinic-ms**, written for an AI assistant (ChatGPT,
Gemini, Claude, Cursor) that has never seen this codebase, so work can
continue without the original conversation.

Read the whole file before editing anything. It contains scope boundaries
and decisions that are deliberate; reversing them by accident turns a
shippable product into an unfinishable one, or worse, into one that loses
a clinic's money or leaks a patient's records.

Copy to `AGENTS.md` or `.cursorrules` if your tool expects that name.

---

## 1. What this is

An OPD clinic management system for small Indian clinics — one doctor up to
roughly five. Front desk registers patients, books appointments, marks
arrivals; doctor records the consultation and writes a prescription; front
desk bills and takes payment.

Target user: a dentist, physician, dermatologist, physiotherapist or
paediatrician running one or two chairs with a receptionist. Delhi/NCR to
start, because that is where the builder is and can visit in person.

What these clinics actually pay for, in order:

1. **Fewer no-shows.** Every empty slot is lost money; reminders fix it.
2. **Billing that works** and a daily collection figure the owner trusts.
3. **Finding a returning patient's history** in under ten seconds.

What they do not pay for: analytics dashboards, clinical decision support,
patient mobile apps, anything described as "insights".

Pricing intent: Rs 2,000–6,000/month per clinic, sold as a managed service
— you configure it for them — not self-serve SaaS.

---

## 2. Current state

**Everything below is built and works.** Nothing has been deployed, and no
real clinic has used it.

### Flows that work end to end

- Sign in / sign out, change own password, owner resets someone's password
- Register a patient, edit a patient, search by name / phone / code
- Book an appointment (warns on double-booking, can override)
- Reschedule or cancel an appointment with a reason
- Day queue for **any** date, mark arrived / no-show, wait timer
- Start consultation → notes, vitals, 8-row prescription → close
- Print prescription (A5, carries doctor registration number)
- Create invoice → record payment → print bill
- Cancel an invoice, reverse a payment, both with a required reason
- Daily collection report split by payment mode, with unpaid invoices
- Tomorrow's reminder list, send over WhatsApp when configured
- Settings: clinic details, price list, staff, passwords, data export
- Export: patients / visits / invoices / payments as CSV, full JSON backup
- Audit log written on every patient view and every significant change

### File map

```
prisma/schema.prisma    data model, heavily commented
prisma/seed.ts          demo clinic, 3 staff, 6 patients, a live-looking day

lib/db.ts               Prisma singleton
lib/auth.ts             scrypt passwords, HMAC-signed session cookie
lib/session.ts          requireSession / currentClinicId — the auth gate
lib/audit.ts            audit() helper, fire-and-forget
lib/result.ts           ActionState + validators (fail / done / requireText…)
lib/format.ts           IST dates, Indian rupee grouping, age
lib/whatsapp.ts         Cloud API template send, isConfigured()
lib/actions.ts          every server action

app/ui.tsx              shared classNames + Panel / PageHeader / Empty
app/form.tsx            Form / Submit / ConfirmSubmit (the only client code
                        besides print-button)
app/print-button.tsx    window.print()
app/error.tsx           page-level error boundary
app/global-error.tsx    root-layout error boundary (inline styles on purpose)
app/not-found.tsx

app/login/              sign-in page + client form
app/page.tsx            the day queue (?day=YYYY-MM-DD)
app/patients/           list, new, [id], [id]/edit
app/appointments/       new, [id] (reschedule / cancel)
app/visits/[id]/        consultation, /prescription, /bill
app/reminders/          tomorrow's list + send
app/reports/            daily collection (?day=YYYY-MM-DD)
app/settings/           clinic, services, staff, passwords, export
app/export/route.ts     CSV + JSON download endpoint
```

### Stack

Next.js 15 (App Router, server components, server actions) · TypeScript ·
PostgreSQL · Prisma · Tailwind v4. No UI library, no auth library, no
validation library — all deliberate, see §6.

Two client components in the whole app: the print button and the form
wrapper. Everything else renders on the server, because clinics run this on
cheap laptops over slow connections.

---

## 3. Scope — what is IN and what is OUT

A "proper hospital management system" is an 18-month build for a team. This
is not that, and attempts to make it that will kill the project.

### Out of scope — do not build without an explicit decision

- **IPD / beds / admissions / discharge summaries** — different product
- **Pharmacy inventory** — batches, expiry, stock. Large and separate
- **Lab orders and results**, radiology, PACS
- **Insurance / TPA claim processing** — real pain, but its own product
- **Drug master with interaction checking** — a half-built version is
  dangerous. Prescriptions are free text on purpose
- **Telemedicine / video consults** — separately regulated in India
- **Patient-facing mobile app**
- **Multi-branch consolidation**

If one of these seems necessary, the right move is almost always to serve a
different clinic rather than to build it.

---

## 4. Rules that must not be broken

### Tenancy
Every patient-facing table carries `clinicId` and **every query filters by
it**. Ids arriving from a URL or a form are re-checked against the session
before any write — see `createAppointment` in `lib/actions.ts`. Use
`updateMany`/`findFirst` with a `clinicId` filter rather than
`update`/`findUnique` by id alone, because the latter has no place to put
the filter. The failure mode here is one clinic seeing another's patients.

### Nothing is hard deleted
`deletedAt` everywhere. Invoices are cancelled. Payments are reversed.
Clinical notes are amended (`amendedAt`), never silently rewritten. Medical
records have retention requirements and disputes surface years later.

### Money
- Invoice numbers are sequential, gapless, per clinic per financial year,
  generated **inside a transaction**.
- A cancelled invoice **keeps its number**. A gap in the sequence is worse
  than a cancelled row.
- Invoice lines snapshot description and price at billing time. Never read
  the current `Service` row to display an old invoice.
- A bill with live payments cannot be cancelled — reverse the payments
  first, so the day's collection still reconciles.

### Clinical safety
- Allergies display on the queue, the patient page, the consultation screen
  and the printed prescription. Do not remove any of those.
- The prescription print must carry the doctor's name, qualification and
  registration number. Without them it is not a valid prescription in India.

### Errors
User mistakes **return** `{ error }` from the action and render above the
form. Only impossible states throw, and those hit `app/error.tsx`. A thrown
error in a server action shows a blank screen and loses what was typed —
unacceptable at a busy front desk.

### Consent
Only patients with `marketingConsent` are ever messaged. The reminders
screen shows who cannot be contacted rather than hiding them.

---

## 5. Things that look like bugs but are not

- **Patients can share a phone number.** Families do. `[clinicId, phone]` is
  indexed but NOT unique. Registration warns and offers "register anyway".
- **Age is stored instead of date of birth.** Many older Indian patients do
  not know their DOB. `ageAtRegistration` is not redundant.
- **Prescription rows are eight fixed inputs**, not an "add row" button.
  No client JS, and tabbing through static fields is faster.
- **Double-booking is allowed** with a warning. Clinics do it on purpose.
- **Password reset is done in person by the owner.** There is no email in
  this system. For a five-person clinic this is how it actually works.
- **The reset password field shows plain text** so the owner can read it out.
- **`db push`, not `migrate`.** There is no `prisma/migrations` folder. Do
  NOT run `prisma migrate reset` — it drops everything and applies nothing.
  Use `npm run db:reset`.
- **A stale session cookie after `db:reset` sends you to /login, not to an
  error.** The cookie is signed and valid but points at a clinic id that no
  longer exists, and the first write fails with `Foreign key constraint
  violated on Patient_clinicId_fkey`. So the root layout checks the clinic
  exists and redirects, and `/login` checks the same thing before bouncing
  back — otherwise the two ping-pong forever. **A layout cannot clear the
  cookie**: Next only allows cookie writes in a server action or route
  handler. Signing in again replaces it. Copy both halves of this into any
  new tenant-scoped app.

---

## 6. Why there are so few dependencies

Each of these was a deliberate choice, not an oversight:

- **No auth library.** `lib/auth.ts` is scrypt from `node:crypto` plus an
  HMAC-signed cookie, about 100 lines. NextAuth would add configuration,
  a provider model this app does not need, and another thing to keep
  patched.
- **No validation library.** `lib/result.ts` has the four validators this
  app uses.
- **No UI library.** `app/ui.tsx` is a handful of exported class strings.
- **No date library.** `Intl.DateTimeFormat` with an explicit
  `Asia/Kolkata` timezone.

The constraint driving all of this: a cheap Windows laptop on a slow
connection in a clinic. Every kilobyte is someone waiting.

If you add a dependency, say why it earns its weight.

---

## 7. India-specific requirements

Verify all of these with a professional before going live. Flagged from
general knowledge, not legal advice.

- **DPDP Act 2023.** Health data is sensitive personal data. Consent is
  recorded (`consentGivenAt`), with separate consent for messages
  (`marketingConsent`). Patients can request erasure, which conflicts with
  medical retention — get advice on reconciling these. As the software
  provider you are likely a data processor with your own obligations.
- **GST.** Healthcare services by a clinical establishment are exempt;
  goods sold are not. `Service.gstRate` defaults to 0. Confirm with a CA.
- **Prescriptions** must carry the doctor's name, qualification and
  registration number.
- **Clinical Establishments Act** registration varies by state; the number
  is printed on bills in most states.
- **Record retention:** commonly cited as three years for outpatient
  records, longer where litigation is possible. Verify for the state.
- **ABHA / ABDM** health IDs are optional. Only store with consent. Full
  ABDM integration is large — do not start it speculatively.

---

## 8. Deployment

Not yet done. The intended path:

1. **Database.** Neon or Supabase. Use the **direct** connection string for
   Prisma, not the pooled one. Enable point-in-time recovery — this is your
   backup, and it is the single most important setting on this list.
2. **Vercel.** Connect the repo. Set `DATABASE_URL` and `SESSION_SECRET` in
   project environment variables. `npm run build` already runs
   `prisma generate`.
3. **Schema.** Run `npx prisma db push` against the production database
   from your machine once. Before a clinic has live data, move to
   `prisma migrate dev` so changes are versioned.
4. **Seed nothing.** Create the real clinic and owner by hand, or write a
   one-off script. The demo seed must never run against production.
5. **Custom domain** if the clinic wants one.

### Backups

Neon and Supabase both offer point-in-time recovery on paid tiers; on free
tiers the window is short or absent. For a real clinic, paying for PITR is
not optional. In addition, `/export?type=full` gives a complete JSON dump —
download one weekly and keep it somewhere the clinic also controls. That
second copy is what protects them if your account is the thing that fails.

### Still missing before production

- **No rate limit on anything except login.** Add one if this is ever
  public-facing beyond a handful of clinics.
- **No error reporting service.** Errors go to the Vercel log and nowhere
  else. Sentry or similar would be the first thing to add.
- **No uptime monitoring.**
- **Login attempts are never pruned.** Add a scheduled job to delete rows
  older than a day, or the table grows forever.
- **Audit log grows forever.** Fine for years at clinic scale, but plan an
  archive eventually.
- **No automated tests.** The highest-value ones would be: invoice number
  sequencing under concurrency, tenancy isolation (clinic A cannot read
  clinic B), and payment arithmetic.

---

## 9. Roadmap

1. **Validate with a real clinic.** Sit with one receptionist for two hours
   and watch. Expect the schema to be wrong in at least three places. Worth
   more than two weeks of coding. **This is step one and it is not code.**
2. Deploy to Vercel + Neon with PITR enabled.
3. Change the demo passwords, delete the demo clinic, create the real one.
4. Get the WhatsApp template approved; set the four `WHATSAPP_*` vars.
5. Move reminder sending from a button to a scheduled job (~6pm IST).
6. Error reporting (Sentry) and uptime monitoring.
7. Tests for the three areas named in §8.
8. Only then: new features, driven by what the clinic actually asks for.

---

## 10. Who is building this

Solo developer in Delhi, final-year AI student, working a full-time job at
an AI ad studio. Builds evenings and weekends. Strong with Next.js,
TypeScript and LLM work. No prior healthcare or clinic-software experience.

**Important for any assistant working on this:** there are several other
half-finished projects (a WhatsApp clinic enquiry agent, a WhatsApp-to-Tally
tool, a salon automation MVP, a billing app). None has a paying user yet.
The constraint on this project is not technical ability — it is time, and
the habit of starting new builds instead of finding customers.

So: be willing to say when the right next move is talking to a clinic rather
than writing code. Someone who has watched one receptionist work for two
hours will build a better version of this than someone who writes features
for a month.

---

## 11. Prompt for a fresh AI session

> I'm working on clinic-ms, an OPD management system for small Indian
> clinics. Read the attached CONTEXT.md in full before suggesting anything.
> It has deliberate scope boundaries (§3), rules that must not be broken
> (§4), and a list of things that look like bugs but are not (§5). Tell me
> what you think the next step is and why, before writing any code.

Attach `CONTEXT.md`, `prisma/schema.prisma`, and whichever files under
`app/` or `lib/` the task touches. For anything involving writes, always
attach `lib/actions.ts` and `lib/session.ts` so the tenancy rule is visible.

// app/patients/new/page.tsx
//
// Registration happens at a busy front desk with a patient standing there.
// Only name and phone are required. Everything else can be filled later
// on the edit screen.

import { createPatient } from "@/lib/actions";
import { Form, Submit } from "@/app/form";
import { Panel, PageHeader, input, label, btnPrimary } from "@/app/ui";

export default function NewPatientPage() {
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Register patient" />

      <Panel className="p-5">
        <Form action={createPatient} className="space-y-4">
          <div>
            <label htmlFor="name" className={label}>
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              autoFocus
              className={`mt-1 ${input}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="phone" className={label}>
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                required
                inputMode="numeric"
                className={`mt-1 ${input}`}
              />
            </div>

            <div>
              <label htmlFor="age" className={label}>
                Age
              </label>
              <input
                id="age"
                name="age"
                inputMode="numeric"
                className={`mt-1 ${input}`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="gender" className={label}>
              Gender
            </label>
            <select
              id="gender"
              name="gender"
              defaultValue=""
              className={`mt-1 ${input}`}
            >
              <option value="">Not recorded</option>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="address" className={label}>
              Address
            </label>
            <input id="address" name="address" className={`mt-1 ${input}`} />
          </div>

          <div>
            <label htmlFor="allergies" className={label}>
              Allergies
            </label>
            <input
              id="allergies"
              name="allergies"
              placeholder="Penicillin, latex…"
              className={`mt-1 ${input}`}
            />
            <p className="mt-1 text-xs text-[var(--color-faint)]">
              Shown on every screen before a prescription is written.
            </p>
          </div>

          <div>
            <label htmlFor="conditions" className={label}>
              Ongoing conditions
            </label>
            <input
              id="conditions"
              name="conditions"
              placeholder="Diabetes, hypertension…"
              className={`mt-1 ${input}`}
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="marketingConsent" className="mt-0.5" />
            <span>
              Patient agrees to appointment reminders and clinic messages on
              WhatsApp.
            </span>
          </label>

          <label className="flex items-start gap-2 text-sm text-[var(--color-muted)]">
            <input type="checkbox" name="allowDuplicate" className="mt-0.5" />
            <span>
              Register anyway if this phone number is already on file —
              families often share one.
            </span>
          </label>

          <Submit className={btnPrimary} pendingLabel="Registering…">
            Register patient
          </Submit>
        </Form>
      </Panel>
    </div>
  );
}

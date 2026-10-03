// app/patients/[id]/edit/page.tsx
//
// A receptionist hits a wrong phone number or a misspelled name within
// the first ten patients. Without this screen their only option is to
// register a duplicate.

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { currentClinicId } from "@/lib/session";
import { updatePatient } from "@/lib/actions";
import { Form, Submit } from "@/app/form";
import { Panel, PageHeader, input, label, btnPrimary } from "@/app/ui";

export default async function EditPatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clinicId = await currentClinicId();

  const patient = await db.patient.findFirst({
    where: { id, clinicId, deletedAt: null },
  });

  if (!patient) notFound();

  const action = updatePatient.bind(null, patient.id);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Edit patient" meta={patient.code} />

      <Panel className="p-5">
        <Form action={action} className="space-y-4">
          <div>
            <label htmlFor="name" className={label}>
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={patient.name}
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
                defaultValue={patient.phone}
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
                defaultValue={patient.ageAtRegistration ?? ""}
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
              defaultValue={patient.gender ?? ""}
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
            <input
              id="address"
              name="address"
              defaultValue={patient.address ?? ""}
              className={`mt-1 ${input}`}
            />
          </div>

          <div>
            <label htmlFor="allergies" className={label}>
              Allergies
            </label>
            <input
              id="allergies"
              name="allergies"
              defaultValue={patient.allergies ?? ""}
              className={`mt-1 ${input}`}
            />
          </div>

          <div>
            <label htmlFor="conditions" className={label}>
              Ongoing conditions
            </label>
            <input
              id="conditions"
              name="conditions"
              defaultValue={patient.conditions ?? ""}
              className={`mt-1 ${input}`}
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="marketingConsent"
              defaultChecked={patient.marketingConsent}
              className="mt-0.5"
            />
            <span>
              Patient agrees to appointment reminders on WhatsApp. Untick
              this and they will never be messaged.
            </span>
          </label>

          <div className="flex items-center gap-3 pt-1">
            <Submit className={btnPrimary} pendingLabel="Saving…">
              Save changes
            </Submit>

            <Link
              href={`/patients/${patient.id}`}
              className="text-sm text-[var(--color-muted)] underline underline-offset-2"
            >
              Cancel
            </Link>
          </div>
        </Form>
      </Panel>
    </div>
  );
}

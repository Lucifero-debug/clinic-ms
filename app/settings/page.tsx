// app/settings/page.tsx
//
// Clinic details, price list, staff, passwords, and data export.
//
// "Can I change my own prices?" and "what happens to my records if I
// stop paying?" are the two questions every clinic asks in a demo. Both
// answers live on this page.

import { db } from "@/lib/db";
import { currentClinicId, requireSession } from "@/lib/session";
import {
  saveClinic,
  addService,
  updateServicePrice,
  retireService,
  addStaff,
  changeOwnPassword,
  resetStaffPassword,
  deactivateStaff,
} from "@/lib/actions";
import { rupees } from "@/lib/format";
import { Form, Submit, ConfirmSubmit } from "@/app/form";
import { Panel, PageHeader, input, label, btnPrimary, btnQuiet } from "@/app/ui";

export default async function SettingsPage() {
  const session = await requireSession();
  const clinicId = await currentClinicId();

  const [clinic, services, staff, me] = await Promise.all([
    db.clinic.findUnique({ where: { id: clinicId } }),
    db.service.findMany({
      where: { clinicId, deletedAt: null },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    db.staff.findMany({
      where: { clinicId, deletedAt: null },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    db.staff.findUnique({ where: { id: session.staffId } }),
  ]);

  if (!clinic) return null;

  const isOwner = session.role === "OWNER";
  const canExport = isOwner || session.role === "DOCTOR";

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <PageHeader title="Settings" />

      {me?.passwordSetByOwner && (
        <div className="rounded-md border border-[var(--color-waiting)] bg-[var(--color-panel)] px-3 py-2 text-sm text-[var(--color-waiting)]">
          Your password was set by someone else. Change it below so only you
          know it.
        </div>
      )}

      {/* --- clinic ------------------------------------------------ */}
      <section>
        <h2 className="mb-1 text-sm font-semibold">Clinic details</h2>
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          These appear on every printed prescription and bill.
        </p>

        <Panel className="p-5">
          <Form action={saveClinic} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className={label}>
                Name
              </label>
              <input
                id="name"
                name="name"
                defaultValue={clinic.name}
                className={`mt-1 ${input}`}
              />
            </div>

            <div>
              <label htmlFor="phone" className={label}>
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                defaultValue={clinic.phone}
                className={`mt-1 ${input}`}
              />
            </div>

            <div>
              <label htmlFor="city" className={label}>
                City
              </label>
              <input
                id="city"
                name="city"
                defaultValue={clinic.city}
                className={`mt-1 ${input}`}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="address" className={label}>
                Address
              </label>
              <input
                id="address"
                name="address"
                defaultValue={clinic.address}
                className={`mt-1 ${input}`}
              />
            </div>

            <div>
              <label htmlFor="registrationNo" className={label}>
                Clinical establishment registration
              </label>
              <input
                id="registrationNo"
                name="registrationNo"
                defaultValue={clinic.registrationNo ?? ""}
                className={`mt-1 ${input}`}
              />
            </div>

            <div>
              <label htmlFor="gstin" className={label}>
                GSTIN (only if you sell goods)
              </label>
              <input
                id="gstin"
                name="gstin"
                defaultValue={clinic.gstin ?? ""}
                className={`mt-1 ${input}`}
              />
            </div>

            <div className="sm:col-span-2">
              <Submit className={btnPrimary} pendingLabel="Saving…">
                Save details
              </Submit>
            </div>
          </Form>
        </Panel>
      </section>

      {/* --- services ---------------------------------------------- */}
      <section>
        <h2 className="mb-1 text-sm font-semibold">Services and prices</h2>
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Changing a price here does not change any bill already issued.
        </p>

        <Panel className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-line)] bg-[var(--color-surface)] text-left text-xs text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-2 font-medium">Service</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
                <th className="px-4 py-2 text-right font-medium">GST</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {services.map((s) => {
                const update = updateServicePrice.bind(null, s.id);

                return (
                  <tr
                    key={s.id}
                    className={`border-b border-[var(--color-line)] last:border-0 ${
                      s.active ? "" : "text-[var(--color-faint)]"
                    }`}
                  >
                    <td className="px-4 py-2">
                      {s.name}
                      {!s.active && (
                        <span className="ml-2 text-xs">(not in use)</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s.active ? (
                        <Form action={update}>
                          <div className="flex justify-end gap-2">
                            <input
                              name="price"
                              type="number"
                              min={0}
                              defaultValue={Number(s.price)}
                              aria-label={`Price for ${s.name}`}
                              className="w-24 rounded-md border border-[var(--color-line)] px-2 py-1 text-right text-sm"
                            />
                            <Submit className="text-xs text-[var(--color-accent)] underline underline-offset-2">
                              Save
                            </Submit>
                          </div>
                        </Form>
                      ) : (
                        rupees(Number(s.price))
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {Number(s.gstRate) ? `${Number(s.gstRate)}%` : "Exempt"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {s.active && (
                        <form action={retireService.bind(null, s.id)}>
                          <button className="text-xs text-[var(--color-muted)] hover:text-[var(--color-missed)]">
                            Stop offering
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="border-t border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <Form action={addService}>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1">
                  <label htmlFor="newService" className={label}>
                    Add a service
                  </label>
                  <input
                    id="newService"
                    name="name"
                    required
                    placeholder="Teeth whitening"
                    className={`mt-1 ${input}`}
                  />
                </div>

                <div className="w-28">
                  <label htmlFor="newPrice" className={label}>
                    Price
                  </label>
                  <input
                    id="newPrice"
                    name="price"
                    type="number"
                    min={0}
                    required
                    className={`mt-1 ${input}`}
                  />
                </div>

                <div className="w-24">
                  <label htmlFor="newGst" className={label}>
                    GST %
                  </label>
                  <input
                    id="newGst"
                    name="gstRate"
                    type="number"
                    min={0}
                    defaultValue={0}
                    className={`mt-1 ${input}`}
                  />
                </div>

                <Submit className={btnQuiet}>Add</Submit>
              </div>
            </Form>
          </div>
        </Panel>
      </section>

      {/* --- my password -------------------------------------------- */}
      <section>
        <h2 className="mb-1 text-sm font-semibold">Your password</h2>
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          Each person signs in with their own number. Shared logins make the
          audit trail meaningless.
        </p>

        <Panel className="p-5">
          <Form action={changeOwnPassword} className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="current" className={label}>
                Current password
              </label>
              <input
                id="current"
                name="current"
                type="password"
                autoComplete="current-password"
                required
                className={`mt-1 ${input}`}
              />
            </div>

            <div>
              <label htmlFor="next" className={label}>
                New password
              </label>
              <input
                id="next"
                name="next"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className={`mt-1 ${input}`}
              />
            </div>

            <div>
              <label htmlFor="confirm" className={label}>
                Repeat new password
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                className={`mt-1 ${input}`}
              />
            </div>

            <div className="sm:col-span-3">
              <Submit className={btnPrimary} pendingLabel="Changing…">
                Change password
              </Submit>
            </div>
          </Form>
        </Panel>
      </section>

      {/* --- staff -------------------------------------------------- */}
      <section>
        <h2 className="mb-1 text-sm font-semibold">Staff</h2>
        <p className="mb-3 text-xs text-[var(--color-muted)]">
          There is no email in this system, so a forgotten password is reset
          in person by the owner.
        </p>

        <div className="space-y-3">
          {staff.map((s) => {
            const reset = resetStaffPassword.bind(null, s.id);

            return (
              <Panel key={s.id} className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span
                      className={`font-medium ${
                        s.active ? "" : "text-[var(--color-faint)] line-through"
                      }`}
                    >
                      {s.name}
                    </span>
                    <span className="ml-2 text-xs text-[var(--color-muted)]">
                      {s.phone} · {s.role.toLowerCase()}
                      {s.registrationNo ? ` · ${s.registrationNo}` : ""}
                    </span>
                  </div>

                  {isOwner && s.active && s.id !== session.staffId && (
                    <form action={deactivateStaff.bind(null, s.id)}>
                      <button className="text-xs text-[var(--color-muted)] hover:text-[var(--color-missed)]">
                        Remove access
                      </button>
                    </form>
                  )}
                </div>

                {isOwner && s.active && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-[var(--color-muted)]">
                      Reset password
                    </summary>

                    <Form action={reset} className="mt-2">
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label htmlFor={`pw_${s.id}`} className={label}>
                            New password (8 characters or more)
                          </label>
                          <input
                            id={`pw_${s.id}`}
                            name="password"
                            type="text"
                            minLength={8}
                            required
                            className={`mt-1 ${input}`}
                          />
                          <p className="mt-1 text-xs text-[var(--color-faint)]">
                            Shown as plain text so you can read it out. Ask
                            them to change it after signing in.
                          </p>
                        </div>

                        <ConfirmSubmit
                          message={`Reset the password for ${s.name}?`}
                          className={btnQuiet}
                        >
                          Reset
                        </ConfirmSubmit>
                      </div>
                    </Form>
                  </details>
                )}
              </Panel>
            );
          })}
        </div>

        {isOwner && (
          <Panel className="mt-4 p-5">
            <h3 className="mb-3 text-sm font-medium">Add a staff member</h3>

            <Form action={addStaff} className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="staffName" className={label}>
                  Name
                </label>
                <input
                  id="staffName"
                  name="name"
                  required
                  className={`mt-1 ${input}`}
                />
              </div>

              <div>
                <label htmlFor="staffPhone" className={label}>
                  Phone (used to sign in)
                </label>
                <input
                  id="staffPhone"
                  name="phone"
                  required
                  inputMode="numeric"
                  className={`mt-1 ${input}`}
                />
              </div>

              <div>
                <label htmlFor="staffRole" className={label}>
                  Role
                </label>
                <select
                  id="staffRole"
                  name="role"
                  className={`mt-1 ${input}`}
                  defaultValue="RECEPTIONIST"
                >
                  <option value="RECEPTIONIST">Receptionist</option>
                  <option value="DOCTOR">Doctor</option>
                  <option value="ASSISTANT">Assistant</option>
                  <option value="OWNER">Owner</option>
                </select>
              </div>

              <div>
                <label htmlFor="staffPassword" className={label}>
                  Password (8 characters or more)
                </label>
                <input
                  id="staffPassword"
                  name="password"
                  type="text"
                  minLength={8}
                  required
                  className={`mt-1 ${input}`}
                />
              </div>

              <div>
                <label htmlFor="staffQual" className={label}>
                  Qualification (doctors)
                </label>
                <input
                  id="staffQual"
                  name="qualification"
                  placeholder="BDS, MDS"
                  className={`mt-1 ${input}`}
                />
              </div>

              <div>
                <label htmlFor="staffReg" className={label}>
                  Registration number (doctors)
                </label>
                <input
                  id="staffReg"
                  name="registrationNo"
                  className={`mt-1 ${input}`}
                />
              </div>

              <div className="sm:col-span-2">
                <Submit className={btnQuiet}>Add staff member</Submit>
              </div>
            </Form>
          </Panel>
        )}
      </section>

      {/* --- export -------------------------------------------------- */}
      {canExport && (
        <section>
          <h2 className="mb-1 text-sm font-semibold">Your data</h2>
          <p className="mb-3 text-xs text-[var(--color-muted)]">
            Everything in this system belongs to the clinic. Download it any
            time, in formats any other software can read. Every export is
            recorded in the audit log.
          </p>

          <Panel className="p-5">
            <div className="flex flex-wrap gap-2">
              <a href="/export?type=patients" className={btnQuiet}>
                Patients (CSV)
              </a>
              <a href="/export?type=visits" className={btnQuiet}>
                Visits and prescriptions (CSV)
              </a>
              <a href="/export?type=invoices" className={btnQuiet}>
                Invoices (CSV)
              </a>
              <a href="/export?type=payments" className={btnQuiet}>
                Payments (CSV)
              </a>
              <a href="/export?type=full" className={btnPrimary}>
                Full backup (JSON)
              </a>
            </div>

            <p className="mt-3 text-xs text-[var(--color-faint)]">
              These files contain patient information. Keep them somewhere
              private and do not email them.
            </p>
          </Panel>
        </section>
      )}
    </div>
  );
}

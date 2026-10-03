// app/patients/page.tsx — patient search
//
// Receptionists search by partial phone more than anything else, then by
// name, then by patient code. Search must be forgiving and fast.

import Link from "next/link";
import { db } from "@/lib/db";
import { currentClinicId } from "@/lib/session";
import { age, date } from "@/lib/format";
import { Panel, PageHeader, Empty, input, btnPrimary } from "@/app/ui";

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const clinicId = await currentClinicId();

  const query = (q ?? "").trim();

  const patients = await db.patient.findMany({
    where: {
      clinicId,
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { phone: { contains: query } },
              { code: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Patients"
        action={
          <Link href="/patients/new" className={btnPrimary}>
            Register patient
          </Link>
        }
      />

      <form className="mb-4">
        <input
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="Name, phone or patient number"
          className={`max-w-md ${input}`}
        />
      </form>

      {patients.length === 0 ? (
        <Empty href="/patients/new" cta={query ? "Register them" : undefined}>
          {query
            ? `No patient matches “${query}”.`
            : "No patients yet."}
        </Empty>
      ) : (
        <Panel className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--color-line)] bg-[var(--color-surface)] text-left text-xs text-[var(--color-muted)]">
              <tr>
                <th className="py-2 pl-4 pr-3 font-medium">No.</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="py-2 pl-3 pr-4 font-medium">Registered</th>
              </tr>
            </thead>

            <tbody>
              {patients.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[var(--color-line)] last:border-0"
                >
                  <td className="py-2.5 pl-4 pr-3 text-[var(--color-faint)]">
                    {p.code}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/patients/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.name}
                    </Link>
                    {p.allergies && (
                      <span className="ml-2 text-xs text-[var(--color-missed)]">
                        Allergy: {p.allergies}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{p.phone}</td>
                  <td className="px-3 py-2.5">
                    {age(p.dob, p.ageAtRegistration)}
                  </td>
                  <td className="py-2.5 pl-3 pr-4 text-[var(--color-muted)]">
                    {date(p.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import "./globals.css";
import { db } from "@/lib/db";
import { optionalSession } from "@/lib/session";
import { signOut } from "@/lib/actions";

export const metadata: Metadata = {
  title: "Clinic",
  description: "OPD management",
};

const nav = [
  { href: "/", label: "Today" },
  { href: "/patients", label: "Patients" },
  { href: "/appointments/new", label: "Book appointment" },
  { href: "/reminders", label: "Reminders" },
  { href: "/reports", label: "Collection" },
  { href: "/settings", label: "Settings" },
];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await optionalSession();

  // Signed out (the login page) renders bare, with no chrome around it.
  if (!session) {
    return (
      <html lang="en">
        <body className="min-h-screen bg-[var(--color-surface)]">
          {children}
        </body>
      </html>
    );
  }

  const clinic = await db.clinic.findUnique({
    where: { id: session.clinicId },
    select: { name: true, city: true },
  });

  // The cookie is signed and valid but points at a clinic that is no
  // longer there — almost always a database reset in development,
  // occasionally a deleted tenant. Without this the app 500s on the
  // first write with a foreign key error instead of saying "sign in
  // again".
  //
  // The cookie is NOT cleared here: a layout cannot write cookies in
  // Next, only a server action or route handler can. /login clears
  // it on arrival instead.
  if (!clinic) redirect("/login");

  const today = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  }).format(new Date());

  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <nav className="no-print flex w-52 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-surface)]">
            <div className="border-b border-[var(--color-line)] px-4 py-4">
              <div className="text-sm font-semibold leading-tight tracking-tight">
                {clinic.name}
              </div>
              {clinic?.city && (
                <div className="mt-0.5 text-xs text-[var(--color-faint)]">
                  {clinic.city}
                </div>
              )}
            </div>

            <ul className="flex-1 space-y-0.5 p-3">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-md px-2.5 py-1.5 text-sm text-[var(--color-muted)] hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="border-t border-[var(--color-line)] px-4 py-3">
              <div className="text-sm font-medium leading-tight">
                {session.name}
              </div>
              <div className="text-xs text-[var(--color-faint)]">
                {session.role.toLowerCase()}
              </div>

              <form action={signOut}>
                <button className="mt-2 text-xs text-[var(--color-muted)] underline underline-offset-2 hover:text-[var(--color-ink)]">
                  Sign out
                </button>
              </form>
            </div>
          </nav>

          <div className="min-w-0 flex-1">
            <header className="no-print border-b border-[var(--color-line)] bg-[var(--color-panel)] px-6 py-2.5">
              <span className="text-xs text-[var(--color-muted)]">{today}</span>
            </header>

            <main className="p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}

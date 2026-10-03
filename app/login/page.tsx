// app/login/page.tsx
//
// Rendered without the app shell — the root layout detects no session and
// drops the sidebar.

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { optionalSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await optionalSession();

  if (session) {
    // Only bounce to the app if the session still points at a clinic
    // that exists. A stale cookie — after a database reset, say —
    // would otherwise ping-pong between here and the layout forever.
    // Signing in again overwrites the cookie, which is the fix.
    const clinic = await db.clinic.findUnique({
      where: { id: session.clinicId },
      select: { id: true },
    });

    if (clinic) redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Clinic management
          </p>
        </div>

        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-6 shadow-[var(--shadow-panel)]">
          <LoginForm />
        </div>

        <p className="mt-4 text-xs text-[var(--color-faint)]">
          Patient records are confidential. Do not share your password or
          leave this screen signed in on a shared computer.
        </p>
      </div>
    </div>
  );
}

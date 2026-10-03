// lib/session.ts
//
// The single place the app answers "who is asking, and which clinic do
// they belong to". Every query in the app scopes by what this returns.
//
// Pages do not check auth individually — they all call currentClinicId(),
// and an unauthenticated caller is redirected to /login from here. That
// keeps it impossible to forget the check on a new page.

import { redirect } from "next/navigation";
import { readSession, type SessionData } from "./auth";

export async function requireSession(): Promise<SessionData> {
  const session = await readSession();

  if (!session) redirect("/login");

  return session;
}

export async function currentClinicId(): Promise<string> {
  const session = await requireSession();
  return session.clinicId;
}

export async function currentStaffId(): Promise<string> {
  const session = await requireSession();
  return session.staffId;
}

// For the layout, which needs to render differently when signed out
// rather than redirect.
export async function optionalSession(): Promise<SessionData | null> {
  return readSession();
}

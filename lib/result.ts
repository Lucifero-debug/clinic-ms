// lib/result.ts
//
// Every server action returns one of these instead of throwing. A thrown
// error in a server action shows the user a blank Next.js error screen and
// loses whatever they typed — unacceptable at a busy front desk.
//
// Actions still throw for things that should never happen (an id that
// doesn't belong to this clinic). Those are caught by app/error.tsx.

export type ActionState = {
  error?: string;
  ok?: string;
} | null;

export function fail(message: string): ActionState {
  return { error: message };
}

export function done(message: string): ActionState {
  return { ok: message };
}

// --- small validators, so error text is consistent everywhere ------

export function requireText(
  value: FormDataEntryValue | null,
  field: string,
  max = 200
): { value: string } | { error: string } {
  const v = String(value ?? "").trim();

  if (!v) return { error: `${field} is required.` };
  if (v.length > max) return { error: `${field} is too long.` };

  // `{ value }` shorthand here would return the raw parameter, not
  // the trimmed local. It typechecks in dev (which does not run tsc)
  // and fails the production build.
  return { value: v };
}

// Indian mobile numbers are 10 digits, optionally with +91. Landlines
// vary, so this stays deliberately loose — rejecting a real patient's
// number is worse than storing an odd one.
export function requirePhone(
  value: FormDataEntryValue | null
): { value: string } | { error: string } {
  const raw = String(value ?? "").trim();

  if (!raw) return { error: "Phone number is required." };

  const digits = raw.replace(/\D/g, "");

  if (digits.length < 10) {
    return { error: "Phone number needs at least 10 digits." };
  }
  if (digits.length > 13) {
    return { error: "That phone number looks too long." };
  }

  return { value: raw };
}

export function optionalNumber(
  value: FormDataEntryValue | null,
  field: string,
  opts: { min?: number; max?: number } = {}
): { value: number | null } | { error: string } {
  const raw = String(value ?? "").trim();

  if (!raw) return { value: null };

  const n = Number(raw);

  if (!Number.isFinite(n)) return { error: `${field} must be a number.` };
  if (opts.min !== undefined && n < opts.min) {
    return { error: `${field} cannot be below ${opts.min}.` };
  }
  if (opts.max !== undefined && n > opts.max) {
    return { error: `${field} cannot be above ${opts.max}.` };
  }

  return { value: n };
}

export function isError<T>(r: T | { error: string }): r is { error: string } {
  return typeof r === "object" && r !== null && "error" in r;
}

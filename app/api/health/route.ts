// app/api/health/route.ts
//
// TEMPORARY DIAGNOSTIC — delete this file once deployment works.
//
// A 500 on POST /login tells you nothing about which of the three
// usual causes it is. This reports all three without exposing any
// value: whether the environment variables are present, whether the
// database answers, and whether it has been seeded.
//
// It deliberately returns no secrets, no connection string and no
// patient data — only booleans and counts. Even so, it is an
// unauthenticated endpoint on a clinical system, so remove it.

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, unknown> = {};

  // --- environment ---------------------------------------------

  const dbUrl = process.env.DATABASE_URL;
  const secret = process.env.SESSION_SECRET;

  checks.DATABASE_URL = {
    present: Boolean(dbUrl),
    // The shape, not the value. Enough to spot a pooled URL or one
    // pasted with quotes around it.
    looksLikePostgres: dbUrl?.startsWith("postgres") ?? false,
    isPooled: dbUrl?.includes("-pooler") ?? false,
    hasStrayQuotes: dbUrl ? /^["']|["']$/.test(dbUrl) : false,
  };

  checks.SESSION_SECRET = {
    present: Boolean(secret),
    longEnough: (secret?.length ?? 0) >= 32,
    length: secret?.length ?? 0,
    hasStrayQuotes: secret ? /^["']|["']$/.test(secret) : false,
  };

  checks.region = process.env.VERCEL_REGION ?? "local";

  // --- database -------------------------------------------------

  const startedAt = Date.now();

  try {
    // Cheapest possible query. If this fails, nothing else will work.
    await db.$queryRaw`SELECT 1`;

    checks.database = {
      reachable: true,
      roundTripMs: Date.now() - startedAt,
    };

    // Seeded? Counts only, no rows.
    try {
      const [clinics, staff, withPassword] = await Promise.all([
        db.clinic.count(),
        db.staff.count(),
        db.staff.count({ where: { passwordHash: { not: null } } }),
      ]);

      checks.data = {
        clinics,
        staff,
        staffWithPasswords: withPassword,
        seeded: clinics > 0 && withPassword > 0,
      };
    } catch (err) {
      // Reachable but no tables — db push was never run against this
      // database.
      checks.data = {
        error: (err as Error).message.split("\n")[0],
        hint: "Tables are probably missing. Run `npx prisma db push` against this database.",
      };
    }
  } catch (err) {
    checks.database = {
      reachable: false,
      roundTripMs: Date.now() - startedAt,
      error: (err as Error).message.split("\n")[0],
    };
  }

  // --- verdict --------------------------------------------------

  const env = checks.DATABASE_URL as { present: boolean };
  const sec = checks.SESSION_SECRET as { present: boolean; longEnough: boolean };
  const database = checks.database as { reachable: boolean };
  const data = checks.data as { seeded?: boolean } | undefined;

  let verdict: string;

  if (!env.present) {
    verdict = "DATABASE_URL is not set for this environment. Add it in Vercel and REDEPLOY.";
  } else if (!database.reachable) {
    verdict = "DATABASE_URL is set but the database did not answer. Wrong string, wrong region, or the database is asleep.";
  } else if (!data?.seeded) {
    verdict = "Database is reachable but has no clinic or no staff passwords. Run `npx prisma db push` and `npm run db:seed` against THIS database.";
  } else if (!sec.present) {
    verdict = "SESSION_SECRET is not set. Sign-in will find the user and then fail when it tries to create the cookie.";
  } else if (!sec.longEnough) {
    verdict = "SESSION_SECRET is shorter than 32 characters, which lib/auth.ts rejects.";
  } else {
    verdict = "Everything this endpoint can check is fine. If login still fails, read the Vercel runtime logs.";
  }

  return Response.json(
    { verdict, checks },
    { headers: { "Cache-Control": "no-store" } }
  );
}

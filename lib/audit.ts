// lib/audit.ts
//
// Who looked at or changed which patient record.
//
// This is not optional for health data — it is what lets the clinic answer
// "who accessed this file" months later. Writes are fire-and-forget: an
// audit failure must never break the clinical workflow, but it must be
// visible in the logs.

import { db } from "./db";
import { readSession } from "./auth";

type AuditInput = {
  action: string; // "patient.view", "visit.update", "invoice.cancel"
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
};

export async function audit(input: AuditInput): Promise<void> {
  try {
    const session = await readSession();
    if (!session) return;

    await db.auditLog.create({
      data: {
        clinicId: session.clinicId,
        staffId: session.staffId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
      },
    });
  } catch (err) {
    console.error("audit write failed:", err);
  }
}

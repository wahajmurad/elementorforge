import { db } from '@/lib/db';
import { AuditMeta } from '@/lib/types';

export async function audit(entry: { userId?: string | null; siteId?: string | null; action: string; ip?: string | null; meta?: AuditMeta }) {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId ?? undefined,
        siteId: entry.siteId ?? undefined,
        action: entry.action,
        ip: entry.ip ?? null,
        meta: JSON.stringify(entry.meta ?? {}),
      },
    });
  } catch {
    // Audit logging must never break the request path; server logs still capture errors.
    console.error('[audit] failed to persist', entry.action);
  }
}

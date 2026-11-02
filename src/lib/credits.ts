import { db } from '@/lib/db';
import { InsufficientCreditsError, NotFoundError } from '@/lib/errors';

/**
 * Atomic credit ledger. Server-side enforcement only — the client never
 * computes or passes amounts. Every mutation is one CreditEntry row with a
 * UNIQUE idempotencyKey, making duplicate requests (retries, double-clicks,
 * replayed webhooks) collapse to a single charge.
 *
 * Flow for a build job:
 *   reserve(jobId, amount)   → negative entry `reserve:{jobId}`
 *   consume(jobId, actual)   → negative entry `consume:{jobId}` (actual ≤ reserved),
 *                              plus positive entry `release:{jobId}` refunding the diff
 *   release(jobId)           → positive entry `release:{jobId}` refunding the full
 *                              reserve (job failed before consumption)
 */

// In-process per-user mutex. SQLite serializes writes; with Postgres in
// production, additionally wrap in SELECT ... FOR UPDATE (see docs/SECURITY.md).
const locks = new Map<string, Promise<unknown>>();
function withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(userId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  const store: Promise<unknown> = next
    .catch(() => {}) // never poison the chain with a rejection
    .finally(() => { if (locks.get(userId) === store) locks.delete(userId); });
  locks.set(userId, store);
  return next;
}

export const COSTS = {
  BUILD_BASE: 3,        // analyze + sitemap + design system
  PER_PAGE: 5,          // per generated Elementor page
  REVISION: 2,          // per AI revision of one page
  RETRY_PAGE: 0,        // retries of a failed page are free (we charge the page once)
};

export function costForBuild(pageCount: number): number {
  return COSTS.BUILD_BASE + Math.max(1, pageCount) * COSTS.PER_PAGE;
}

export async function getBalance(userId: string): Promise<number> {
  const agg = await db.creditEntry.aggregate({ where: { userId }, _sum: { delta: true } });
  return agg._sum.delta ?? 0;
}

async function lastBalance(userId: string): Promise<number> {
  const last = await db.creditEntry.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return last?.balanceAfter ?? 0;
}

/** Insert one entry atomically and return it. Throws on duplicate idempotencyKey. */
async function insertEntry(tx: {
  creditEntry: {
    create: (args: { data: {
      userId: string; delta: number; balanceAfter: number; reason: string;
      idempotencyKey?: string; jobId?: string; meta?: string;
    } }) => Promise<{ id: string; delta: number; balanceAfter: number }>;
  };
}, userId: string, delta: number, reason: string, opts: { idempotencyKey?: string; jobId?: string; meta?: object } = {}) {
  const balanceAfter = (await lastBalance(userId)) + delta;
  return tx.creditEntry.create({
    data: {
      userId,
      delta,
      balanceAfter,
      reason,
      idempotencyKey: opts.idempotencyKey,
      jobId: opts.jobId,
      meta: JSON.stringify(opts.meta ?? {}),
    },
  });
}

export async function grant(userId: string, amount: number, reason: string, opts: { idempotencyKey?: string; jobId?: string; meta?: object } = {}) {
  if (amount <= 0) throw new Error('Grant amount must be positive');
  return withUserLock(userId, async () => {
    if (opts.idempotencyKey) {
      const existing = await db.creditEntry.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
      if (existing) return existing; // idempotent: already granted
    }
    return db.$transaction(tx => insertEntry(tx as never, userId, amount, reason, opts));
  });
}

/** Reserve credits before starting a job. Throws InsufficientCreditsError. */
export async function reserve(userId: string, amount: number, jobId: string): Promise<void> {
  if (amount <= 0) return;
  await withUserLock(userId, async () => {
    const existing = await db.creditEntry.findUnique({ where: { idempotencyKey: `reserve:${jobId}` } });
    if (existing) return; // already reserved (retry path)
    const balance = await lastBalance(userId);
    if (balance < amount) throw new InsufficientCreditsError(balance, amount);
    await db.$transaction(tx => insertEntry(tx as never, userId, -amount, 'build_reserve', {
      idempotencyKey: `reserve:${jobId}`, jobId,
    }));
  });
}

/** Finalize a successful job: the actual cost replaces the reserve (refund the diff). */
export async function consume(jobId: string, userId: string, actual: number): Promise<void> {
  await withUserLock(userId, async () => {
    const alreadyConsumed = await db.creditEntry.findUnique({ where: { idempotencyKey: `consume:${jobId}` } });
    if (alreadyConsumed) return;
    const reservedEntry = await db.creditEntry.findUnique({ where: { idempotencyKey: `reserve:${jobId}` } });
    const reserved = Math.abs(reservedEntry?.delta ?? 0);
    const final = Math.min(actual, reserved);
    await db.$transaction(async tx => {
      // Net effect = -final. The reserve already took -reserved, so refund the diff.
      const refund = reserved - final;
      if (refund > 0) await insertEntry(tx as never, userId, refund, 'build_release', { idempotencyKey: `release:${jobId}`, jobId });
      // actual exceeded the reserve (defensive; pipeline should never allow this)
      if (actual > reserved) await insertEntry(tx as never, userId, -(actual - reserved), 'build_consume', { idempotencyKey: `consume:${jobId}`, jobId });
      else await insertEntry(tx as never, userId, 0, 'build_consume', { idempotencyKey: `consume:${jobId}`, jobId, meta: { final, reserved } });
    });
  });
}

/** Refund a full reserve (job failed before any consumption). */
export async function release(jobId: string, userId: string): Promise<void> {
  await withUserLock(userId, async () => {
    const reserveEntry = await db.creditEntry.findUnique({ where: { idempotencyKey: `reserve:${jobId}` } });
    if (!reserveEntry) return;
    const alreadyReleased = await db.creditEntry.findUnique({ where: { idempotencyKey: `release:${jobId}` } });
    if (alreadyReleased) return;
    const refund = Math.abs(reserveEntry.delta);
    if (refund <= 0) return;
    await db.$transaction(tx => insertEntry(tx as never, userId, refund, 'build_release', { idempotencyKey: `release:${jobId}`, jobId }));
  });
}

export async function listLedger(userId: string, limit = 50) {
  const entries = await db.creditEntry.findMany({
    where: { userId }, orderBy: { createdAt: 'desc' }, take: limit,
  });
  return entries.map(e => ({
    id: e.id, delta: e.delta, balanceAfter: e.balanceAfter, reason: e.reason,
    jobId: e.jobId, createdAt: e.createdAt.toISOString(), meta: JSON.parse(e.meta || '{}'),
  }));
}

export async function requireActiveSubscription(userId: string) {
  const sub = await db.subscription.findFirst({
    where: { userId, status: 'active' },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  });
  if (!sub) throw new NotFoundError('No active subscription');
  return sub;
}

import { describe, it, expect, beforeAll } from 'vitest';
import { registerUser, createSession, getSessionUser } from '@/lib/auth';
import type { NextRequest } from 'next/server';
import { onboardUser, getUserEntitlements, assertCanAddSite } from '@/lib/plans';
import { grant, reserve, consume, release, getBalance, costForBuild } from '@/lib/credits';
import { InsufficientCreditsError } from '@/lib/errors';
import { db } from '@/lib/db';

let seq = 0;
const email = () => `test-user-${Date.now()}-${seq++}@example.com`;

async function fakeRequest(headers: Record<string, string> = {}): Promise<NextRequest> {
  const { NextRequest: NR } = await import('next/server');
  return new NR('http://localhost:3000/api/test', { headers: new Headers(headers) });
}

describe('auth + onboarding', () => {
  it('registers, onboards, and resolves sessions from cookies', async () => {
    const user = await registerUser(email(), 'super-secret-9', 'Testy');
    await onboardUser(user.id);
    const req = await fakeRequest();
    const { token } = await createSession(user.id, req);
    const sessionReq = await fakeRequest({ cookie: `ef_session=${token}` });
    const resolved = await getSessionUser(sessionReq);
    expect(resolved?.id).toBe(user.id);
    const ent = await getUserEntitlements(user.id);
    expect(ent.plan?.code).toBe('free');
    expect(ent.balance).toBe(25);
  });

  it('rejects short passwords and duplicate emails', async () => {
    const e = email();
    await registerUser(e, 'long-enough-1');
    await expect(registerUser(e, 'long-enough-2')).rejects.toThrow(/already exists/);
    await expect(registerUser(email(), 'short')).rejects.toThrow(/8 characters/);
  });
});

describe('credit ledger (double-charge protection)', () => {
  let userId: string;
  let run: number;

  beforeAll(async () => {
    run = Date.now();
    const u = await registerUser(email(), 'credit-test-1');
    userId = u.id;
    await grant(userId, 100, 'admin_grant', { idempotencyKey: `t-grant-${userId}` });
  });

  it('grant is idempotent by key', async () => {
    await grant(userId, 50, 'admin_grant', { idempotencyKey: `t2-${userId}` });
    await grant(userId, 50, 'admin_grant', { idempotencyKey: `t2-${userId}` });
    await grant(userId, 50, 'admin_grant', { idempotencyKey: `t2-${userId}` });
    expect(await getBalance(userId)).toBe(150);
  });

  it('cost model matches the pricing rules', () => {
    expect(costForBuild(1)).toBe(8);
    expect(costForBuild(4)).toBe(23);
  });

  it('reserve → consume refunds the unused reserve exactly once', async () => {
    await reserve(userId, 20, `job-A-${run}`);
    expect(await getBalance(userId)).toBe(130);
    await consume(`job-A-${run}`, userId, 8);
    expect(await getBalance(userId)).toBe(142);
    await consume(`job-A-${run}`, userId, 8); // replay — no-op
    expect(await getBalance(userId)).toBe(142);
  });

  it('reserve → release refunds in full, once', async () => {
    await reserve(userId, 10, `job-B-${run}`);
    expect(await getBalance(userId)).toBe(132);
    await release(`job-B-${run}`, userId);
    await release(`job-B-${run}`, userId);
    expect(await getBalance(userId)).toBe(142);
  });

  it('refuses reservations beyond the balance', async () => {
    await expect(reserve(userId, 100000, `job-C-${run}`)).rejects.toBeInstanceOf(InsufficientCreditsError);
  });
});

describe('plan site quota', () => {
  it('enforces max sites per plan', async () => {
    const u = await registerUser(email(), 'quota-test-1');
    await onboardUser(u.id);
    await assertCanAddSite(u.id); // free = 1 site, none yet
    await db.site.create({ data: { userId: u.id, name: 'S', url: 'https://x.example', mode: 'connector', status: 'pending' } });
    await expect(assertCanAddSite(u.id)).rejects.toThrow(/allows 1/);
  });
});

import { db } from '@/lib/db';
import { grant, getBalance } from '@/lib/credits';

export const PLAN_SEED = [
  {
    code: 'free', name: 'Free', priceCents: 0, monthlyCredits: 0, maxSites: 1, sortOrder: 0,
    features: ['1 connected site', '25 signup credits', 'Draft generation', 'Community support'],
  },
  {
    code: 'starter', name: 'Starter', priceCents: 1900, monthlyCredits: 200, maxSites: 2, sortOrder: 1,
    features: ['2 connected sites', '200 AI credits / month', 'AI revisions', 'Email support'],
  },
  {
    code: 'pro', name: 'Pro', priceCents: 4900, monthlyCredits: 600, maxSites: 5, sortOrder: 2,
    features: ['5 connected sites', '600 AI credits / month', 'Priority builds', 'Elementor Pro support checks'],
  },
  {
    code: 'agency', name: 'Agency', priceCents: 14900, monthlyCredits: 2000, maxSites: 20, sortOrder: 3,
    features: ['20 connected sites', '2000 AI credits / month', 'White-glove retries', 'Audit log export'],
  },
];

export async function ensurePlansSeeded() {
  for (const p of PLAN_SEED) {
    await db.plan.upsert({
      where: { code: p.code },
      update: { name: p.name, priceCents: p.priceCents, monthlyCredits: p.monthlyCredits, maxSites: p.maxSites, features: JSON.stringify(p.features) },
      create: { ...p, features: JSON.stringify(p.features) },
    });
  }
}

export async function listPlans() {
  await ensurePlansSeeded();
  const plans = await db.plan.findMany({ orderBy: { sortOrder: 'asc' } });
  return plans.map(p => ({ ...p, features: JSON.parse(p.features) as string[] }));
}

export const SIGNUP_BONUS_CREDITS = 25;

/** Create the default free subscription + signup bonus for a new user. */
export async function onboardUser(userId: string) {
  await ensurePlansSeeded();
  const existing = await db.subscription.findFirst({ where: { userId } });
  if (existing) return existing;
  const free = await db.plan.findUniqueOrThrow({ where: { code: 'free' } });
  const sub = await db.subscription.create({
    data: { userId, planId: free.id, status: 'active', provider: 'test' },
  });
  await grant(userId, SIGNUP_BONUS_CREDITS, 'signup_bonus', {
    idempotencyKey: `signup_bonus:${userId}`,
  });
  return sub;
}

export async function getUserEntitlements(userId: string) {
  const sub = await db.subscription.findFirst({
    where: { userId, status: 'active' },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  });
  const [balance, siteCount] = await Promise.all([
    getBalance(userId),
    db.site.count({ where: { userId, status: { not: 'disconnected' } } }),
  ]);
  return {
    plan: sub ? { code: sub.plan.code, name: sub.plan.name, maxSites: sub.plan.maxSites, monthlyCredits: sub.plan.monthlyCredits, priceCents: sub.plan.priceCents } : null,
    balance,
    siteCount,
  };
}

/** Check site quota against plan. */
export async function assertCanAddSite(userId: string) {
  const ent = await getUserEntitlements(userId);
  const max = ent.plan?.maxSites ?? 1;
  if (ent.siteCount >= max) {
    throw Object.assign(new Error(`Your plan allows ${max} connected site(s). Upgrade to add more.`), { name: 'PlanLimitError' });
  }
}

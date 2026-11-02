import { db } from '@/lib/db';
import { grant } from '@/lib/credits';
import { ValidationError } from '@/lib/errors';
import { audit } from '@/lib/audit';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Billing module. Provider-pluggable:
 *  - provider "test"  : instant activation (sandbox/demo/dev). Clearly labeled in UI.
 *  - provider "stripe": Stripe Checkout via REST API (no SDK needed) + signed webhook.
 * Stripe activates when STRIPE_SECRET_KEY is set; otherwise the test provider is used.
 */

const STRIPE_API = 'https://api.stripe.com/v1';

function stripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripeRequest(path: string, params: Record<string, string>) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) throw new Error(`Stripe API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function startCheckout(userId: string, planCode: string, origin: string) {
  const plan = await db.plan.findUnique({ where: { code: planCode } });
  if (!plan) throw new ValidationError('Unknown plan');

  if (!stripeEnabled() || plan.priceCents === 0) {
    // Test mode: activate immediately and grant this period's credits.
    const sub = await db.subscription.findFirst({ where: { userId, status: 'active' } });
    if (sub) {
      await db.subscription.update({ where: { id: sub.id }, data: { planId: plan.id } });
    } else {
      await db.subscription.create({ data: { userId, planId: plan.id, status: 'active', provider: 'test' } });
    }
    const periodKey = new Date().toISOString().slice(0, 10);
    if (plan.monthlyCredits > 0) {
      await grant(userId, plan.monthlyCredits, 'plan_grant', {
        idempotencyKey: `plan_grant:${userId}:${plan.code}:${periodKey}`,
        meta: { plan: plan.code, period: periodKey },
      });
    }
    await audit({ userId, action: 'billing.test_activate', meta: { plan: plan.code } });
    return { mode: 'test' as const, plan: plan.code };
  }

  // Stripe Checkout Session
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const session = await stripeRequest('/checkout/sessions', {
    mode: 'subscription',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][product_data][name]': `ElementorForge ${plan.name}`,
    'line_items[0][price_data][unit_amount]': String(plan.priceCents),
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][quantity]': '1',
    customer_email: user.email,
    client_reference_id: `${userId}:${plan.id}`,
    success_url: `${origin}/?view=billing&checkout=success`,
    cancel_url: `${origin}/?view=billing&checkout=cancel`,
  });
  await audit({ userId, action: 'billing.stripe_checkout_created', meta: { plan: plan.code, sessionId: session.id } });
  return { mode: 'stripe' as const, url: session.url as string, plan: plan.code };
}

/** Fulfillment shared by Stripe webhook + manual ops. Idempotent per period. */
export async function fulfillSubscription(userId: string, planId: string, periodKey: string) {
  const plan = await db.plan.findUniqueOrThrow({ where: { id: planId } });
  const sub = await db.subscription.findFirst({ where: { userId, status: 'active' } });
  if (sub) await db.subscription.update({ where: { id: sub.id }, data: { planId: plan.id, provider: 'stripe' } });
  else await db.subscription.create({ data: { userId, planId: plan.id, status: 'active', provider: 'stripe' } });
  if (plan.monthlyCredits > 0) {
    await grant(userId, plan.monthlyCredits, 'plan_grant', {
      idempotencyKey: `plan_grant:${userId}:${plan.code}:${periodKey}`,
      meta: { plan: plan.code, period: periodKey },
    });
  }
}

/** Verify Stripe webhook signature (t=timestamp,v1=sig scheme, HMAC-SHA256). */
export function verifyStripeSignature(payload: string, header: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=') as [string, string]));
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${payload}`).digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

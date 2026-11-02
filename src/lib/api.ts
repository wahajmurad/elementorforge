import { NextRequest, NextResponse } from 'next/server';
import { AuthError, UnauthorizedError, NotFoundError, ForbiddenError, ValidationError, RateLimitError, InsufficientCreditsError } from '@/lib/errors';

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function json(data: unknown, init?: number | ResponseInit) {
  const responseInit = typeof init === 'number' ? { status: init } : init;
  return NextResponse.json(data as object, responseInit);
}

/** Maps domain errors to HTTP codes; everything else → 500 (logged). */
export function errorResponse(err: unknown) {
  if (err instanceof UnauthorizedError) return json({ error: 'Authentication required' }, 401);
  if (err instanceof AuthError) return json({ error: err.message }, 400);
  if (err instanceof ValidationError) return json({ error: err.message }, 422);
  if (err instanceof NotFoundError) return json({ error: err.message }, 404);
  if (err instanceof ForbiddenError) return json({ error: err.message }, 403);
  if (err instanceof RateLimitError) return json({ error: err.message }, 429);
  if (err instanceof InsufficientCreditsError) {
    return json({ error: err.message, code: 'insufficient_credits', balance: err.balance, needed: err.needed }, 402);
  }
  const name = (err as Error)?.name;
  if (name === 'PlanLimitError') return json({ error: (err as Error).message, code: 'plan_limit' }, 403);
  console.error('[api] unexpected error:', err);
  return json({ error: 'Internal server error' }, 500);
}

export function handle(fn: () => Promise<NextResponse>) {
  return fn().catch(errorResponse);
}

export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}

// In-memory rate limiter (per key). Production: swap for Redis limiter
// (see docs/SECURITY.md); the interface stays the same.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  b.count++;
  if (b.count > limit) throw new RateLimitError('Too many requests — please slow down and try again shortly.');
}

export function baseUrlFrom(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}

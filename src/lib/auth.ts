import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword, randomToken, sha256 } from '@/lib/crypto';
import { audit } from '@/lib/audit';
// Canonical error classes — must be the SAME classes that api.ts errorResponse()
// checks with instanceof, otherwise thrown errors fall through to a 500.
import { AuthError, UnauthorizedError } from '@/lib/errors';

export { AuthError, UnauthorizedError };

const SESSION_COOKIE = 'ef_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  onboardedAt: string | null;
}

export function toSafeUser(u: { id: string; email: string; name: string | null; role: string; onboardedAt: Date | null }): SafeUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, onboardedAt: u.onboardedAt ? u.onboardedAt.toISOString() : null };
}

export async function registerUser(email: string, password: string, name?: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new AuthError('Invalid email address');
  if (password.length < 8) throw new AuthError('Password must be at least 8 characters');
  const existing = await db.user.findUnique({ where: { email: normalized } });
  if (existing) throw new AuthError('An account with this email already exists');
  const user = await db.user.create({
    data: { email: normalized, passwordHash: hashPassword(password), name: name?.trim() || null },
  });
  await audit({ userId: user.id, action: 'auth.register' });
  return user;
}

export async function loginUser(email: string, password: string, req: NextRequest) {
  const normalized = email.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { email: normalized } });
  // Uniform error + dummy verify to avoid user enumeration timing
  const ok = user ? verifyPassword(password, user.passwordHash) : verifyPassword(password, hashPassword('dummy-password-check'));
  if (!user || !ok) throw new AuthError('Invalid email or password');
  await createSession(user.id, req);
  return user;
}

export async function createSession(userId: string, req: NextRequest) {
  const token = randomToken(32);
  await db.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      ip: clientIp(req),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  await audit({ userId, action: 'auth.login', ip: clientIp(req) });
  return { token, maxAge: SESSION_TTL_MS / 1000 };
}

export function sessionCookie(token: string, maxAge: number) {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict;${secure} Max-Age=${maxAge}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export async function getSessionUser(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(cookie) }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

/** Throws UnauthorizedError when unauthenticated. Use inside API handlers. */
export async function requireUser(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function destroySession(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) await db.session.deleteMany({ where: { tokenHash: sha256(cookie) } });
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

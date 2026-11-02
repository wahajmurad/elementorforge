import { NextRequest, NextResponse } from 'next/server';
import { loginUser, createSession, sessionCookie } from '@/lib/auth';
import { getUserEntitlements } from '@/lib/plans';
import { handle, readJson, rateLimit, clientIp } from '@/lib/api';

export async function POST(req: NextRequest) {
  return handle(async () => {
    rateLimit(`login:${clientIp(req)}`, 10, 60_000);
    const body = await readJson<{ email?: string; password?: string }>(req);
    if (!body.email || !body.password) return NextResponse.json({ error: 'Email and password are required' }, { status: 422 });
    const user = await loginUser(body.email, body.password, req);
    const ent = await getUserEntitlements(user.id);
    const { token, maxAge } = await createSession(user.id, req);
    const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name }, entitlements: ent });
    res.headers.append('Set-Cookie', sessionCookie(token, maxAge));
    return res;
  });
}

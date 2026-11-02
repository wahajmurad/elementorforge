import { NextRequest, NextResponse } from 'next/server';
import { registerUser, createSession, sessionCookie } from '@/lib/auth';
import { onboardUser, getUserEntitlements } from '@/lib/plans';
import { handle, readJson } from '@/lib/api';

export async function POST(req: NextRequest) {
  return handle(async () => {
    const body = await readJson<{ email?: string; password?: string; name?: string }>(req);
    if (!body.email || !body.password) return NextResponse.json({ error: 'Email and password are required' }, { status: 422 });
    const user = await registerUser(body.email, body.password, body.name);
    await onboardUser(user.id); // free plan + signup credits
    const { token, maxAge } = await createSession(user.id, req);
    const ent = await getUserEntitlements(user.id);
    const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name }, entitlements: ent });
    res.headers.append('Set-Cookie', sessionCookie(token, maxAge));
    return res;
  });
}

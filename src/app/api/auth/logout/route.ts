import { NextRequest, NextResponse } from 'next/server';
import { destroySession, clearSessionCookie } from '@/lib/auth';
import { handle } from '@/lib/api';

export async function POST(req: NextRequest) {
  return handle(async () => {
    await destroySession(req);
    const res = NextResponse.json({ ok: true });
    res.headers.append('Set-Cookie', clearSessionCookie());
    return res;
  });
}

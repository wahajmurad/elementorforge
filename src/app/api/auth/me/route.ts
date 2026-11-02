import { NextRequest } from 'next/server';
import { getSessionUser, toSafeUser } from '@/lib/auth';
import { getUserEntitlements } from '@/lib/plans';
import { handle, json } from '@/lib/api';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await getSessionUser(req);
    if (!user) return json({ user: null });
    const entitlements = await getUserEntitlements(user.id);
    return json({ user: toSafeUser(user), entitlements });
  });
}

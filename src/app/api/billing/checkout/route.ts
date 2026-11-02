import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { startCheckout } from '@/lib/billing';
import { handle, json, readJson, baseUrlFrom, rateLimit, clientIp } from '@/lib/api';

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    rateLimit(`checkout:${clientIp(req)}`, 10, 60_000);
    const body = await readJson<{ planCode?: string }>(req);
    if (!body.planCode) return json({ error: 'planCode is required' }, 422);
    const result = await startCheckout(user.id, body.planCode, baseUrlFrom(req));
    return json(result);
  });
}

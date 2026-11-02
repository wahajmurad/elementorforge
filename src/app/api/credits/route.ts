import { NextRequest } from 'next/server';
import { requireUser } from '@/lib/auth';
import { getBalance, listLedger } from '@/lib/credits';
import { handle, json } from '@/lib/api';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const [balance, ledger] = await Promise.all([getBalance(user.id), listLedger(user.id, 60)]);
    return json({ balance, ledger });
  });
}

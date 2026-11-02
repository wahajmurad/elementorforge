import { listPlans } from '@/lib/plans';
import { handle, json } from '@/lib/api';

export async function GET() {
  return handle(async () => json({ plans: await listPlans() }));
}

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handle, json } from '@/lib/api';

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const [logs, totals] = await Promise.all([
      db.usageLog.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      db.usageLog.groupBy({
        by: ['provider', 'step'],
        where: { userId: user.id },
        _sum: { tokensIn: true, tokensOut: true },
        _count: { _all: true },
      }),
    ]);
    return json({
      usage: logs.map(l => ({
        id: l.id, provider: l.provider, model: l.model, step: l.step,
        tokensIn: l.tokensIn, tokensOut: l.tokensOut, jobId: l.jobId,
        at: l.createdAt.toISOString(),
      })),
      totals: totals.map(t => ({
        provider: t.provider, step: t.step,
        tokensIn: t._sum.tokensIn ?? 0, tokensOut: t._sum.tokensOut ?? 0,
        calls: t._count._all,
      })),
    });
  });
}

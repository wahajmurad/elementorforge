import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handle, json } from '@/lib/api';
import { NotFoundError, ForbiddenError } from '@/lib/errors';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const user = await requireUser(req);
    const job = await db.buildJob.findUnique({
      where: { id },
      include: { project: { select: { userId: true } }, logs: { orderBy: { createdAt: 'asc' }, take: 500 } },
    });
    if (!job) throw new NotFoundError('Job not found');
    if (job.project.userId !== user.id) throw new ForbiddenError('Not your job');
    return json({
      job: {
        id: job.id, type: job.type, status: job.status, step: job.step,
        progress: job.progress, error: job.error, attempts: job.attempts,
        reservedCredits: job.reservedCredits,
        startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        logs: job.logs.map(l => ({ id: l.id, level: l.level, step: l.step, message: l.message, at: l.createdAt.toISOString() })),
      },
    });
  });
}

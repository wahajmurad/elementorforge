import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handle, json, readJson, rateLimit, clientIp } from '@/lib/api';
import { NotFoundError, ForbiddenError, ValidationError, InsufficientCreditsError } from '@/lib/errors';
import { reserve, getBalance, COSTS } from '@/lib/credits';
import { enqueueJob } from '@/lib/queue/queue';
import { ensureWorker } from '@/lib/worker-init';
import { audit } from '@/lib/audit';
import { randomUUID } from 'crypto';

// Serverless: allow the AI build/pairing work to finish (Vercel Hobby max = 60s)
export const maxDuration = 60;

/** AI revision of one page via natural-language instruction. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const user = await requireUser(req);
    rateLimit(`revise:${clientIp(req)}`, 10, 60_000);
    const body = await readJson<{ pageId?: string; instruction?: string }>(req);
    if (!body.pageId) throw new ValidationError('pageId is required');
    if (!body.instruction?.trim() || body.instruction.trim().length < 4) {
      throw new ValidationError('Describe the change you want (at least a few characters)');
    }

    const project = await db.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundError('Project not found');
    if (project.userId !== user.id) throw new ForbiddenError('Not your project');

    const page = await db.generatedPage.findUnique({ where: { id: body.pageId } });
    if (!page || page.projectId !== id) throw new NotFoundError('Page not found in this project');
    if (page.status === 'failed') throw new ValidationError('This page failed to build — retry it before requesting revisions');

    const balance = await getBalance(user.id);
    if (balance < COSTS.REVISION) throw new InsufficientCreditsError(balance, COSTS.REVISION);

    const job = await db.buildJob.create({
      data: {
        projectId: id, siteId: project.siteId, type: 'revise_page', status: 'queued',
        payload: JSON.stringify({ pageId: page.id, instruction: body.instruction.trim().slice(0, 2000) }),
        reservedCredits: COSTS.REVISION,
        idempotencyKey: `revise:${randomUUID()}`,
      },
    });
    await reserve(user.id, COSTS.REVISION, job.id);
    await db.project.update({ where: { id }, data: { status: 'revising' } });
    await ensureWorker();
    await enqueueJob(job.id);
    await audit({ userId: user.id, siteId: project.siteId, action: 'page.revise_queued', meta: { pageId: page.id, jobId: job.id } });
    return json({ jobId: job.id, reservedCredits: COSTS.REVISION }, 201);
  });
}

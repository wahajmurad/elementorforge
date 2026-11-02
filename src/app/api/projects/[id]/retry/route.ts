import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handle, json, readJson } from '@/lib/api';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { enqueueJob } from '@/lib/queue/queue';
import { ensureWorker } from '@/lib/worker-init';
import { audit } from '@/lib/audit';
import { randomUUID } from 'crypto';

// Serverless: allow the AI build/pairing work to finish (Vercel Hobby max = 60s)
export const maxDuration = 60;

/** Retry a single failed page — targeted, without rebuilding successful pages. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const user = await requireUser(req);
    const body = await readJson<{ pageId?: string }>(req);
    if (!body.pageId) throw new ValidationError('pageId is required');

    const project = await db.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundError('Project not found');
    if (project.userId !== user.id) throw new ForbiddenError('Not your project');

    const page = await db.generatedPage.findUnique({ where: { id: body.pageId } });
    if (!page || page.projectId !== id) throw new NotFoundError('Page not found in this project');

    const job = await db.buildJob.create({
      data: {
        projectId: id, siteId: project.siteId, type: 'rebuild_page', status: 'queued',
        payload: JSON.stringify({ pageId: page.id }),
        idempotencyKey: `rebuild:${randomUUID()}`,
      },
    });
    await db.project.update({ where: { id }, data: { status: 'building' } });
    await ensureWorker();
    await enqueueJob(job.id);
    await audit({ userId: user.id, siteId: project.siteId, action: 'page.retry', meta: { pageId: page.id, jobId: job.id } });
    return json({ jobId: job.id }, 201);
  });
}

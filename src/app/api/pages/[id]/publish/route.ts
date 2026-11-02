import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handle, json, readJson } from '@/lib/api';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { enqueueJob } from '@/lib/queue/queue';
import { ensureWorker } from '@/lib/worker-init';
import { audit } from '@/lib/audit';
import { randomUUID } from 'crypto';

/** Approve + publish a draft page. Requires explicit approval flag. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const user = await requireUser(req);
    const body = await readJson<{ approve?: boolean }>(req).catch(() => ({ approve: true }));
    const page = await db.generatedPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundError('Page not found');
    const project = await db.project.findUnique({ where: { id: page.projectId } });
    if (!project || project.userId !== user.id) throw new ForbiddenError('Not your page');
    if (!page.wpPageId) throw new ValidationError('This page was never confirmed on WordPress — nothing to publish');
    if (page.status === 'published') return json({ ok: true, alreadyPublished: true });
    if (body.approve !== true) throw new ValidationError('Publishing requires explicit approval (approve: true)');

    await db.generatedPage.update({ where: { id }, data: { approved: true } });
    const job = await db.buildJob.create({
      data: {
        projectId: page.projectId, siteId: page.siteId, type: 'publish_page', status: 'queued',
        payload: JSON.stringify({ pageId: page.id }),
        idempotencyKey: `publish:${randomUUID()}`,
      },
    });
    await ensureWorker();
    await enqueueJob(job.id);
    await audit({ userId: user.id, siteId: page.siteId, action: 'page.publish_queued', meta: { pageId: page.id } });
    return json({ jobId: job.id }, 201);
  });
}

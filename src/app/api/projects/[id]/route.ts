import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handle, json } from '@/lib/api';
import { NotFoundError, ForbiddenError } from '@/lib/errors';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const user = await requireUser(req);
    const project = await db.project.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, name: true, url: true, mode: true, status: true, elementorVersion: true, elementorPro: true } },
        jobs: { orderBy: { createdAt: 'desc' }, take: 5, include: { logs: { orderBy: { createdAt: 'asc' }, take: 300 } } },
        generatedPages: { orderBy: { createdAt: 'asc' }, include: { revisions: { orderBy: { revision: 'desc' }, take: 5 } } },
      },
    });
    if (!project) throw new NotFoundError('Project not found');
    if (project.userId !== user.id) throw new ForbiddenError('Not your project');

    const latestJob = project.jobs[0] ?? null;
    return json({
      project: {
        id: project.id, name: project.name, status: project.status,
        businessName: project.businessName, industry: project.industry,
        brief: JSON.parse(project.brief || '{}'),
        referenceUrl: project.referenceUrl, designInstructions: project.designInstructions,
        pages: JSON.parse(project.pages || '[]'),
        designSystem: JSON.parse(project.designSystem || '{}'),
        sitemap: JSON.parse(project.sitemap || '{}'),
        site: project.site,
        createdAt: project.createdAt.toISOString(),
      },
      latestJob: latestJob ? {
        id: latestJob.id, type: latestJob.type, status: latestJob.status,
        step: latestJob.step, progress: latestJob.progress, error: latestJob.error,
        startedAt: latestJob.startedAt?.toISOString() ?? null,
        finishedAt: latestJob.finishedAt?.toISOString() ?? null,
        logs: latestJob.logs.map(l => ({
          id: l.id, level: l.level, step: l.step, message: l.message, at: l.createdAt.toISOString(),
        })),
      } : null,
      pages: project.generatedPages.map(pg => ({
        id: pg.id, title: pg.title, slug: pg.slug, status: pg.status,
        wpPageId: pg.wpPageId, revision: pg.revision, approved: pg.approved,
        error: pg.error, verifyHash: pg.verifyHash ? `${pg.verifyHash.slice(0, 12)}…` : null,
        validation: JSON.parse(pg.validationReport || '{}'),
        previewUrl: `/api/pages/${pg.id}/preview`,
        editUrl: pg.wpPageId && project.site.mode !== 'simulated'
          ? `${project.site.url.replace(/\/+$/, '')}/wp-admin/post.php?post=${pg.wpPageId}&action=elementor` : null,
        frontUrl: pg.wpPageId && project.site.mode !== 'simulated'
          ? `${project.site.url.replace(/\/+$/, '')}/?p=${pg.wpPageId}` : null,
        revisions: pg.revisions.map(r => ({ id: r.id, revision: r.revision, instruction: r.instruction, at: r.createdAt.toISOString() })),
        createdAt: pg.createdAt.toISOString(),
      })),
    });
  });
}

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handle, json } from '@/lib/api';
import { NotFoundError, ForbiddenError } from '@/lib/errors';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const user = await requireUser(req);
    const page = await db.generatedPage.findUnique({ where: { id }, include: { project: { select: { userId: true } } } });
    if (!page) throw new NotFoundError('Page not found');
    if (page.project.userId !== user.id) throw new ForbiddenError('Not your page');
    return json({
      page: {
        id: page.id, title: page.title, slug: page.slug, status: page.status,
        wpPageId: page.wpPageId, revision: page.revision, error: page.error,
        validation: JSON.parse(page.validationReport || '{}'),
        elementor: JSON.parse(page.elementorJson || '[]'),
        spec: JSON.parse(page.specJson || '{}'),
      },
    });
  });
}

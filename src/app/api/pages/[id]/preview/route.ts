import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handle, json } from '@/lib/api';
import { NotFoundError, ForbiddenError } from '@/lib/errors';
import { renderPreview } from '@/lib/elementor/preview';
import { DesignSystem } from '@/lib/elementor/design';

/**
 * Dashboard preview of a generated page. Renders the stored NATIVE
 * Elementor JSON into an approximate visual — real rendering happens in
 * WordPress (the preview here never touches the customer site).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await requireUser(req).catch(() => null);
  const page = await db.generatedPage.findUnique({
    where: { id },
    include: { project: { select: { userId: true, designSystem: true, name: true } } },
  });
  if (!page) return new Response('Not found', { status: 404 });
  if (!user || page.project.userId !== user.id) return new Response('Forbidden', { status: 403 });

  const ds = (JSON.parse(page.project.designSystem || '{}') ?? {}) as DesignSystem;
  let tree: unknown = [];
  try { tree = JSON.parse(page.elementorJson || '[]'); } catch { tree = []; }
  const html = renderPreview(tree, `${page.title} — ${page.project.name} (ElementorForge preview)`, ds.fonts);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

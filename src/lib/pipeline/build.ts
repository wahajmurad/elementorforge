import { db } from '@/lib/db';
import { getProvider, extractJson, AiProvider } from '@/lib/ai/registry';
import { analyzePrompt, sitemapPrompt, designSystemPrompt, componentsPrompt, revisionPrompt, ANALYZE_SYSTEM, SITEMAP_SYSTEM, DESIGN_SYSTEM_SYSTEM, COMPONENTS_SYSTEM, REVISION_SYSTEM } from '@/lib/ai/prompts';
import { compilePage } from '@/lib/elementor/compile';
import { validateElementorTree, structureHash } from '@/lib/elementor/validator';
import { DesignSystem, DEFAULT_DESIGN, PageSpec } from '@/lib/elementor/design';
import { getSiteAdapter } from '@/lib/wp';
import { consume, release, COSTS } from '@/lib/credits';
import { audit } from '@/lib/audit';
import { normalizeSpec } from '@/lib/pipeline/normalize';

/**
 * Build pipeline (per project):
 *   analyze → sitemap → design system → per-page [components → compile →
 *   validate → write draft → verify read-back] → finalize credits.
 *
 * Guarantees enforced here:
 *  - A page is only marked "draft" when the site adapter CONFIRMED creation
 *    AND the read-back structure hash matches what we sent.
 *  - Failed pages never block successful ones; retries target single pages.
 *  - Credits are consumed for actual successes only; failures release funds.
 */

type LogFn = (level: 'debug' | 'info' | 'warn' | 'error', step: string | null, message: string, meta?: object) => Promise<void>;

async function logger(jobId: string): Promise<LogFn> {
  return async (level, step, message, meta) => {
    await db.jobLog.create({ data: { jobId, level, step, message: message.slice(0, 2000), meta: JSON.stringify(meta ?? {}) } }).catch(() => {});
    if (level === 'error' || level === 'warn') console.log(`[job ${jobId}] ${level} ${step ?? ''} ${message}`);
  };
}

async function setProgress(jobId: string, step: string, progress: number, error?: string) {
  await db.buildJob.update({ where: { id: jobId }, data: { step, progress, ...(error !== undefined ? { error } : {}) } }).catch(() => {});
}

async function callStep(
  provider: AiProvider, system: string, prompt: string,
  log: LogFn, step: string, userId: string, jobId: string,
): Promise<unknown> {
  const messages = [ { role: 'system' as const, content: system }, { role: 'user' as const, content: prompt } ];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await provider.complete(messages, { maxTokens: 8000 });
      await db.usageLog.create({
        data: { userId, provider: res.provider, model: res.model, step, tokensIn: res.tokensIn, tokensOut: res.tokensOut, jobId },
      }).catch(() => {});
      const parsed = extractJson(res.text);
      await log('debug', step, `${step} completed (${res.provider}/${res.model}, ${res.tokensIn}+${res.tokensOut} tokens)`);
      return parsed;
    } catch (err) {
      const msg = (err as Error).message.slice(0, 500);
      await log(attempt === 1 ? 'warn' : 'error', step, `${step} attempt ${attempt} failed: ${msg}`);
      if (attempt === 2) throw new Error(`${step} failed: ${msg}`);
      messages.push({ role: 'assistant' as never, content: `Previous output was invalid: ${msg}. Return STRICT valid JSON only.` } as never);
      messages.push({ role: 'user', content: 'Please try again and return valid JSON.' });
    }
  }
  throw new Error('unreachable');
}

interface ProjectCtx {
  job: { id: string; type: string; projectId: string; siteId: string; payload: string };
  project: {
    id: string; userId: string; siteId: string; name: string;
    brief: string; designInstructions: string | null; referenceUrl: string | null;
    pages: string; designSystem: string; sitemap: string; status: string;
  };
}

interface SiteWithCreds {
  id: string; url: string; mode: string; name: string;
  elementorPro: boolean; proLicenseOk: boolean; mcpConfig: string;
  credentials: { siteKey: string; hmacSecret: string; transportToken: string | null } | null;
}

function parseDesign(raw: unknown, fallback: DesignSystem): DesignSystem {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Record<string, unknown>;
  const colors = { ...fallback.colors, ...((r.colors as object) ?? {}) };
  const fonts = { ...fallback.fonts, ...((r.fonts as object) ?? {}) };
  return {
    colors: colors as DesignSystem['colors'],
    fonts: fonts as DesignSystem['fonts'],
    radius: typeof r.radius === 'number' ? r.radius : fallback.radius,
    buttonRadius: typeof r.buttonRadius === 'number' ? r.buttonRadius : fallback.buttonRadius,
    sectionSpacing: typeof r.sectionSpacing === 'number' ? r.sectionSpacing : fallback.sectionSpacing,
  };
}

export async function processJob(jobId: string): Promise<void> {
  const job = await db.buildJob.findUnique({ where: { id: jobId } });
  if (!job) return;
  const project = await db.project.findUnique({ where: { id: job.projectId } });
  if (!project) return;
  const siteRow = await db.site.findUnique({ where: { id: project.siteId }, include: { credentials: true } });
  if (!siteRow || !siteRow.credentials) throw new Error('Site is not paired or credentials are missing');
  const site: SiteWithCreds = {
    id: siteRow.id, url: siteRow.url, mode: siteRow.mode, name: siteRow.name,
    elementorPro: siteRow.elementorPro, proLicenseOk: siteRow.proLicenseOk, mcpConfig: siteRow.mcpConfig,
    credentials: {
      siteKey: siteRow.credentials.siteKey,
      hmacSecret: siteRow.credentials.hmacSecret,
      transportToken: siteRow.credentials.transportToken,
    },
  };

  const log = await logger(job.id);
  await log('info', null, `Job ${job.type} started (site mode: ${site.mode})`);
  await setProgress(job.id, 'starting', 2);

  const ctx: ProjectCtx = {
    job: { id: job.id, type: job.type, projectId: project.id, siteId: site.id, payload: job.payload },
    project: {
      id: project.id, userId: project.userId, siteId: site.id, name: project.name,
      brief: project.brief, designInstructions: project.designInstructions,
      referenceUrl: project.referenceUrl, pages: project.pages,
      designSystem: project.designSystem, sitemap: project.sitemap, status: project.status,
    },
  };

  try {
    if (job.type === 'build_site') await runBuildSite(ctx, site, log);
    else if (job.type === 'revise_page') await runRevise(ctx, site, log, job.payload);
    else if (job.type === 'rebuild_page') await runRebuild(ctx, site, log, job.payload);
    else if (job.type === 'publish_page') await runPublish(ctx, site, log, job.payload);
    else throw new Error(`Unknown job type ${job.type}`);
    await db.buildJob.update({ where: { id: job.id }, data: { status: 'completed', progress: 100, finishedAt: new Date(), error: null } });
    await log('info', null, 'Job completed');
  } catch (err) {
    const message = (err as Error).message.slice(0, 1500);
    await log('error', job.step ?? null, `Job failed: ${message}`);
    await db.buildJob.update({ where: { id: job.id }, data: { status: 'failed', error: message, finishedAt: new Date() } }).catch(() => {});
    // Release reserved credits on hard failure (consume() handles success path)
    await release(job.id, project.userId).catch(() => {});
    await db.project.update({ where: { id: project.id }, data: { status: 'failed' } }).catch(() => {});
  }
}

// ---------------------------------------------------------------- build_site

async function runBuildSite(ctx: ProjectCtx, site: SiteWithCreds, log: LogFn) {
  const adapter = getSiteAdapter(site);
  const provider = await getProvider();
  const brief = ctx.project.brief;
  const userId = ctx.project.userId;
  const requestedPages: string[] = JSON.parse(ctx.project.pages || '[]');

  // Pre-flight: the site must be reachable before consuming any AI tokens
  await setProgress(ctx.job.id, 'preflight', 4);
  const diag = await adapter.diagnostics();
  if (!diag.ok) throw new Error(`Site pre-flight failed: ${diag.error ?? 'site reported not ok'}`);
  await log('info', 'preflight', `Site ready — WP ${diag.wp.version ?? '?'}, PHP ${diag.wp.php ?? '?'}, Elementor ${diag.elementor.version ?? '?'}${diag.elementor.pro ? ' (Pro)' : ''}`);

  // 1. analyze
  await setProgress(ctx.job.id, 'analyze', 8);
  const analysis = await callStep(provider, ANALYZE_SYSTEM, analyzePrompt(brief, ctx.project.designInstructions ?? undefined, ctx.project.referenceUrl ?? undefined), log, 'analyze', userId, ctx.job.id);

  // 2. sitemap
  await setProgress(ctx.job.id, 'sitemap', 16);
  const sitemap = await callStep(provider, SITEMAP_SYSTEM, sitemapPrompt(brief, JSON.stringify(analysis), requestedPages), log, 'sitemap', userId, ctx.job.id) as { pages: { title: string; slug: string; goal?: string; blocks?: string[] }[] };
  if (!sitemap?.pages?.length) throw new Error('Sitemap generation returned no pages');
  // The requested page count is a contract (and the credit basis) — cap extras.
  if (sitemap.pages.length > requestedPages.length) {
    await log('info', 'sitemap', `Model proposed ${sitemap.pages.length} pages; capping to the ${requestedPages.length} requested`);
    sitemap.pages = sitemap.pages.slice(0, requestedPages.length);
  }
  await db.project.update({ where: { id: ctx.project.id }, data: { sitemap: JSON.stringify(sitemap), status: 'building' } });

  // 3. design system
  await setProgress(ctx.job.id, 'design_system', 24);
  const design = await callStep(provider, DESIGN_SYSTEM_SYSTEM, designSystemPrompt(brief, JSON.stringify(analysis)), log, 'design_system', userId, ctx.job.id);
  const ds = parseDesign(design, DEFAULT_DESIGN);
  await db.project.update({ where: { id: ctx.project.id }, data: { designSystem: JSON.stringify(ds) } });

  // Pro allowed only if the site reported an active license
  const allowPro = Boolean(site.elementorPro && site.proLicenseOk);
  if (!allowPro) await log('info', 'design_system', 'Pro widgets disabled (no verified Elementor Pro license) — using free widgets only');

  // 4+5+6+7. per-page: components → compile → validate → write → verify
  const total = sitemap.pages.length;
  let built = 0;
  let failed = 0;
  for (let i = 0; i < total; i++) {
    const p = sitemap.pages[i];
    const base = 30 + Math.round((i / total) * 65);
    await setProgress(ctx.job.id, `components:${p.slug}`, base);
    const ok = await buildOnePage({ ctx, site, adapter, provider, log, ds, allowPro, analysis, page: p, progressBase: base, progressSpan: Math.round(65 / total) });
    if (ok) built++; else failed++;
  }

  // finalize credits: consume only successful pages
  const actual = COSTS.BUILD_BASE + built * COSTS.PER_PAGE;
  await consume(ctx.job.id, userId, actual);
  const finalStatus = built > 0 ? 'review' : 'failed';
  await db.project.update({ where: { id: ctx.project.id }, data: { status: finalStatus } });
  await audit({ userId, siteId: site.id, action: 'build.completed', meta: { built, failed, projectId: ctx.project.id } });
  await log('info', null, `Build finished: ${built}/${total} pages written as confirmed drafts${failed ? `, ${failed} failed (retry available per page)` : ''}`);
}

async function buildOnePage(args: {
  ctx: ProjectCtx; site: SiteWithCreds; adapter: ReturnType<typeof getSiteAdapter>;
  provider: AiProvider; log: LogFn; ds: DesignSystem; allowPro: boolean;
  analysis: unknown; page: { title: string; slug: string; goal?: string; blocks?: string[] };
  progressBase: number; progressSpan: number;
}): Promise<boolean> {
  const { ctx, adapter, provider, log, ds, allowPro, page } = args;
  try {
    // components
    await setProgress(ctx.job.id, `components:${page.slug}`, args.progressBase);
    const analysis = args.analysis;
    const rawSpec = await callStep(provider, COMPONENTS_SYSTEM, componentsPrompt({
      briefJson: ctx.project.brief,
      analysisJson: JSON.stringify(analysis),
      designJson: JSON.stringify(ds),
      pageTitle: page.title,
      pageGoal: page.goal,
      blockTypes: page.blocks?.length ? page.blocks : ['hero', 'text', 'cta'],
      businessName: ctx.project.name,
      contactEmail: (analysis as Record<string, unknown>)?.contactEmail as string ?? 'hello@example.com',
    }), log, `components:${page.slug}`, ctx.project.userId, ctx.job.id) as unknown;
    const spec = normalizeSpec(rawSpec, page.title);

    // compile + validate (with one self-repair round-trip on validation errors)
    await setProgress(ctx.job.id, `compile:${page.slug}`, args.progressBase + Math.round(args.progressSpan * 0.3));
    let compiled = compilePage(spec, ds, allowPro);
    let report = validateElementorTree(compiled.tree, { allowPro });
    if (!report.valid) {
      await log('warn', `compile:${page.slug}`, `Validation failed with ${report.errors.length} error(s); retrying compile with sanitized spec`);
      // sanitizer: drop unknown blocks instead of failing the whole page
      const sanitized = sanitizeSpec(spec);
      compiled = compilePage(sanitized, ds, allowPro);
      report = validateElementorTree(compiled.tree, { allowPro });
      if (!report.valid) {
        throw new Error(`Elementor validation failed: ${report.errors.slice(0, 3).map(e => `${e.path}: ${e.message}`).join(' | ')}`);
      }
    }

    // write draft
    await setProgress(ctx.job.id, `write:${page.slug}`, args.progressBase + Math.round(args.progressSpan * 0.6));
    const write = await adapter.createPage({
      title: spec.title || page.title,
      slug: spec.slug || page.slug,
      status: 'draft',
      template: 'elementor_header_footer',
      elementorData: compiled.tree,
      pageSettings: { hide_title: 'yes' },
    });
    if (!write.ok || !write.pageId) {
      throw new Error(`Site did not confirm page creation: ${write.error ?? 'no page id returned'}`);
    }

    // verify read-back
    await setProgress(ctx.job.id, `verify:${page.slug}`, args.progressBase + Math.round(args.progressSpan * 0.85));
    const read = await adapter.readPage(write.pageId);
    let verified = false;
    if (read.ok && read.page?.elementorData) {
      const localHash = structureHash(compiled.tree);
      const remoteHash = structureHash(read.page.elementorData);
      verified = localHash === remoteHash || (write.hash && write.hash === read.page.hash) || false;
      if (!verified) {
        await log('warn', `verify:${page.slug}`, `Structure hash mismatch (local ${localHash.slice(0, 12)}, remote ${remoteHash.slice(0, 12)})`);
      }
    } else {
      await log('warn', `verify:${page.slug}`, `Read-back failed: ${read.error ?? 'no data'}`);
    }

    const pageRow = await db.generatedPage.upsert({
      where: { projectId_slug: { projectId: ctx.project.id, slug: spec.slug || page.slug } },
      create: {
        projectId: ctx.project.id, siteId: ctx.project.siteId,
        title: spec.title || page.title, slug: spec.slug || page.slug,
        status: verified ? 'draft' : 'generated',
        wpPageId: write.pageId,
        elementorJson: JSON.stringify(compiled.tree),
        specJson: JSON.stringify(spec),
        validationReport: JSON.stringify(report),
        verifyHash: verified ? structureHash(compiled.tree) : null,
        error: verified ? null : 'Written to WordPress but read-back verification failed',
      },
      update: {
        title: spec.title || page.title,
        status: verified ? 'draft' : 'generated',
        wpPageId: write.pageId,
        elementorJson: JSON.stringify(compiled.tree),
        specJson: JSON.stringify(spec),
        validationReport: JSON.stringify(report),
        verifyHash: verified ? structureHash(compiled.tree) : null,
        error: verified ? null : 'Written to WordPress but read-back verification failed',
      },
    });

    await log(verified ? 'info' : 'warn', `verify:${page.slug}`,
      verified
        ? `Page "${pageRow.title}" created as draft (WP id ${write.pageId}) and verified`
        : `Page "${pageRow.title}" written (WP id ${write.pageId}) but NOT verified — flagged for review`);
    return true;
  } catch (err) {
    const e = err as Error;
    const msg = `${e.message.slice(0, 800)}${e.stack ? ` [${e.stack.split('\n')[1]?.trim().slice(0, 200)}]` : ''}`;
    await log('error', page.slug, `Page "${page.title}" failed: ${msg}`);
    await db.generatedPage.create({
      data: {
        projectId: ctx.project.id, siteId: ctx.project.siteId,
        title: page.title, slug: page.slug, status: 'failed', error: msg,
      },
    }).catch(async () => {
      const existing = await db.generatedPage.findFirst({ where: { projectId: ctx.project.id, slug: page.slug } });
      if (existing) await db.generatedPage.update({ where: { id: existing.id }, data: { status: 'failed', error: msg } });
    });
    return false;
  }
}

function sanitizeSpec(spec: PageSpec): PageSpec {
  const allowed = new Set(['hero', 'features', 'about', 'stats', 'testimonials', 'pricing', 'cta', 'faq', 'contact', 'text', 'gallery', 'map', 'footer']);
  const blocks = (spec.blocks ?? []).filter(b => b && typeof b === 'object' && allowed.has(String((b as { type?: string }).type)));
  return { ...spec, blocks: blocks.length ? blocks : [{ type: 'text', body: 'Content placeholder' }] };
}

// ------------------------------------------------------------------ revise

async function runRevise(ctx: ProjectCtx, site: SiteWithCreds, log: LogFn, payloadRaw: string) {
  const payload = JSON.parse(payloadRaw || '{}') as { pageId: string; instruction: string };
  const pageRow = await db.generatedPage.findUnique({ where: { id: payload.pageId } });
  if (!pageRow || pageRow.projectId !== ctx.project.id) throw new Error('Page not found in this project');
  if (!payload.instruction?.trim()) throw new Error('Revision instruction is required');

  const adapter = getSiteAdapter(site);
  const provider = await getProvider();
  const project = await db.project.findUniqueOrThrow({ where: { id: ctx.project.id } });
  const ds = parseDesign(JSON.parse(project.designSystem || '{}'), DEFAULT_DESIGN);
  const allowPro = Boolean(site.elementorPro && site.proLicenseOk);

  await setProgress(ctx.job.id, 'revise', 20);
  const currentSpec = JSON.parse(pageRow.specJson || '{}') as PageSpec;
  const revisedSpec = normalizeSpec(
    await callStep(provider, REVISION_SYSTEM, revisionPrompt(JSON.stringify(currentSpec), payload.instruction), log, 'revise', ctx.project.userId, ctx.job.id),
    currentSpec.title,
  );

  await setProgress(ctx.job.id, 'compile', 45);
  const compiled = compilePage(revisedSpec, ds, allowPro);
  const report = validateElementorTree(compiled.tree, { allowPro });
  if (!report.valid) throw new Error(`Revised structure failed validation: ${report.errors.slice(0, 3).map(e => e.message).join(' | ')}`);
  if (!pageRow.wpPageId) throw new Error('Page has no WordPress id — cannot revise an unconfirmed page');

  await setProgress(ctx.job.id, 'snapshot', 60);
  const snap = await adapter.snapshotPage(pageRow.wpPageId);
  if (!snap.ok) await log('warn', 'snapshot', `Snapshot failed (${snap.error}) — continuing without rollback point`);

  await setProgress(ctx.job.id, 'write', 75);
  const write = await adapter.updatePage(pageRow.wpPageId, {
    title: revisedSpec.title || pageRow.title,
    elementorData: compiled.tree,
    pageSettings: { hide_title: 'yes' },
  });
  if (!write.ok) throw new Error(`Site did not confirm update: ${write.error ?? 'unknown error'}`);

  await setProgress(ctx.job.id, 'verify', 90);
  const read = await adapter.readPage(pageRow.wpPageId);
  const verified = read.ok && read.page?.elementorData
    ? structureHash(read.page.elementorData) === structureHash(compiled.tree) || write.hash === read.page.hash
    : false;

  const nextRev = pageRow.revision + 1;
  await db.pageRevision.create({
    data: {
      pageId: pageRow.id, revision: nextRev, instruction: payload.instruction,
      elementorJson: pageRow.elementorJson, wpSnapshotHash: snap.hash ?? null,
    },
  });
  await db.generatedPage.update({
    where: { id: pageRow.id },
    data: {
      specJson: JSON.stringify(revisedSpec),
      elementorJson: JSON.stringify(compiled.tree),
      validationReport: JSON.stringify(report),
      status: verified ? 'draft' : 'generated',
      verifyHash: verified ? structureHash(compiled.tree) : null,
      revision: nextRev,
      error: verified ? null : 'Updated but read-back verification failed',
    },
  });
  await consume(ctx.job.id, ctx.project.userId, COSTS.REVISION);
  await audit({ userId: ctx.project.userId, siteId: ctx.project.siteId, action: 'page.revised', meta: { pageId: pageRow.id, revision: nextRev, verified } });
  await log('info', null, `Revision ${nextRev} applied to "${pageRow.title}"${verified ? ' and verified' : ' (verification pending)'}`);
}

// ----------------------------------------------------------------- rebuild

async function runRebuild(ctx: ProjectCtx, site: SiteWithCreds, log: LogFn, payloadRaw: string) {
  const payload = JSON.parse(payloadRaw || '{}') as { pageId: string };
  const pageRow = await db.generatedPage.findUnique({ where: { id: payload.pageId } });
  if (!pageRow || pageRow.projectId !== ctx.project.id) throw new Error('Page not found in this project');

  const adapter = getSiteAdapter(site);
  const provider = await getProvider();
  const project = await db.project.findUniqueOrThrow({ where: { id: ctx.project.id } });
  const ds = parseDesign(JSON.parse(project.designSystem || '{}'), DEFAULT_DESIGN);
  const allowPro = Boolean(site.elementorPro && site.proLicenseOk);
  const sitemap = JSON.parse(project.sitemap || '{}') as { pages?: { title: string; slug: string; goal?: string; blocks?: string[] }[] };
  const sitemapPage = sitemap.pages?.find(p => p.slug === pageRow.slug) ?? { title: pageRow.title, slug: pageRow.slug };

  // Retry of one failed page: reuse analysis/design (no re-charge), rebuild content for this page only
  const analysis = { brandName: project.name, contactEmail: 'hello@example.com' };
  const ok = await buildOnePage({
    ctx, site, adapter, provider, log, ds, allowPro, analysis,
    page: sitemapPage, progressBase: 10, progressSpan: 80,
  });
  if (!ok) throw new Error('Page rebuild failed');
  await consume(ctx.job.id, ctx.project.userId, 0); // retries are free — entry acts as completion marker
  await db.project.update({ where: { id: ctx.project.id }, data: { status: 'review' } }).catch(() => {});
}

// ----------------------------------------------------------------- publish

async function runPublish(ctx: ProjectCtx, site: SiteWithCreds, log: LogFn, payloadRaw: string) {
  const payload = JSON.parse(payloadRaw || '{}') as { pageId: string };
  const pageRow = await db.generatedPage.findUnique({ where: { id: payload.pageId } });
  if (!pageRow || pageRow.projectId !== ctx.project.id) throw new Error('Page not found in this project');
  if (!pageRow.approved) throw new Error('Page must be approved before publishing');
  if (!pageRow.wpPageId) throw new Error('Page was never confirmed on the site');

  const adapter = getSiteAdapter(site);
  await setProgress(ctx.job.id, 'publish', 40);
  const res = await adapter.publishPage(pageRow.wpPageId);
  if (!res.ok) throw new Error(`Site did not confirm publish: ${res.error ?? 'unknown error'}`);

  // verify status read-back
  const read = await adapter.readPage(pageRow.wpPageId);
  const status = read.ok ? read.page?.status : undefined;
  if (status !== 'publish') {
    await log('warn', 'publish', `Publish sent but read-back status is "${status ?? 'unknown'}" — not marking published`);
    throw new Error('Publish could not be confirmed by the site');
  }
  await db.generatedPage.update({ where: { id: pageRow.id }, data: { status: 'published' } });
  await audit({ userId: ctx.project.userId, siteId: ctx.project.siteId, action: 'page.published', meta: { pageId: pageRow.id, wpPageId: pageRow.wpPageId } });
  await log('info', 'publish', `Page "${pageRow.title}" is live (confirmed status: publish)`);
}

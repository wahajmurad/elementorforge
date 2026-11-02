import { describe, it, expect, beforeAll } from 'vitest';
import { registerUser, createSession, getSessionUser } from '@/lib/auth';
import { onboardUser } from '@/lib/plans';
import { grant, getBalance } from '@/lib/credits';
import { db } from '@/lib/db';
import { simRegistry } from '@/lib/wp/simulator';
import { getSiteAdapter } from '@/lib/wp';
import { encryptSecret, randomToken } from '@/lib/crypto';
import { processJob } from '@/lib/pipeline/build';
import { validateElementorTree } from '@/lib/elementor/validator';
import { renderPreview } from '@/lib/elementor/preview';
import type { NextRequest } from 'next/server';

/**
 * End-to-end MVP flow, exactly the mandated golden path:
 *   connect a test site → generate complete pages → verify structure →
 *   preview → revise through an AI instruction → publish with approval.
 * Runs against the simulated site (identical REST contract to the connector
 * plugin) and the deterministic mock AI provider.
 */

let seq = 0;
const email = () => `e2e-${Date.now()}-${seq++}@example.com`;
async function fakeRequest(headers: Record<string, string> = {}): Promise<NextRequest> {
  const { NextRequest: NR } = await import('next/server');
  return new NR('http://localhost:3000/x', { headers: new Headers(headers) });
}

describe('E2E: connect → build → verify → revise → publish', () => {
  let userId: string;
  let siteId: string;
  let projectId: string;

  beforeAll(async () => {
    const user = await registerUser(email(), 'e2e-password-1');
    userId = user.id;
    await onboardUser(userId);
    await grant(userId, 500, 'admin_grant', { idempotencyKey: `e2e-grant-${userId}` });

    // "Connect" a site in simulated mode (same pairing data model as connector mode)
    const site = await db.site.create({
      data: { userId, name: 'E2E Demo WP', url: 'sim://e2e', mode: 'simulated', status: 'connected', elementorPro: true, proLicenseOk: true },
    });
    siteId = site.id;
    const secret = randomToken(32);
    const siteKey = `ef_${randomToken(12)}`;
    await db.siteCredential.create({ data: { siteId, siteKey, hmacSecret: encryptSecret(secret) } });
    simRegistry.create(siteKey, secret, { pro: true });
  });

  it('site adapter reports healthy diagnostics', async () => {
    const site = await db.site.findUniqueOrThrow({ where: { id: siteId }, include: { credentials: true } });
    const diag = await getSiteAdapter(site as never).diagnostics();
    expect(diag.ok).toBe(true);
    expect(diag.elementor.active).toBe(true);
    expect(diag.elementor.pro).toBe(true);
  });

  it('builds the whole site: drafts written, verified, never overpromised', async () => {
    const project = await db.project.create({
      data: {
        userId, siteId, name: 'E2E Landscaping', businessName: 'GreenScape Co', industry: 'Landscaping',
        brief: JSON.stringify({ businessName: 'GreenScape Co', industry: 'Landscaping', description: 'Premium landscaping and garden design for homes and offices in Austin.', email: 'hi@greenscape.test', city: 'Austin' }),
        pages: JSON.stringify(['Home', 'About', 'Services', 'Contact']),
        status: 'building',
      },
    });
    projectId = project.id;
    const job = await db.buildJob.create({
      data: { projectId, siteId, type: 'build_site', status: 'queued', reservedCredits: 23, idempotencyKey: `e2e-job-${Date.now()}` },
    });

    const before = await getBalance(userId);
    await processJob(job.id);

    const done = await db.buildJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status).toBe('completed');

    const pages = await db.generatedPage.findMany({ where: { projectId } });
    expect(pages.length).toBe(4);
    for (const p of pages) {
      // Every page must be a CONFIRMED draft: written, read back, hash-matched
      expect(p.status).toBe('draft');
      expect(p.wpPageId).toBeGreaterThan(0);
      expect(p.verifyHash).toBeTruthy();
      const tree = JSON.parse(p.elementorJson);
      const report = validateElementorTree(tree, { allowPro: true });
      expect(report.valid).toBe(true);
      expect(report.stats.widgets).toBeGreaterThan(3);
    }

    // Credits: 4 pages built → 3 + 4*5 = 23 consumed, no leakage
    const after = await getBalance(userId);
    expect(before - after).toBe(23);

    // The site actually holds the pages with builder meta (simulated site)
    for (const p of pages) {
      const simPage = simRegistry.page((await db.siteCredential.findUniqueOrThrow({ where: { siteId } })).siteKey, p.wpPageId!);
      expect(simPage).toBeDefined();
      expect(simPage!.status).toBe('draft');
      expect(simPage!.managed).toBe(true);
    }
  }, 120000);

  it('renders a preview from the native Elementor JSON', async () => {
    const page = await db.generatedPage.findFirstOrThrow({ where: { projectId, slug: 'home' } });
    const html = renderPreview(JSON.parse(page.elementorJson), 'Home', { heading: 'Poppins', body: 'Inter' });
    expect(html).toContain('<!doctype html');
    expect(html).toContain('GreenScape');
    expect(html).not.toMatch(/<script(?![^>]*src=)[^>]*>[^<]*<\/script>/i);
  });

  it('revises one page through an AI instruction (with snapshot for rollback)', async () => {
    const page = await db.generatedPage.findFirstOrThrow({ where: { projectId, slug: 'home' } });
    const job = await db.buildJob.create({
      data: { projectId, siteId, type: 'revise_page', status: 'queued', reservedCredits: 2, idempotencyKey: `e2e-rev-${Date.now()}`, payload: JSON.stringify({ pageId: page.id, instruction: 'Make the hero friendlier and add a stats band.' }) },
    });
    const before = await getBalance(userId);
    await processJob(job.id);
    const done = await db.buildJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(done.status).toBe('completed');

    const updated = await db.generatedPage.findUniqueOrThrow({ where: { id: page.id } });
    expect(updated.revision).toBe(1);
    expect(updated.status).toBe('draft');
    expect(await getBalance(userId)).toBe(before - 2);
    // revision history kept for rollback
    const revs = await db.pageRevision.findMany({ where: { pageId: page.id } });
    expect(revs.length).toBe(1);
    expect(revs[0].instruction).toContain('hero');
  }, 60000);

  it('refuses to publish without explicit approval, then publishes on approval', async () => {
    const page = await db.generatedPage.findFirstOrThrow({ where: { projectId, slug: 'home' } });

    const blocked = await db.buildJob.create({
      data: { projectId, siteId, type: 'publish_page', status: 'queued', idempotencyKey: `e2e-pub-block-${Date.now()}`, payload: JSON.stringify({ pageId: page.id }) },
    });
    await processJob(blocked.id);
    expect((await db.buildJob.findUniqueOrThrow({ where: { id: blocked.id } })).error).toMatch(/approved/i);

    await db.generatedPage.update({ where: { id: page.id }, data: { approved: true } });
    const job = await db.buildJob.create({
      data: { projectId, siteId, type: 'publish_page', status: 'queued', idempotencyKey: `e2e-pub-${Date.now()}`, payload: JSON.stringify({ pageId: page.id }) },
    });
    await processJob(job.id);
    expect((await db.buildJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('completed');

    const published = await db.generatedPage.findUniqueOrThrow({ where: { id: page.id } });
    expect(published.status).toBe('published');
    const cred = await db.siteCredential.findUniqueOrThrow({ where: { siteId } });
    expect(simRegistry.page(cred.siteKey, page.wpPageId!)!.status).toBe('publish');
  }, 60000);

  it('retries a failed page without recharging', async () => {
    const page = await db.generatedPage.findFirstOrThrow({ where: { projectId, slug: 'about' } });
    await db.generatedPage.update({ where: { id: page.id }, data: { status: 'failed', error: 'simulated failure' } });
    const job = await db.buildJob.create({
      data: { projectId, siteId, type: 'rebuild_page', status: 'queued', idempotencyKey: `e2e-retry-${Date.now()}`, payload: JSON.stringify({ pageId: page.id }) },
    });
    const before = await getBalance(userId);
    await processJob(job.id);
    expect((await db.buildJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe('completed');
    const rebuilt = await db.generatedPage.findUniqueOrThrow({ where: { id: page.id } });
    expect(rebuilt.status).toBe('draft');
    expect(await getBalance(userId)).toBe(before); // retries are free
  }, 60000);

  it('session cookie resolution still works after everything', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const req = await fakeRequest();
    const { token } = await createSession(user.id, req);
    const resolved = await getSessionUser(await fakeRequest({ cookie: `ef_session=${token}` }));
    expect(resolved?.email).toBe(user.email);
  });
});

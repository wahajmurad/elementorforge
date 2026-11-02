import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handle, json, readJson } from '@/lib/api';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { getSiteAdapter } from '@/lib/wp';
import { encryptSecret, randomToken } from '@/lib/crypto';
import { audit } from '@/lib/audit';
import { simRegistry } from '@/lib/wp/simulator';

async function loadOwnedSite(req: NextRequest, id: string) {
  const user = await requireUser(req);
  const site = await db.site.findUnique({ where: { id }, include: { credentials: true } });
  if (!site) throw new NotFoundError('Site not found');
  if (site.userId !== user.id) throw new ForbiddenError('Not your site');
  return { user, site };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { site } = await loadOwnedSite(req, id);
    const mcpConfig = JSON.parse(site.mcpConfig || '{}');
    // Never expose secrets: only presence + key prefix.
    const diagnostics = site.credentials
      ? await getSiteAdapter(site as never).diagnostics().catch(e => ({
          ok: false, wp: {}, elementor: { active: false, pro: false },
          error: (e as Error).message, checkedAt: new Date().toISOString(),
        }))
      : null;
    const projects = await db.project.findMany({
      where: { siteId: site.id }, orderBy: { createdAt: 'desc' }, take: 10,
      select: { id: true, name: true, status: true, createdAt: true },
    });
    return json({
      site: {
        id: site.id, name: site.name, url: site.url, mode: site.mode, status: site.status,
        wpVersion: site.wpVersion, phpVersion: site.phpVersion,
        elementorVersion: site.elementorVersion, elementorPro: site.elementorPro,
        proLicenseOk: site.proLicenseOk, containersEnabled: site.containersEnabled,
        pluginVersion: site.pluginVersion, lastCheckedAt: site.lastCheckedAt?.toISOString() ?? null,
        siteKey: site.credentials?.siteKey ?? null,
        hasTransportToken: Boolean(site.credentials?.transportToken),
        mcpConfig,
        pairingCode: site.pairingExpiresAt && site.pairingExpiresAt > new Date() ? site.pairingCode : null,
        createdAt: site.createdAt.toISOString(),
      },
      diagnostics,
      projects,
    });
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { site } = await loadOwnedSite(req, id);
    const body = await readJson<{
      name?: string; mcpConfig?: { endpoint?: string; authType?: string; authUser?: string; toolMapping?: object };
      transportToken?: string; // write-only: WP application password for MCP modes
    }>(req);

    const data: Record<string, unknown> = {};
    if (body.name?.trim()) data.name = body.name.trim().slice(0, 100);
    if (body.mcpConfig) data.mcpConfig = JSON.stringify(body.mcpConfig);
    if (body.transportToken !== undefined) {
      if (!site.credentials) throw new ValidationError('Site has no credentials row');
    }

    if (Object.keys(data).length) {
      await db.site.update({ where: { id: site.id }, data: data as never });
    }
    if (body.transportToken !== undefined) {
      if (!body.transportToken.trim()) throw new ValidationError('Application password cannot be empty');
      await db.siteCredential.update({
        where: { siteId: site.id },
        data: { transportToken: encryptSecret(body.transportToken), tokenHash: site.credentials?.tokenHash ?? null },
      });
      await db.site.update({ where: { id: site.id }, data: { status: 'connected', lastCheckedAt: new Date() } });
    }
    await audit({ userId: site.userId, siteId: site.id, action: 'site.updated', meta: { fields: Object.keys(body).join(',') } });
    return json({ ok: true });
  });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { site } = await loadOwnedSite(req, id);
    if (site.mode === 'simulated') simRegistry.remove(site.credentials?.siteKey ?? '');
    await db.site.delete({ where: { id: site.id } });
    await audit({ userId: site.userId, action: 'site.deleted', meta: { siteId: site.id } });
    return json({ ok: true });
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await ctx.params;
    const { site } = await loadOwnedSite(req, id);
    const body = await readJson<{ action?: string }>(req).catch(() => ({ action: 'diagnostics' }));
    if (body.action !== 'diagnostics' && body.action !== 'new_pairing_code') {
      throw new ValidationError('action must be diagnostics or new_pairing_code');
    }

    if (body.action === 'new_pairing_code') {
      if (site.mode !== 'connector') throw new ValidationError('Pairing codes apply to connector sites');
      const { pairingCode } = await import('@/lib/crypto');
      const code = pairingCode();
      await db.site.update({
        where: { id: site.id },
        data: { pairingCode: code, pairingExpiresAt: new Date(Date.now() + 1000 * 60 * 30), status: site.status === 'connected' ? 'connected' : 'pairing' },
      });
      await audit({ userId: site.userId, siteId: site.id, action: 'site.pairing_code_reissued' });
      return json({ ok: true, pairingCode: code, expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString() });
    }

    // diagnostics
    if (!site.credentials) throw new ValidationError('Site is not paired yet');
    const diag = await getSiteAdapter(site as never).diagnostics();
    await db.site.update({
      where: { id: site.id },
      data: {
        status: diag.ok ? 'connected' : 'error',
        wpVersion: diag.wp?.version ?? site.wpVersion,
        phpVersion: diag.wp?.php ?? site.phpVersion,
        elementorVersion: diag.elementor?.version ?? site.elementorVersion,
        elementorPro: diag.elementor?.pro ?? site.elementorPro,
        proLicenseOk: diag.elementor?.proLicense ?? site.proLicenseOk,
        containersEnabled: diag.elementor?.containers ?? site.containersEnabled,
        lastCheckedAt: new Date(),
      },
    });
    await audit({ userId: site.userId, siteId: site.id, action: 'site.diagnostics', meta: { ok: diag.ok } });
    return json({ diagnostics: diag, siteKeyHint: site.credentials.siteKey.slice(0, 8), nonce: randomToken(4) });
  });
}

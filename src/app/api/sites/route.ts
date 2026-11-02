import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handle, json, readJson, baseUrlFrom } from '@/lib/api';
import { assertCanAddSite, ensurePlansSeeded, getUserEntitlements } from '@/lib/plans';
import { pairingCode, randomToken, sha256, encryptSecret } from '@/lib/crypto';
import { ValidationError } from '@/lib/errors';
import { audit } from '@/lib/audit';
import { simRegistry } from '@/lib/wp/simulator';

function normalizeUrl(raw: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
      throw new ValidationError('Site URL must use HTTPS');
    }
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new ValidationError(`Invalid site URL: "${raw}"`);
  }
}

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const sites = await db.site.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { credentials: { select: { siteKey: true } } },
    });
    return json({
      sites: sites.map(s => ({
        id: s.id, name: s.name, url: s.url, mode: s.mode, status: s.status,
        wpVersion: s.wpVersion, elementorVersion: s.elementorVersion,
        elementorPro: s.elementorPro, proLicenseOk: s.proLicenseOk,
        pluginVersion: s.pluginVersion, lastCheckedAt: s.lastCheckedAt?.toISOString() ?? null,
        siteKey: s.credentials?.siteKey ?? null,
        pairingCode: s.pairingExpiresAt && s.pairingExpiresAt > new Date() ? s.pairingCode : null,
        createdAt: s.createdAt.toISOString(),
      })),
    });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    await ensurePlansSeeded();
    await assertCanAddSite(user.id);

    const body = await readJson<{
      name?: string; url?: string; mode?: string; elementorPro?: boolean;
      mcpConfig?: { endpoint?: string; authType?: string; authUser?: string; toolMapping?: object };
    }>(req);
    if (!body.name?.trim()) throw new ValidationError('Site name is required');
    const mode = body.mode ?? 'connector';
    if (!['connector', 'elementor_mcp', 'mcp_third_party', 'simulated'].includes(mode)) {
      throw new ValidationError('mode must be connector | elementor_mcp | mcp_third_party | simulated');
    }

    let url = '';
    if (mode === 'simulated') {
      url = `sim://site-${Math.random().toString(36).slice(2, 8)}`;
    } else {
      if (!body.url) throw new ValidationError('Site URL is required');
      url = normalizeUrl(body.url);
    }
    if (mode === 'elementor_mcp' || mode === 'mcp_third_party') {
      if (!body.mcpConfig?.endpoint) {
        throw new ValidationError('MCP endpoint is required — enable the Elementor MCP on your site first (Elementor → Elementor MCP), then paste the endpoint URL here');
      }
      if (mode === 'elementor_mcp' && !body.mcpConfig.authUser) {
        throw new ValidationError('WordPress username is required for Application Password authentication');
      }
    }

    const site = await db.site.create({
      data: {
        userId: user.id,
        name: body.name.trim().slice(0, 100),
        url,
        mode,
        status: mode === 'simulated' ? 'connected' : 'pending',
        elementorPro: Boolean(body.elementorPro),
        mcpConfig: body.mcpConfig ? JSON.stringify(body.mcpConfig) : '{}',
      },
    });

    let pairing: { pairingCode: string; expiresAt: string; apiUrl: string; instructions: string } | null = null;

    if (mode === 'connector' || mode === 'simulated') {
      // Pre-create credentials; the plugin exchanges the pairing code to receive them.
      const code = pairingCode();
      const siteKey = `ef_${randomToken(12)}`;
      const hmacSecretPlain = randomToken(32);
      await db.siteCredential.create({
        data: {
          siteId: site.id,
          siteKey,
          hmacSecret: encryptSecret(hmacSecretPlain),
        },
      });
      await db.site.update({
        where: { id: site.id },
        data: { pairingCode: code, pairingExpiresAt: new Date(Date.now() + 1000 * 60 * 30), status: 'pairing' },
      });
      pairing = {
        pairingCode: code,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        apiUrl: `${baseUrlFrom(req)}/api/hooks/pair`,
        instructions: 'Install the elementor-connect plugin, open ElementorForge Connect in wp-admin, enter this pairing code.',
      };
      if (mode === 'simulated') {
        simRegistry.create(siteKey, hmacSecretPlain, { pro: Boolean(body.elementorPro) });
        await db.site.update({ where: { id: site.id }, data: { status: 'connected', pairingCode: null, pairingExpiresAt: null, pluginVersion: 'sim-1.0.0' } });
        pairing = null;
      }
    } else {
      // MCP modes: credentials hold the application password, provided at verify time
      await db.siteCredential.create({
        data: { siteId: site.id, siteKey: `ef_${randomToken(12)}`, hmacSecret: encryptSecret(randomToken(16)), tokenHash: sha256(randomToken(8)) },
      });
    }

    await audit({ userId: user.id, siteId: site.id, action: 'site.created', meta: { mode } });
    const ent = await getUserEntitlements(user.id);
    return json({ site: { id: site.id, name: site.name, url: site.url, mode: site.mode, status: site.status }, pairing, entitlements: ent }, 201);
  });
}

import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { handle, json, readJson, rateLimit, clientIp } from '@/lib/api';
import { decryptSecret } from '@/lib/crypto';
import { audit } from '@/lib/audit';

// Serverless: allow the pairing handshake to finish (Vercel Hobby max = 60s)
export const maxDuration = 60;

/**
 * Pairing hook — called BY the WordPress connector plugin (or simulator).
 * Public endpoint, protected by:
 *  - per-IP rate limiting
 *  - one-time short-lived pairing code (30 min, single use)
 * Returns the site key + HMAC secret ONCE over HTTPS; the plugin stores them
 * and the pairing code is invalidated immediately.
 *
 * Request: { pairingCode, siteUrl, wpVersion, phpVersion, elementor: {version, pro, proLicense, containers}, pluginVersion }
 * Response: { ok, siteKey, hmacSecret, statusInterval, apiNote }
 */

export async function POST(req: NextRequest) {
  return handle(async () => {
    rateLimit(`pair:${clientIp(req)}`, 20, 60_000);
    const body = await readJson<{
      pairingCode?: string; siteUrl?: string; wpVersion?: string; phpVersion?: string;
      elementor?: { version?: string; pro?: boolean; proLicense?: boolean; containers?: boolean };
      pluginVersion?: string;
    }>(req);

    if (!body.pairingCode || !body.siteUrl) {
      return json({ ok: false, error: 'pairingCode and siteUrl are required' }, 422);
    }
    const code = body.pairingCode.trim().toUpperCase();
    const site = await db.site.findFirst({
      where: { pairingCode: code, pairingExpiresAt: { gt: new Date() } },
      include: { credentials: true },
    });
    if (!site || !site.credentials) {
      await audit({ action: 'site.pair.rejected', ip: clientIp(req), meta: { reason: 'invalid_or_expired_code' } });
      return json({ ok: false, error: 'Invalid or expired pairing code. Generate a new one in your dashboard.' }, 401);
    }
    if (site.mode !== 'connector') {
      return json({ ok: false, error: 'This site was not created for connector pairing' }, 400);
    }

    await db.site.update({
      where: { id: site.id },
      data: {
        status: 'connected',
        pairingCode: null,
        pairingExpiresAt: null,
        url: body.siteUrl.replace(/\/+$/, ''),
        wpVersion: body.wpVersion?.slice(0, 20) ?? null,
        phpVersion: body.phpVersion?.slice(0, 20) ?? null,
        elementorVersion: body.elementor?.version?.slice(0, 20) ?? null,
        elementorPro: Boolean(body.elementor?.pro),
        proLicenseOk: Boolean(body.elementor?.proLicense),
        containersEnabled: body.elementor?.containers !== false,
        pluginVersion: body.pluginVersion?.slice(0, 20) ?? null,
        lastCheckedAt: new Date(),
      },
    });
    await db.siteCredential.update({
      where: { siteId: site.id },
      data: { rotatedAt: new Date() },
    });

    await audit({ userId: site.userId, siteId: site.id, action: 'site.paired', ip: clientIp(req), meta: { wp: body.wpVersion ?? null, elementor: body.elementor?.version ?? null } });

    return json({
      ok: true,
      siteKey: site.credentials.siteKey,
      // One-time bootstrap secret — travels only over HTTPS during pairing.
      hmacSecret: decryptSecret(site.credentials.hmacSecret),
      statusInterval: 300,
    });
  });
}

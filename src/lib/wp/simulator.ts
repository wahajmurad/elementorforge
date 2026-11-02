import { createHmac, createHash, randomUUID } from 'crypto';
import {
  SiteAdapter, SiteDiagnostics, PageWriteRequest, PageWriteResult, PageReadResult, SnapshotInfo,
} from './types';
import { decryptSecret, requestSignatureBase } from '@/lib/crypto';

/**
 * Simulated WordPress site — implements EXACTLY the same REST contract
 * (endpoints, auth headers, responses) as the elementor-connect plugin,
 * with in-process persistence. Used for:
 *  - the sandbox E2E demo (connect → generate → verify → preview → revise)
 *  - automated tests of the pipeline against a deterministic "site"
 *
 * It is NOT a fake website builder: the same validated native Elementor JSON
 * travels the same code path as with a real site; only the storage backend
 * differs. Real deployments never touch this module.
 */

interface SimPage {
  id: number;
  title: string;
  slug: string;
  status: 'draft' | 'publish';
  template: string;
  elementorData: unknown;
  pageSettings: Record<string, unknown>;
  managed: boolean;
  createdAt: string;
  modifiedAt: string;
  snapshots: { snapshotId: string; hash: string; data: unknown; createdAt: string; revision: number }[];
}

interface SimSite {
  key: string;
  secret: string;
  pages: Map<number, SimPage>;
  nextId: number;
  calls: { method: string; path: string; at: string }[];
}

export class SimulatedRegistry {
  private sites = new Map<string, SimSite>();

  create(siteKey: string, hmacSecretPlain: string, opts?: { pro?: boolean }): void {
    this.sites.set(siteKey, {
      key: siteKey, secret: hmacSecretPlain, pages: new Map(), nextId: 2,
      calls: [],
    });
    void opts;
  }

  remove(siteKey: string): void { this.sites.delete(siteKey); }
  exists(siteKey: string): boolean { return this.sites.has(siteKey); }
  pageIds(siteKey: string): number[] {
    const s = this.sites.get(siteKey);
    return s ? [...s.pages.keys()] : [];
  }
  page(siteKey: string, id: number): SimPage | undefined { return this.sites.get(siteKey)?.pages.get(id); }

  /** Handles a signed request against the simulated contract. Throws on auth failure. */
  handle(siteKey: string, method: 'GET' | 'POST' | 'DELETE', path: string, bodyStr: string, ts: string, signature: string, isEncryptedSecret: (v: string) => boolean): unknown {
    const site = this.sites.get(siteKey);
    const respond = (data: unknown) => data;
    if (!site) throw new Error('Unknown site key (simulated site not registered)');
    // Verify timestamp window ±300s (same rule as the plugin)
    const skew = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
    if (!Number.isFinite(Number(ts)) || skew > 300) throw new Error('Timestamp outside allowed window');
    const secret = isEncryptedSecret(site.secret) ? decryptSecret(site.secret) : site.secret;
    const expected = createHmac('sha256', secret).update(requestSignatureBase(method, path, bodyStr, ts)).digest('hex');
    if (expected !== signature) throw new Error('Invalid request signature');
    site.calls.push({ method, path, at: new Date().toISOString() });

    const seg = path.replace(/^\/wp-json\/aelc\/v1\/?/, '').split('/').filter(Boolean);
    const hashOf = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');

    if (method === 'GET' && seg[0] === 'status') {
      return respond({
        ok: true,
        wp: { version: '6.7.1', php: '8.2.18', memory_limit: '256M' },
        elementor: { active: true, version: '3.32.3', pro: true, pro_license: true, containers: true },
        plugin: { version: '1.0.0' },
      });
    }

    if (method === 'POST' && seg[0] === 'pages' && seg.length === 1) {
      const body = JSON.parse(bodyStr || '{}') as PageWriteRequest & { overwrite?: boolean };
      // duplicate-slug guard like WP would produce
      const dup = [...site.pages.values()].find(p => p.slug === body.slug);
      const id = site.nextId++;
      const page: SimPage = {
        id,
        title: body.title,
        slug: dup ? `${body.slug}-${id}` : body.slug,
        status: 'draft',
        template: body.template || 'elementor_header_footer',
        elementorData: body.elementorData,
        pageSettings: body.pageSettings ?? {},
        managed: true,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        snapshots: [],
      };
      site.pages.set(id, page);
      return respond({
        ok: true, pageId: id, slug: page.slug,
        hash: hashOf(page.elementorData),
        editUrl: `https://simulated.local/wp-admin/post.php?post=${id}&action=elementor`,
        previewUrl: `https://simulated.local/?p=${id}&preview=true`,
      });
    }

    if (seg[0] === 'pages' && seg[1] && seg.length >= 2) {
      const pageId = Number(seg[1]);
      const page = site.pages.get(pageId);
      if (!page) return respond({ ok: false, error: 'Page not found' });

      if (method === 'GET' && seg.length === 2) {
        return respond({ ok: true, page: { id: page.id, title: page.title, slug: page.slug, status: page.status, template: page.template, elementorData: page.elementorData, pageSettings: page.pageSettings, hash: hashOf(page.elementorData), modified: page.modifiedAt } });
      }
      if (method === 'POST' && seg[2] === 'update') {
        const body = JSON.parse(bodyStr || '{}') as Partial<PageWriteRequest>;
        if (body.title !== undefined) page.title = body.title;
        if (body.slug !== undefined) page.slug = body.slug;
        if (body.elementorData !== undefined) page.elementorData = body.elementorData;
        if (body.pageSettings !== undefined) page.pageSettings = body.pageSettings;
        page.modifiedAt = new Date().toISOString();
        return respond({ ok: true, pageId: page.id, hash: hashOf(page.elementorData) });
      }
      if (method === 'POST' && seg[2] === 'publish') {
        page.status = 'publish';
        page.modifiedAt = new Date().toISOString();
        return respond({ ok: true, pageId: page.id, status: 'publish', previewUrl: `https://simulated.local/${page.slug}/` });
      }
      if (method === 'POST' && seg[2] === 'snapshot') {
        const snapshotId = randomUUID();
        page.snapshots.push({ snapshotId, hash: hashOf(page.elementorData), data: page.elementorData, createdAt: new Date().toISOString(), revision: page.snapshots.length + 1 });
        return respond({ ok: true, snapshotId, hash: hashOf(page.elementorData), revision: page.snapshots.length });
      }
      if (method === 'GET' && seg[2] === 'snapshots') {
        const list: SnapshotInfo[] = page.snapshots.map(s => ({ snapshotId: s.snapshotId, hash: s.hash, createdAt: s.createdAt, revision: s.revision }));
        return respond({ ok: true, snapshots: list });
      }
      if (method === 'POST' && seg[2] === 'restore') {
        const body = JSON.parse(bodyStr || '{}') as { snapshotId?: string };
        const snap = page.snapshots.find(s => s.snapshotId === body.snapshotId);
        if (!snap) return respond({ ok: false, error: 'Snapshot not found' });
        page.elementorData = snap.data;
        page.modifiedAt = new Date().toISOString();
        return respond({ ok: true, pageId: page.id, hash: hashOf(page.elementorData) });
      }
      if (method === 'DELETE' && seg.length === 2) {
        if (!page.managed) return respond({ ok: false, error: 'Refusing to delete a page not created by ElementorForge' });
        site.pages.delete(pageId);
        return respond({ ok: true, deleted: pageId });
      }
    }
    return respond({ ok: false, error: `No simulated handler for ${method} ${path}` });
  }
}

// Module-level singleton (persists for the lifetime of the server process)
const g = globalThis as unknown as { __simRegistry?: SimulatedRegistry };
export const simRegistry: SimulatedRegistry = g.__simRegistry ?? new SimulatedRegistry();
g.__simRegistry = simRegistry;

export function simulatorAdapter(siteKey: string, hmacSecretEncrypted: string): SiteAdapter {
  const isEnc = (v: string) => v.startsWith('v1.');

  async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const bodyStr = body === undefined ? '' : JSON.stringify(body);
    const ts = Math.floor(Date.now() / 1000).toString();
    const secret = isEnc(hmacSecretEncrypted) ? decryptSecret(hmacSecretEncrypted) : hmacSecretEncrypted;
    const signature = createHmac('sha256', secret).update(requestSignatureBase(method, path, bodyStr, ts)).digest('hex');
    // tiny latency so progress states are observable
    await new Promise(r => setTimeout(r, 30));
    return simRegistry.handle(siteKey, method, path, bodyStr, ts, signature, isEnc) as T;
  }

  const api = (p: string) => `/wp-json/aelc/v1${p}`;

  return {
    mode: 'simulated',
    diagnostics: () => call<SiteDiagnostics>('GET', api('/status')),
    createPage: req => call<PageWriteResult>('POST', api('/pages'), req),
    readPage: id => call<PageReadResult>('GET', api(`/pages/${id}`)),
    updatePage: (id, req) => call<PageWriteResult>('POST', api(`/pages/${id}/update`), req),
    publishPage: id => call<PageWriteResult>('POST', api(`/pages/${id}/publish`)),
    snapshotPage: id => call('POST', api(`/pages/${id}/snapshot`)),
    restoreSnapshot: (id, snapshotId) => call<PageWriteResult>('POST', api(`/pages/${id}/restore`), { snapshotId }),
    listSnapshots: id => call('GET', api(`/pages/${id}/snapshots`)),
    deletePage: id => call('DELETE', api(`/pages/${id}`)),
  };
}

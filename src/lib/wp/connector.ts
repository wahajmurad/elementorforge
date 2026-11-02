import {
  SiteAdapter, SiteDiagnostics, PageWriteRequest, PageWriteResult, PageReadResult, SnapshotInfo,
} from './types';
import { hmacSign, requestSignatureBase, decryptSecret } from '@/lib/crypto';

/**
 * REST client for the ElementorForge connector plugin (aelc/v1 namespace).
 * Security model (server-to-server, no browser involved):
 *  - X-AELC-Key            : public per-site key (identifies credentials)
 *  - X-AELC-Timestamp      : unix seconds; receiver rejects outside ±300s window
 *  - X-AELC-Signature      : HMAC-SHA256(secret, "METHOD\npath\nsha256(body)\nts")
 * Transport security relies on HTTPS; the signature additionally protects
 * request integrity and blocks replay. This is the anti-CSRF/anti-replay
 * mechanism for machine calls — WordPress nonces are session-based and do
 * not apply here (the plugin enforces nonces on its browser-facing admin UI).
 */

const TIMEOUT_MS = 30000;

export class ConnectorError extends Error {
  constructor(message: string, public status?: number, public detail?: unknown) { super(message); }
}

export interface ConnectorConfig {
  baseUrl: string;      // https://customer-site.com
  siteKey: string;
  hmacSecret: string;   // decrypted at call time
}

export function connectorConfigFrom(site: { url: string }, creds: { siteKey: string; hmacSecret: string }): ConnectorConfig {
  return {
    baseUrl: site.url.replace(/\/+$/, ''),
    siteKey: creds.siteKey,
    hmacSecret: creds.hmacSecret.startsWith('v1.') ? decryptSecret(creds.hmacSecret) : creds.hmacSecret,
  };
}

export class ConnectorClient {
  private base: string;
  private key: string;
  private secret: string;

  constructor(cfg: ConnectorConfig) {
    this.base = cfg.baseUrl.replace(/\/+$/, '');
    this.key = cfg.siteKey;
    this.secret = cfg.hmacSecret;
  }

  private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const bodyStr = body === undefined ? '' : JSON.stringify(body);
    const ts = Math.floor(Date.now() / 1000).toString();
    const sigBase = requestSignatureBase(method, path, bodyStr, ts);
    const signature = hmacSign(this.secret, sigBase);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${this.base}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-AELC-Key': this.key,
          'X-AELC-Timestamp': ts,
          'X-AELC-Signature': signature,
          'User-Agent': 'ElementorForge-SaaS/1.0',
        },
        body: bodyStr === '' ? undefined : bodyStr,
        signal: controller.signal,
      });
      const text = await res.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
      if (!res.ok) {
        const err = data as { code?: string; message?: string };
        throw new ConnectorError(err.message || `HTTP ${res.status} from ${path}`, res.status, data);
      }
      return data as T;
    } catch (e) {
      if (e instanceof ConnectorError) throw e;
      if ((e as Error).name === 'AbortError') throw new ConnectorError(`Timeout calling ${path} (site did not respond within ${TIMEOUT_MS / 1000}s)`);
      throw new ConnectorError(`Connection failed: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private api(p: string) { return `/wp-json/aelc/v1${p}`; }

  async diagnostics(): Promise<SiteDiagnostics> {
    const d = await this.request<{ ok: boolean; wp?: Record<string, string>; elementor?: Record<string, unknown>; plugin?: Record<string, string>; error?: string }>('GET', this.api('/status'));
    return {
      ok: Boolean(d.ok),
      wp: { version: d.wp?.version, php: d.wp?.php, memoryLimit: d.wp?.memory_limit },
      elementor: {
        active: Boolean(d.elementor?.active),
        version: d.elementor?.version as string | undefined,
        pro: Boolean(d.elementor?.pro),
        proLicense: d.elementor?.pro_license as boolean | undefined,
        containers: d.elementor?.containers !== false,
      },
      plugin: { version: d.plugin?.version },
      error: d.error,
      checkedAt: new Date().toISOString(),
    };
  }

  async createPage(req: PageWriteRequest): Promise<PageWriteResult> {
    return this.request<PageWriteResult>('POST', this.api('/pages'), req);
  }

  async readPage(pageId: number): Promise<PageReadResult> {
    return this.request<PageReadResult>('GET', this.api(`/pages/${pageId}`));
  }

  async updatePage(pageId: number, req: Partial<PageWriteRequest>): Promise<PageWriteResult> {
    return this.request<PageWriteResult>('POST', this.api(`/pages/${pageId}/update`), req);
  }

  async publishPage(pageId: number): Promise<PageWriteResult> {
    return this.request<PageWriteResult>('POST', this.api(`/pages/${pageId}/publish`));
  }

  async snapshotPage(pageId: number): Promise<{ ok: boolean; snapshotId?: string; hash?: string; error?: string }> {
    return this.request('POST', this.api(`/pages/${pageId}/snapshot`));
  }

  async restoreSnapshot(pageId: number, snapshotId: string): Promise<PageWriteResult> {
    return this.request<PageWriteResult>('POST', this.api(`/pages/${pageId}/restore`), { snapshotId });
  }

  async listSnapshots(pageId: number): Promise<{ ok: boolean; snapshots: SnapshotInfo[] }> {
    return this.request('GET', this.api(`/pages/${pageId}/snapshots`));
  }

  async deletePage(pageId: number): Promise<{ ok: boolean; error?: string }> {
    return this.request('DELETE', this.api(`/pages/${pageId}`));
  }
}

export function connectorAdapter(cfg: ConnectorConfig): SiteAdapter {
  const client = new ConnectorClient(cfg);
  return {
    mode: 'connector',
    diagnostics: () => client.diagnostics(),
    createPage: req => client.createPage(req),
    readPage: id => client.readPage(id),
    updatePage: (id, req) => client.updatePage(id, req),
    publishPage: id => client.publishPage(id),
    snapshotPage: id => client.snapshotPage(id),
    restoreSnapshot: (id, sid) => client.restoreSnapshot(id, sid),
    listSnapshots: id => client.listSnapshots(id),
    deletePage: id => client.deletePage(id),
  };
}

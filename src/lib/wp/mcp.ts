import {
  SiteAdapter, SiteDiagnostics, PageWriteRequest, PageWriteResult, PageReadResult, SnapshotInfo,
} from './types';
import { decryptSecret } from '@/lib/crypto';

/**
 * Generic MCP (Model Context Protocol) client adapter.
 *
 * Compatibility notes (verified against public docs, 2026-11):
 *  - The official Elementor MCP is enabled per site by an admin under
 *    Elementor > Elementor MCP. Elementor generates a WordPress Application
 *    Password and a connection prompt; the transport rides on the site's own
 *    WordPress REST infrastructure. It is NOT on by default — our UI walks
 *    the user through the documented enable flow before asking for a URL +
 *    application password.
 *  - Third-party MCP servers (e.g. community WordPress/Elementor MCP plugins)
 *    expose different tool names. We therefore NEVER hardcode tool names:
 *    we call tools/list at runtime and the operator maps operations
 *    (createPage/updatePage/getPage/publish) to discovered tools via a
 *    JSON args template in the site's mcpConfig.
 *
 * Transport: JSON-RPC 2.0 over HTTP POST. Supports stateful servers via the
 * Mcp-Session-Id header and stateless servers alike.
 */

export interface McpToolMapping {
  createPage?: { tool: string; args: Record<string, string> };
  updatePage?: { tool: string; args: Record<string, string> };
  getPage?: { tool: string; args: Record<string, string> };
  publishPage?: { tool: string; args: Record<string, string> };
}

export interface McpSiteConfig {
  endpoint: string;                       // full MCP endpoint URL
  authType: 'basic' | 'bearer';           // basic = WP Application Password
  authUser?: string;                      // WP username for application passwords
  protocolVersion?: string;
  toolMapping?: McpToolMapping;
}

export class McpError extends Error {
  constructor(message: string, public code?: number | string) { super(message); }
}

interface JsonRpcResponse { jsonrpc: '2.0'; id?: number; result?: unknown; error?: { code: number; message: string; data?: unknown } }

export class McpClient {
  private endpoint: string;
  private headers: Record<string, string>;
  private protocolVersion: string;
  private sessionId: string | null = null;
  private nextId = 1;
  private initialized = false;

  constructor(cfg: McpSiteConfig, transportToken: string) {
    this.endpoint = cfg.endpoint;
    this.protocolVersion = cfg.protocolVersion ?? '2025-03-26';
    this.headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (cfg.authType === 'basic') {
      // WordPress Application Passwords use username:password over Basic auth
      this.headers.Authorization = `Basic ${Buffer.from(`${cfg.authUser ?? ''}:${transportToken}`).toString('base64')}`;
    } else {
      this.headers.Authorization = `Bearer ${transportToken}`;
    }
  }

  private async rpc(method: string, params?: unknown, isNotification = false): Promise<unknown> {
    const id = isNotification ? undefined : this.nextId++;
    const body: Record<string, unknown> = { jsonrpc: '2.0', method };
    if (params !== undefined) body.params = params;
    if (id !== undefined) body.id = id;
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { ...this.headers, ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (!res.ok) {
      throw new McpError(`MCP transport error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    if (isNotification) return undefined;
    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.text();
    let data: JsonRpcResponse | null = null;
    if (contentType.includes('text/event-stream')) {
      // SSE-framed response: take the last data: line containing JSON-RPC
      for (const line of text.split('\n').reverse()) {
        if (line.startsWith('data:')) {
          try { data = JSON.parse(line.slice(5).trim()); break; } catch { /* keep scanning */ }
        }
      }
    } else {
      try { data = JSON.parse(text); } catch { /* noop */ }
    }
    if (!data) throw new McpError('MCP server returned a non-JSON-RPC response');
    if (data.error) throw new McpError(data.error.message, data.error.code);
    return data.result;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.rpc('initialize', {
      protocolVersion: this.protocolVersion,
      capabilities: {},
      clientInfo: { name: 'ElementorForge-SaaS', version: '1.0.0' },
    });
    await this.rpc('notifications/initialized', undefined, true);
    this.initialized = true;
  }

  async listTools(): Promise<{ name: string; description?: string; inputSchema?: unknown }[]> {
    await this.initialize();
    const result = (await this.rpc('tools/list', {})) as { tools?: { name: string; description?: string; inputSchema?: unknown }[] };
    return result?.tools ?? [];
  }

  async callTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
    await this.initialize();
    const result = (await this.rpc('tools/call', { name: tool, arguments: args })) as {
      content?: { type: string; text?: string }[]; isError?: boolean; structuredContent?: unknown;
    };
    if (result?.isError) {
      const text = result.content?.map(c => c.text).join(' ') ?? 'tool error';
      throw new McpError(text);
    }
    if (result?.structuredContent !== undefined) return result.structuredContent;
    const text = result?.content?.map(c => c.text).join('\n') ?? '';
    try { return JSON.parse(text); } catch { return text; }
  }
}

function resolveArgs(template: Record<string, string> | undefined, payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(template ?? {})) {
    if (typeof v === 'string' && v.startsWith('$.'))
      out[k] = payload[v.slice(2)];
    else
      try { out[k] = JSON.parse(v as string); } catch { out[k] = v; }
  }
  return out;
}

function parseConfig(siteMcpConfig: string): McpSiteConfig {
  const cfg = JSON.parse(siteMcpConfig || '{}') as McpSiteConfig;
  if (!cfg.endpoint) throw new McpError('MCP endpoint is not configured for this site');
  return cfg;
}

export function mcpAdapter(site: { mcpConfig: string }, creds: { transportToken: string | null }): SiteAdapter {
  const notSupported = <T>(op: string): Promise<T> =>
    Promise.reject(new McpError(`Operation "${op}" is not mapped for this MCP server. Open site settings → MCP tool mapping and map it to a discovered tool.`));

  let toolsCache: string[] | undefined;

  async function client(): Promise<McpClient> {
    const cfg = parseConfig(site.mcpConfig);
    if (!creds.transportToken) throw new McpError('MCP transport token (application password) missing');
    const token = creds.transportToken.startsWith('v1.') ? decryptSecret(creds.transportToken) : creds.transportToken;
    return new McpClient(cfg, token);
  }

  return {
    mode: 'elementor_mcp',
    async diagnostics(): Promise<SiteDiagnostics> {
      try {
        const c = await client();
        const tools = await c.listTools();
        toolsCache = tools.map(t => t.name);
        const cfg = parseConfig(site.mcpConfig);
        return {
          ok: true,
          wp: {},
          elementor: { active: true, pro: false },
          mcp: { connected: true, tools: toolsCache },
          error: (cfg.toolMapping && Object.keys(cfg.toolMapping).length === 0)
            ? 'Connected, but no operations are mapped yet. Map createPage to a discovered tool to enable builds.'
            : undefined,
          checkedAt: new Date().toISOString(),
        };
      } catch (e) {
        return { ok: false, wp: {}, elementor: { active: false, pro: false }, mcp: { connected: false, tools: [] }, error: (e as Error).message, checkedAt: new Date().toISOString() };
      }
    },
    async createPage(req: PageWriteRequest): Promise<PageWriteResult> {
      const cfg = parseConfig(site.mcpConfig);
      const mapping = cfg.toolMapping?.createPage;
      if (!mapping) return notSupported('createPage');
      const c = await client();
      const res = await c.callTool(mapping.tool, resolveArgs(mapping.args, req as unknown as Record<string, unknown>)) as { pageId?: number; id?: number; hash?: string; url?: string };
      const pageId = res?.pageId ?? res?.id;
      if (!pageId) return { ok: false, error: 'MCP tool did not return a page id — cannot confirm creation. Page is NOT counted as built.' };
      return { ok: true, pageId, hash: res?.hash, previewUrl: res?.url, editUrl: res?.url };
    },
    async readPage(pageId: number): Promise<PageReadResult> {
      const cfg = parseConfig(site.mcpConfig);
      const mapping = cfg.toolMapping?.getPage;
      if (!mapping) return notSupported('getPage');
      const c = await client();
      const res = await c.callTool(mapping.tool, resolveArgs(mapping.args, { pageId })) as { page?: { id: number; title: string; slug: string; status: string; elementorData?: unknown; hash?: string } };
      if (!res?.page) return { ok: false, error: 'MCP tool returned no page' };
      return { ok: true, page: { id: res.page.id, title: res.page.title, slug: res.page.slug, status: res.page.status, elementorData: res.page.elementorData ?? null, hash: res.page.hash ?? '' } };
    },
    async updatePage(pageId: number, req: Partial<PageWriteRequest>): Promise<PageWriteResult> {
      const cfg = parseConfig(site.mcpConfig);
      const mapping = cfg.toolMapping?.updatePage;
      if (!mapping) return notSupported('updatePage');
      const c = await client();
      const res = await c.callTool(mapping.tool, resolveArgs(mapping.args, { pageId, ...(req as unknown as Record<string, unknown>) })) as { hash?: string };
      return { ok: true, pageId, hash: res?.hash };
    },
    async publishPage(pageId: number): Promise<PageWriteResult> {
      const cfg = parseConfig(site.mcpConfig);
      const mapping = cfg.toolMapping?.publishPage;
      if (!mapping) return notSupported('publishPage');
      const c = await client();
      await c.callTool(mapping.tool, resolveArgs(mapping.args, { pageId }));
      return { ok: true, pageId };
    },
    snapshotPage: () => notSupported('snapshotPage'),
    async restoreSnapshot(): Promise<PageWriteResult> { return notSupported('restoreSnapshot'); },
    async listSnapshots(): Promise<{ ok: boolean; snapshots: SnapshotInfo[] }> {
      return { ok: false, snapshots: [] };
    },
    async deletePage(): Promise<{ ok: boolean; error?: string }> { return notSupported('deletePage'); },
  };
}

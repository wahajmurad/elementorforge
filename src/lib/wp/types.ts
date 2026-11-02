import { Site, SiteCredential } from '@prisma/client';

/**
 * SiteAdapter — the only interface the build pipeline knows about.
 * Three implementations: connector REST (plugin), Elementor MCP, simulated
 * (sandbox demo + tests). Swappable without touching pipeline code.
 */

export interface SiteDiagnostics {
  ok: boolean;
  wp: { version?: string; php?: string; memoryLimit?: string };
  elementor: { active: boolean; version?: string; pro: boolean; proLicense?: boolean; containers?: boolean };
  plugin?: { version?: string };
  mcp?: { connected: boolean; tools?: string[] };
  error?: string;
  checkedAt: string;
}

export interface PageWriteRequest {
  title: string;
  slug: string;
  status: 'draft';
  template: 'elementor_header_footer' | 'elementor_canvas' | 'default';
  elementorData: unknown; // validated Elementor JSON tree
  pageSettings: Record<string, unknown>;
}

export interface PageWriteResult {
  ok: boolean;
  pageId?: number;
  editUrl?: string;
  previewUrl?: string;
  hash?: string;
  error?: string;
}

export interface PageReadResult {
  ok: boolean;
  page?: {
    id: number; title: string; slug: string; status: string;
    elementorData: unknown; hash: string; modified?: string;
  };
  error?: string;
}

export interface SnapshotInfo { snapshotId: string; hash: string; createdAt: string; revision?: number }

export interface SiteAdapter {
  readonly mode: string;
  diagnostics(): Promise<SiteDiagnostics>;
  createPage(req: PageWriteRequest): Promise<PageWriteResult>;
  readPage(pageId: number): Promise<PageReadResult>;
  updatePage(pageId: number, req: Partial<PageWriteRequest>): Promise<PageWriteResult>;
  publishPage(pageId: number): Promise<PageWriteResult>;
  snapshotPage(pageId: number): Promise<{ ok: boolean; snapshotId?: string; hash?: string; error?: string }>;
  restoreSnapshot(pageId: number, snapshotId: string): Promise<PageWriteResult>;
  listSnapshots(pageId: number): Promise<{ ok: boolean; snapshots: SnapshotInfo[] }>;
  deletePage(pageId: number): Promise<{ ok: boolean; error?: string }>;
}

export type SiteWithCreds = Site & { credentials: SiteCredential | null };

export function siteBaseUrl(site: SiteWithCreds): string {
  return site.url.replace(/\/+$/, '');
}

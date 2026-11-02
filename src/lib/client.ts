'use client';

/**
 * Dashboard API client. All requests are same-origin, session-cookie based.
 * Secrets never appear here: pairing codes and site keys are the only
 * credential-ish values the UI ever sees, and the HMAC secret never leaves
 * the server.
 */

export interface User { id: string; email: string; name: string | null; role: string; onboardedAt: string | null }
export interface Entitlements {
  plan: { code: string; name: string; maxSites: number; monthlyCredits: number; priceCents: number } | null;
  balance: number;
  siteCount: number;
}
export interface SiteRow {
  id: string; name: string; url: string; mode: string; status: string;
  wpVersion?: string | null; elementorVersion?: string | null;
  elementorPro?: boolean; proLicenseOk?: boolean; pluginVersion?: string | null;
  lastCheckedAt?: string | null; siteKey?: string | null; pairingCode?: string | null;
  createdAt?: string;
}
export interface ProjectRow { id: string; name: string; status: string; businessName?: string | null; industry?: string | null; site?: { name: string; mode: string }; pageCount: number; createdAt: string }
export interface JobLogEntry { id: string; level: string; step: string | null; message: string; at: string }
export interface JobInfo { id: string; type: string; status: string; step: string | null; progress: number; error: string | null; logs: JobLogEntry[]; startedAt: string | null; finishedAt: string | null }
export interface PageRow {
  id: string; title: string; slug: string; status: string; wpPageId: number | null;
  revision: number; approved: boolean; error: string | null; verifyHash: string | null;
  validation: { valid?: boolean; stats?: { containers: number; widgets: number; depth: number; proWidgets?: string[] }; errors?: unknown[] };
  previewUrl: string; editUrl: string | null; frontUrl: string | null;
  revisions: { id: string; revision: number; instruction: string | null; at: string }[];
  createdAt: string;
}
export interface ProjectDetail {
  project: {
    id: string; name: string; status: string; businessName: string | null; industry: string | null;
    brief: Record<string, string>; pages: string[];
    designSystem: { colors?: Record<string, string>; fonts?: { heading?: string; body?: string } };
    sitemap: { pages?: { title: string; slug: string; goal?: string; blocks?: string[] }[] };
    site: { id: string; name: string; url: string; mode: string; status: string; elementorVersion?: string | null; elementorPro?: boolean };
    createdAt: string;
  };
  latestJob: JobInfo | null;
  pages: PageRow[];
}
export interface Diagnostics {
  ok: boolean; wp: { version?: string; php?: string; memoryLimit?: string };
  elementor: { active: boolean; version?: string; pro: boolean; proLicense?: boolean; containers?: boolean };
  plugin?: { version?: string }; mcp?: { connected: boolean; tools?: string[] };
  error?: string; checkedAt: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'same-origin',
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; code?: string };
    throw new ApiError(res.status, err.error ?? `Request failed (${res.status})`, err.code);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) => request<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(p: string, body: unknown) => request<T>(p, { method: 'PATCH', body: JSON.stringify(body) }),
  del: <T>(p: string) => request<T>(p, { method: 'DELETE' }),
};

export const STATUS_COLORS: Record<string, string> = {
  connected: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  published: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  building: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  running: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  queued: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  pending: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  pairing: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  review: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  revising: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  generated: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

export const MODE_LABELS: Record<string, string> = {
  connector: 'Connector plugin',
  elementor_mcp: 'Elementor MCP (official)',
  mcp_third_party: 'Third-party MCP',
  simulated: 'Simulated site (demo)',
};

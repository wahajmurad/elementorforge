'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { api, ApiError, Diagnostics, Entitlements, SiteRow } from '@/lib/client';
import { Loader2, Plus, Globe2, RefreshCw, Trash2, Copy, CheckCircle2, XCircle, Plug, Network, FlaskConical, KeyRound } from 'lucide-react';
import { STATUS_COLORS, MODE_LABELS } from '@/lib/client';
import { useRouter } from 'next/navigation';
import { navigateTo } from '@/lib/nav';

export function SitesView({ session, entitlements, siteId }: { session: { refresh: () => Promise<void> }; entitlements: Entitlements | null; siteId?: string }) {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await api.get<{ sites: SiteRow[] }>('/api/sites');
    setSites(res.sites);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const selected = siteId ? sites.find(s => s.id === siteId) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connected sites</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {entitlements?.plan ? `${entitlements.siteCount} of ${entitlements.plan.maxSites} used on ${entitlements.plan.name}` : 'Connect WordPress sites to generate pages on them'}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="h-10"><Plus className="h-4 w-4 mr-2" /> Add site</Button>
      </div>

      {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading sites…</div> : (
        sites.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Globe2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">No sites connected yet</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Connect your WordPress site via the connector plugin, official Elementor MCP, or try the built-in demo site.</p>
              <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" /> Add your first site</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sites.map(s => <SiteCard key={s.id} site={s} onDeleted={() => { load(); session.refresh(); }} onSelect={() => navigateTo('site', s.id)} selected={s.id === siteId} />)}
          </div>
        )
      )}

      {selected && <SiteDetail site={selected} onChanged={load} onDeleted={() => { navigateTo('sites'); load(); session.refresh(); }} />}

      <AddSiteDialog open={addOpen} onOpenChange={setAddOpen} onCreated={(site) => { load(); session.refresh(); if (site.mode === 'connector') { navigateTo('site', site.id); } setAddOpen(false); }} canAdd={(entitlements?.siteCount ?? 0) < (entitlements?.plan?.maxSites ?? 1)} maxSites={entitlements?.plan?.maxSites ?? 1} />
    </div>
  );
}

function SiteCard({ site, onDeleted, onSelect, selected }: { site: SiteRow; onDeleted: () => void; onSelect: () => void; selected: boolean }) {
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!confirm(`Disconnect "${site.name}"? The connector plugin on your site will stop working. Your WordPress content is not touched.`)) return;
    setBusy(true);
    try { await api.del(`/api/sites/${site.id}`); onDeleted(); } finally { setBusy(false); }
  };
  return (
    <Card className={selected ? 'ring-2 ring-emerald-500' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{site.name}</CardTitle>
            <CardDescription className="truncate">{site.mode === 'simulated' ? 'Built-in demo environment' : site.url}</CardDescription>
          </div>
          <Badge variant="secondary" className={STATUS_COLORS[site.status] ?? ''}>{site.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline">{MODE_LABELS[site.mode] ?? site.mode}</Badge>
          {site.elementorVersion && <Badge variant="outline">Elementor {site.elementorVersion}{site.elementorPro ? ' · Pro' : ''}</Badge>}
          {site.wpVersion && <Badge variant="outline">WP {site.wpVersion}</Badge>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onSelect} className="flex-1">Manage</Button>
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy}><Trash2 className="h-4 w-4 text-red-500" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------- Add site

type Mode = 'simulated' | 'connector' | 'elementor_mcp' | 'mcp_third_party';

function AddSiteDialog({ open, onOpenChange, onCreated, canAdd, maxSites }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (site: SiteRow) => void; canAdd: boolean; maxSites: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [pro, setPro] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [authUser, setAuthUser] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setMode(null); setName(''); setUrl(''); setPro(false); setEndpoint(''); setAuthUser(''); setError(null); };

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const body: Record<string, unknown> = { name, mode, url, elementorPro: pro };
      if (mode === 'elementor_mcp' || mode === 'mcp_third_party') {
        body.mcpConfig = { endpoint, authType: 'basic', authUser: authUser || undefined, toolMapping: {} };
      }
      const res = await api.post<{ site: SiteRow; pairing: { pairingCode: string; apiUrl: string; instructions: string } | null }>('/api/sites', body);
      onCreated(res.site);
      reset();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create site');
    } finally { setBusy(false); }
  };

  const modes: { id: Mode; title: string; desc: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'simulated', title: 'Try the demo site', desc: 'Built-in simulated WordPress site with the exact same connector contract. Best for testing the full flow right now.', icon: FlaskConical },
    { id: 'connector', title: 'Connector plugin (recommended)', desc: 'Install our versioned elementor-connect plugin and pair with a one-time code. Most reliable path, native Elementor writes.', icon: Plug },
    { id: 'elementor_mcp', title: 'Official Elementor MCP', desc: 'Enable Elementor → Elementor MCP on your site (admin only), create an Application Password, then paste the MCP endpoint here.', icon: Network },
    { id: 'mcp_third_party', title: 'Third-party MCP server', desc: 'Any MCP-compatible WordPress server. You map discovered tools to our operations in site settings.', icon: KeyRound },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a WordPress site</DialogTitle>
          <DialogDescription>Choose how ElementorForge should talk to your site. All modes write native Elementor structures.</DialogDescription>
        </DialogHeader>
        {!canAdd ? (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-sm p-3">
            Your plan allows {maxSites} connected site(s). Upgrade on the Billing page to add more.
          </div>
        ) : mode === null ? (
          <div className="grid gap-2">
            {modes.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)} className="flex gap-3 items-start rounded-lg border p-3 text-left hover:border-emerald-500 hover:bg-emerald-500/5 transition-colors">
                <m.icon className="h-5 w-5 mt-0.5 text-emerald-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium">{m.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Site name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="My business site" />
            </div>
            {mode !== 'simulated' && (
              <div className="space-y-1.5">
                <Label>Site URL</Label>
                <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" />
              </div>
            )}
            {(mode === 'elementor_mcp' || mode === 'mcp_third_party') && (
              <>
                <div className="space-y-1.5">
                  <Label>MCP endpoint URL</Label>
                  <Input value={endpoint} onChange={e => setEndpoint(e.target.value)} placeholder="https://example.com/wp-json/..." />
                </div>
                {mode === 'elementor_mcp' && (
                  <div className="space-y-1.5">
                    <Label>WordPress username (for the Application Password)</Label>
                    <Input value={authUser} onChange={e => setAuthUser(e.target.value)} placeholder="admin" />
                  </div>
                )}
                <div className="text-xs text-muted-foreground bg-muted rounded-md p-3 leading-relaxed">
                  {mode === 'elementor_mcp' ? (
                    <>Setup on your site (admin only): <strong>Elementor → Elementor MCP</strong> → pick “Other MCP tool” → Elementor creates the Application Password for you. Paste that password on the site detail page after adding the site here. Note: basic sections generate for free; Pro features require a valid Elementor Pro license on the site.</>
                  ) : (
                    <>After adding the site, open its settings and provide the transport token. You will map discovered tools (tools/list) to operations — nothing is hardcoded.</>
                  )}
                </div>
              </>
            )}
            {mode === 'connector' && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Site has Elementor Pro?</div>
                  <div className="text-xs text-muted-foreground">License is verified during pairing — Pro widgets are only written when verified.</div>
                </div>
                <Switch checked={pro} onCheckedChange={setPro} />
              </div>
            )}
            {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 rounded-md px-3 py-2">{error}</div>}
          </div>
        )}
        <DialogFooter className="gap-2">
          {mode && <Button variant="ghost" onClick={() => setMode(null)}>Back</Button>}
          {mode && <Button onClick={submit} disabled={busy || !name.trim() || (mode !== 'simulated' && !url.trim())}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'simulated' ? 'Create demo site' : 'Continue'}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ---------------------------------------------------------------- Detail

export function SiteDetail({ site, onChanged, onDeleted }: { site: SiteRow; onChanged: () => void; onDeleted: () => void }) {
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [mapping, setMapping] = useState('{}');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<{ site: { mcpConfig?: { toolMapping?: object } } }>(`/api/sites/${site.id}`)
      .then(r => setMapping(JSON.stringify(r.site.mcpConfig?.toolMapping ?? {}, null, 2)))
      .catch(() => {});
  }, [site.id]);

  const runDiagnostics = async () => {
    setBusy(true); setDiag(null);
    try {
      const res = await api.post<{ diagnostics: Diagnostics }>(`/api/sites/${site.id}`, { action: 'diagnostics' });
      setDiag(res.diagnostics);
      onChanged();
    } finally { setBusy(false); }
  };

  const reissueCode = async () => {
    const res = await api.post<{ pairingCode: string }>(`/api/sites/${site.id}`, { action: 'new_pairing_code' });
    setNewCode(res.pairingCode);
    onChanged();
  };

  const saveMcp = async () => {
    setBusy(true);
    try {
      const current = await api.get<{ site: { mcpConfig: Record<string, unknown> } }>(`/api/sites/${site.id}`);
      const cfg = current.site.mcpConfig;
      cfg.toolMapping = JSON.parse(mapping || '{}');
      await api.patch(`/api/sites/${site.id}`, { mcpConfig: cfg });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
      onChanged();
    } finally { setBusy(false); }
  };

  const saveToken = async () => {
    setBusy(true);
    try {
      await api.patch(`/api/sites/${site.id}`, { transportToken: token });
      setToken(''); setSaved(true); setTimeout(() => setSaved(false), 2000);
      onChanged();
    } finally { setBusy(false); }
  };

  const copy = (v: string) => navigator.clipboard.writeText(v);

  return (
    <Card className="border-emerald-200 dark:border-emerald-900">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">{site.name} <Badge variant="secondary" className={STATUS_COLORS[site.status] ?? ''}>{site.status}</Badge></CardTitle>
            <CardDescription>{site.mode === 'simulated' ? 'Simulated demo environment — same contract as the real plugin' : site.url}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={runDiagnostics} disabled={busy}><RefreshCw className={`h-4 w-4 mr-1.5 ${busy ? 'animate-spin' : ''}`} /> Run diagnostics</Button>
            {site.mode === 'connector' && <Button size="sm" variant="outline" onClick={reissueCode}>New pairing code</Button>}
            <Button size="sm" variant="ghost" onClick={onDeleted}><Trash2 className="h-4 w-4 text-red-500" /></Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {site.pairingCode && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-4">
            <div className="text-sm font-medium text-amber-900 dark:text-amber-300 mb-2">Finish pairing on your WordPress site</div>
            <ol className="text-sm text-amber-800 dark:text-amber-400/90 list-decimal ml-5 space-y-1">
              <li>Download & install the <code className="bg-white/60 dark:bg-black/30 px-1 rounded">elementor-connect</code> plugin (v1.0.0) from your project&apos;s <code>plugins/elementor-connect</code> directory, then activate it.</li>
              <li>In wp-admin open <strong>ElementorForge</strong> in the sidebar.</li>
              <li>Enter the pairing code below and your dashboard URL.</li>
            </ol>
            <div className="mt-3 flex items-center gap-2">
              <code className="text-lg font-mono font-semibold tracking-widest bg-white dark:bg-slate-900 border rounded px-3 py-1.5">{site.pairingCode}</code>
              <Button size="sm" variant="ghost" onClick={() => copy(site.pairingCode!)}><Copy className="h-3.5 w-3.5" /></Button>
              <span className="text-xs text-amber-700 dark:text-amber-500">valid 30 min · single use</span>
            </div>
          </div>
        )}
        {newCode && (
          <div className="rounded-lg border p-3 text-sm flex items-center gap-2">
            New code: <code className="font-mono text-base">{newCode}</code>
            <Button size="sm" variant="ghost" onClick={() => copy(newCode)}><Copy className="h-3.5 w-3.5" /></Button>
          </div>
        )}

        {diag && (
          <div className="rounded-lg border p-4 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium">
              {diag.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
              {diag.ok ? 'Site healthy' : 'Diagnostics reported a problem'}
            </div>
            <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              <div>WP: {diag.wp?.version ?? '—'} · PHP {diag.wp?.php ?? '—'}</div>
              <div>Elementor: {diag.elementor?.active ? `${diag.elementor.version ?? '?'}${diag.elementor.pro ? ' (Pro installed)' : ''}` : 'not active'}</div>
              {diag.elementor?.proLicense !== undefined && <div>Pro license verified: {diag.elementor.proLicense ? 'yes' : 'no — Pro widgets blocked'}</div>}
              {diag.mcp && <div>MCP tools discovered: {diag.mcp.tools?.length ?? 0}</div>}
              {diag.error && <div className="text-red-600 sm:col-span-2">{diag.error}</div>}
            </div>
            {diag.mcp?.tools && diag.mcp.tools.length > 0 && (
              <div className="text-xs"><span className="font-medium">Discovered tools:</span> {diag.mcp.tools.join(', ')}</div>
            )}
          </div>
        )}

        {(site.mode === 'elementor_mcp' || site.mode === 'mcp_third_party') && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="text-sm font-medium">MCP configuration</div>
            <div className="space-y-1.5">
              <Label>Application password / transport token</Label>
              <div className="flex gap-2">
                <Input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste the Application Password — stored encrypted server-side" />
                <Button size="sm" onClick={saveToken} disabled={busy || !token.trim()}>Save</Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Tool mapping (map discovered tools to operations)</Label>
              <Textarea value={mapping} onChange={e => setMapping(e.target.value)} rows={5} className="font-mono text-xs" placeholder='{"createPage": {"tool": "discovered-tool-name", "args": {"title": "$.title"}}}' />
              <div className="text-xs text-muted-foreground">Values starting with <code>$.</code> pull from the request payload (title, slug, elementorData, pageId…). Run diagnostics to list discovered tools first.</div>
              <Button size="sm" onClick={saveMcp} disabled={busy}>Save mapping</Button>
            </div>
          </div>
        )}

        {site.mode === 'simulated' && (
          <div className="text-xs text-muted-foreground bg-muted rounded-md p-3">
            This is the built-in simulated WordPress site: it implements exactly the same signed REST contract as the real connector plugin, so you can exercise connect → generate → verify → preview → revise end-to-end. Real sites use the same pipeline untouched.
          </div>
        )}
        {saved && <div className="text-xs text-emerald-600">Saved ✓</div>}
      </CardContent>
    </Card>
  );
}

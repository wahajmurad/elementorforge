'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { api, ApiError, ProjectDetail, ProjectRow } from '@/lib/client';
import { navigateTo } from '@/lib/nav';
import { Loader2, RefreshCw, Eye, PencilLine, Send, RotateCcw, ExternalLink, Terminal, Blocks, ChevronDown } from 'lucide-react';
import { STATUS_COLORS, MODE_LABELS } from '@/lib/client';

export function ProjectsView() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ projects: ProjectRow[] }>('/api/projects').then(r => setProjects(r.projects)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground mt-1">Every AI build, its pages, and its verification state.</p>
      </div>
      {loading ? <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div> : projects.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No projects yet — start one under “New build”.</CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {projects.map(p => (
            <Card key={p.id} className="hover:border-emerald-300 transition-colors cursor-pointer" onClick={() => navigateTo('project', p.id)}>
              <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.businessName} · {p.pageCount} page(s) · {p.site?.name} ({MODE_LABELS[p.site?.mode ?? ''] ?? p.site?.mode}) · {new Date(p.createdAt).toLocaleString()}</div>
                </div>
                <Badge variant="secondary" className={STATUS_COLORS[p.status] ?? ''}>{p.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectView({ id }: { id: string }) {
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ProjectDetail>(`/api/projects/${id}`);
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load project');
    }
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const jobRunning = data?.latestJob && (data.latestJob.status === 'queued' || data.latestJob.status === 'running');
  useEffect(() => {
    if (jobRunning) {
      polling.current = setInterval(load, 2000);
      return () => { if (polling.current) clearInterval(polling.current); };
    }
    if (polling.current) { clearInterval(polling.current); polling.current = null; }
  }, [jobRunning, load]);

  if (error) return <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 rounded-md px-3 py-2">{error}</div>;
  if (!data) return <div className="text-sm text-muted-foreground py-10 text-center">Loading project…</div>;

  const { project, latestJob, pages } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">{project.name} <Badge variant="secondary" className={STATUS_COLORS[project.status] ?? ''}>{project.status}</Badge></h1>
          <p className="text-sm text-muted-foreground mt-1">{project.businessName} · {project.site.name} ({MODE_LABELS[project.site.mode] ?? project.site.mode})</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
      </div>

      {latestJob && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Build progress</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="capitalize">{latestJob.step ?? latestJob.status}</span>
              <span className="text-muted-foreground">{latestJob.progress}%</span>
            </div>
            <Progress value={latestJob.progress} className="h-2" />
            {(latestJob.status === 'queued' || latestJob.status === 'running') ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Working — this panel updates automatically.</div>
            ) : latestJob.error ? (
              <div className="text-sm text-red-600">{latestJob.error}</div>
            ) : (
              <div className="text-xs text-muted-foreground">Last job {latestJob.status} · {latestJob.finishedAt ? new Date(latestJob.finishedAt).toLocaleString() : ''}</div>
            )}
            <BuildLog job={latestJob} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {pages.map(pg => <PageCard key={pg.id} page={pg} siteMode={project.site.mode} onChanged={load} />)}
      </div>
    </div>
  );
}

function BuildLog({ job }: { job: { logs: { id: string; level: string; step: string | null; message: string; at: string }[] } }) {
  const [open, setOpen] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (open && endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }); }, [open, job.logs.length]);
  return (
    <div className="rounded-lg border bg-slate-950 text-slate-200">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-xs">
        <span className="flex items-center gap-2"><Terminal className="h-3.5 w-3.5" /> Build log ({job.logs.length} entries)</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-3 max-h-72 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-0.5">
          {job.logs.map(l => (
            <div key={l.id} className={l.level === 'error' ? 'text-red-400' : l.level === 'warn' ? 'text-amber-300' : 'text-slate-300'}>
              <span className="text-slate-500">{new Date(l.at).toLocaleTimeString()} </span>
              {l.step && <span className="text-emerald-400">[{l.step}] </span>}{l.message}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}

function PageCard({ page, siteMode, onChanged }: { page: ProjectDetail['pages'][number]; siteMode: string; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [reviseOpen, setReviseOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const retry = async () => {
    setBusy('retry');
    try {
      const projectId = window.location.hash.split('/')[2];
      await api.post(`/api/projects/${projectId}/retry`, { pageId: page.id });
      onChanged();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Retry failed'); } finally { setBusy(null); }
  };

  const revise = async () => {
    setBusy('revise');
    setError(null);
    try {
      const projectId = window.location.hash.split('/')[2];
      await api.post(`/api/projects/${projectId}/revise`, { pageId: page.id, instruction });
      setReviseOpen(false); setInstruction('');
      onChanged();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Revision failed'); } finally { setBusy(null); }
  };

  const publish = async () => {
    if (!confirm(`Publish "${page.title}"? This makes the page live on the connected site.`)) return;
    setBusy('publish');
    try {
      await api.post(`/api/pages/${page.id}/publish`, { approve: true });
      onChanged();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Publish failed'); } finally { setBusy(null); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{page.title}</CardTitle>
            <CardDescription className="truncate">/{page.slug}{page.wpPageId ? ` · WP id ${page.wpPageId}` : ''}{page.revision > 0 ? ` · rev ${page.revision}` : ''}</CardDescription>
          </div>
          <Badge variant="secondary" className={STATUS_COLORS[page.status] ?? ''}>{page.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {page.error && <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950/40 rounded px-2 py-1.5">{page.error}</div>}
        {page.status !== 'failed' && page.status !== 'pending' && (
          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="font-normal">{page.validation?.stats?.widgets ?? 0} widgets · {page.validation?.stats?.containers ?? 0} containers</Badge>
            {page.verifyHash && <Badge variant="outline" className="font-normal">verified ✓ {page.verifyHash}</Badge>}
            {page.validation?.stats?.proWidgets?.length ? <Badge variant="outline" className="font-normal">Pro: {page.validation.stats.proWidgets.join(', ')}</Badge> : null}
          </div>
        )}
        {error && <div className="text-xs text-red-600">{error}</div>}
        <div className="flex flex-wrap gap-2">
          {page.status !== 'failed' && page.status !== 'pending' && (
            <Sheet>
              <SheetTrigger asChild><Button size="sm" variant="outline"><Eye className="h-3.5 w-3.5 mr-1.5" /> Preview</Button></SheetTrigger>
              <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
                <SheetHeader className="px-4 py-3 border-b">
                  <SheetTitle className="text-sm">{page.title} — Elementor structure preview</SheetTitle>
                </SheetHeader>
                <iframe src={page.previewUrl} className="flex-1 w-full bg-white" title={`Preview of ${page.title}`} sandbox="allow-same-origin" />
                <div className="px-4 py-2 text-[11px] text-muted-foreground border-t">Approximate rendering of the stored native Elementor JSON for review. Real rendering happens in WordPress.</div>
              </SheetContent>
            </Sheet>
          )}
          {page.status !== 'failed' && (
            <Dialog open={reviseOpen} onOpenChange={setReviseOpen}>
              <DialogTrigger asChild><Button size="sm" variant="outline"><PencilLine className="h-3.5 w-3.5 mr-1.5" /> Revise with AI</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>AI revision — {page.title}</DialogTitle>
                  <DialogDescription>Describe the change. A snapshot of the current version is saved for rollback. Costs 2 credits.</DialogDescription>
                </DialogHeader>
                <Textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={4} placeholder="e.g. Make the hero headline punchier, swap the CTA to point at /pricing, and use the surface background for the features section" />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setReviseOpen(false)}>Cancel</Button>
                  <Button onClick={revise} disabled={busy === 'revise' || instruction.trim().length < 4}>
                    {busy === 'revise' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-2" />} Apply revision
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {page.status === 'failed' && (
            <Button size="sm" variant="outline" onClick={retry} disabled={busy === 'retry'}>
              {busy === 'retry' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1.5" />} Retry this page
            </Button>
          )}
          {page.status === 'draft' && (
            <Button size="sm" onClick={publish} disabled={busy === 'publish'}>
              {busy === 'publish' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />} Approve & publish
            </Button>
          )}
          {page.wpPageId && siteMode !== 'simulated' && (
            <a href={page.editUrl ?? '#'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-emerald-600 hover:underline self-center">
              <ExternalLink className="h-3 w-3" /> Open in Elementor
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function ProjectsEmptyHint() {
  return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Blocks className="h-3.5 w-3.5" /> Start a project from the sidebar.</div>;
}

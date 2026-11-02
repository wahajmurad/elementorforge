'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, Entitlements, ProjectRow } from '@/lib/client';
import { Sparkles, Globe2, KeyRound, Blocks, ArrowUpRight, CheckCircle2, XCircle, Clock3 } from 'lucide-react';
import { STATUS_COLORS } from '@/lib/client';

import { navigateTo as navigate } from '@/lib/nav';


export default function Overview({ entitlements }: { entitlements: Entitlements | null }) {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ projects: ProjectRow[] }>('/api/projects').then(r => setProjects(r.projects)).finally(() => setLoading(false));
  }, []);

  const stats = [
    { icon: KeyRound, label: 'AI credits', value: entitlements?.balance ?? '—', hint: entitlements?.plan ? `${entitlements.plan.name} plan` : 'Free tier' },
    { icon: Globe2, label: 'Connected sites', value: entitlements?.siteCount ?? '—', hint: entitlements?.plan ? `${entitlements.plan.maxSites} allowed on plan` : '1 on free plan' },
    { icon: Blocks, label: 'Projects', value: projects.length, hint: 'All-time builds' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1">Generate native Elementor pages on your connected WordPress sites.</p>
        </div>
        <Button onClick={() => navigate('build')} className="h-10">
          <Sparkles className="h-4 w-4 mr-2" /> New AI build
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <s.icon className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-semibold mt-2">{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent projects</CardTitle>
            <CardDescription>Latest generation runs across all your sites</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('projects')}>View all <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
          ) : projects.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-muted-foreground mb-4">No projects yet. Connect a site, then run your first AI build.</p>
              <Button variant="outline" onClick={() => navigate('sites')}><Globe2 className="h-4 w-4 mr-2" /> Connect a site</Button>
            </div>
          ) : (
            <div className="divide-y">
              {projects.slice(0, 6).map(p => (
                <button key={p.id} onClick={() => navigate('project', p.id)} className="w-full flex items-center justify-between py-3 px-1 hover:bg-muted/50 rounded-md transition-colors text-left">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.businessName} · {p.site?.name} · {new Date(p.createdAt).toLocaleString()}</div>
                  </div>
                  <Badge variant="secondary" className={STATUS_COLORS[p.status] ?? ''}>{p.status}</Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: CheckCircle2, title: 'Verified drafts', text: 'A page counts as created only when the site confirms it and the structure read-back matches.' },
          { icon: Clock3, title: 'Publish on your terms', text: 'Drafts stay drafts. Publishing requires your explicit approval per page.' },
          { icon: XCircle, title: 'Targeted retries', text: 'A failed page never blocks the rest — retry just that page without re-paying.' },
        ].map(c => (
          <Card key={c.title}>
            <CardContent className="p-5">
              <c.icon className="h-4 w-4 text-emerald-600 mb-2" />
              <div className="font-medium text-sm">{c.title}</div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{c.text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

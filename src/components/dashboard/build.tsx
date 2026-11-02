'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError, Entitlements, SiteRow } from '@/lib/client';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import { navigateTo } from '@/lib/nav';

const PAGE_OPTIONS = ['Home', 'About', 'Services', 'Contact', 'Pricing', 'FAQ', 'Gallery'];

export function NewBuildView({ entitlements }: { entitlements: Entitlements | null }) {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [pages, setPages] = useState<string[]>(['Home', 'About', 'Services', 'Contact']);
  const [customPage, setCustomPage] = useState('');
  const [designInstructions, setDesignInstructions] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ sites: SiteRow[] }>('/api/sites').then(r => {
      const connected = r.sites.filter(s => s.status === 'connected');
      setSites(connected);
      if (connected.length) setSiteId(connected[0].id);
    }).catch(() => {});
  }, []);

  const togglePage = (p: string) => setPages(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  const addCustomPage = () => {
    const v = customPage.trim();
    if (v && !pages.includes(v) && pages.length < 10) { setPages([...pages, v]); setCustomPage(''); }
  };

  const cost = 3 + Math.max(1, pages.length) * 5;
  const balance = entitlements?.balance ?? 0;

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const res = await api.post<{ projectId: string; jobId: string }>('/api/projects', {
        siteId, name: projectName || `${businessName} website`,
        businessName, industry, description, email, city,
        pages, designInstructions, referenceUrl: referenceUrl || undefined,
      });
      navigateTo('project', res.projectId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to start build');
    } finally { setBusy(false); }
  };

  if (sites.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Wand2 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">You need a connected site first</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Connect a WordPress site (or spin up the built-in demo site) before generating pages.</p>
          <Button onClick={() => navigateTo('sites')}>Go to sites</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New AI build</h1>
        <p className="text-sm text-muted-foreground mt-1">The agent will analyze your brief, design a sitemap + design system, then write native Elementor pages as drafts.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Target site</CardTitle></CardHeader>
        <CardContent>
          <Select value={siteId} onValueChange={setSiteId}>
            <SelectTrigger className="w-full sm:w-96"><SelectValue placeholder="Select a connected site" /></SelectTrigger>
            <SelectContent>
              {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name} · {s.mode}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business brief</CardTitle>
          <CardDescription>Be specific — this is what the AI works from. Minimum 20 characters for the description.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Business name *</Label>
              <Input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Acme Landscaping" />
            </div>
            <div className="space-y-1.5">
              <Label>Industry</Label>
              <Input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Landscaping & garden design" />
            </div>
            <div className="space-y-1.5">
              <Label>Contact email (used on forms/CTAs)</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="hello@acme.com" />
            </div>
            <div className="space-y-1.5">
              <Label>City / service area</Label>
              <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Austin, TX" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>What does the business do? *</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Describe your services, your customers, what makes you different, your tone of voice…" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Reference URL (optional)</Label>
              <Input value={referenceUrl} onChange={e => setReferenceUrl(e.target.value)} placeholder="https://competitor-or-own-site.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Project name</Label>
              <Input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Defaults to business name" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pages to generate</CardTitle><CardDescription>Each page becomes a verified Elementor draft on your site.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PAGE_OPTIONS.map(p => (
              <label key={p} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm cursor-pointer transition-colors ${pages.includes(p) ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'hover:border-muted-foreground/40'}`}>
                <Checkbox checked={pages.includes(p)} onCheckedChange={() => togglePage(p)} /> {p}
              </label>
            ))}
            {pages.filter(p => !PAGE_OPTIONS.includes(p)).map(p => (
              <label key={p} className="inline-flex items-center gap-2 rounded-full border border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-3 py-1.5 text-sm cursor-pointer">
                <Checkbox checked onCheckedChange={() => togglePage(p)} /> {p}
              </label>
            ))}
          </div>
          <div className="flex gap-2 max-w-sm">
            <Input value={customPage} onChange={e => setCustomPage(e.target.value)} placeholder="Add custom page (e.g. Portfolio)" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomPage(); } }} />
            <Button variant="outline" onClick={addCustomPage}>Add</Button>
          </div>
          <div className="space-y-1.5">
            <Label>Design instructions (optional)</Label>
            <Textarea value={designInstructions} onChange={e => setDesignInstructions(e.target.value)} rows={3} placeholder="e.g. Dark hero with amber accents, big typography, rounded cards. Brand color #0F766E. Modern, minimal." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="text-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              <span>Cost: <strong>{cost} credits</strong> ({pages.length} page{pages.length > 1 ? 's' : ''} + 3 for analysis & design system)</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Balance: {balance} credits. Failed pages are never charged; unused reserves are refunded automatically.</div>
          </div>
          <Button size="lg" onClick={submit} disabled={busy || !businessName.trim() || description.trim().length < 20 || !siteId || balance < cost}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            Generate website
          </Button>
        </CardContent>
      </Card>
      {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 rounded-md px-3 py-2">{error}</div>}
    </div>
  );
}

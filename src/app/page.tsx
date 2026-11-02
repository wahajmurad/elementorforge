'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError, Entitlements, User } from '@/lib/client';
import { navigateTo } from '@/lib/nav';
import Overview from '@/components/dashboard/overview';
import { SitesView } from '@/components/dashboard/sites';
import { NewBuildView } from '@/components/dashboard/build';
import { ProjectsView, ProjectView } from '@/components/dashboard/project';
import { CreditsView, BillingView } from '@/components/dashboard/account';
import { Loader2, Blocks, Zap, Globe2, ShieldCheck, Sparkles, ArrowRight, KeyRound } from 'lucide-react';

export default function RootPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const res = await api.get<{ user: User | null; entitlements?: Entitlements }>('/api/auth/me');
      setUser(res.user);
      setEntitlements(res.entitlements ?? null);
      return res.user;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshSession().finally(() => setLoading(false)); }, [refreshSession]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Loading ElementorForge…</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthView onAuthed={(u, e) => { setUser(u); setEntitlements(e); router.refresh(); }} />;
  }

  return <AppShell user={user} entitlements={entitlements} refreshSession={async () => { await refreshSession(); }} />;
}

// ---------------------------------------------------------------- Auth

function AuthView({ onAuthed }: { onAuthed: (u: User, e: Entitlements | null) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await api.post<{ user: User; entitlements: Entitlements }>(`/api/auth/${mode}`, { email, password, name: mode === 'register' ? name : undefined });
      onAuthed(res.user, res.entitlements);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 lg:flex-row">
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-16 text-white">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-9 w-9 rounded-lg bg-emerald-500 flex items-center justify-center"><Blocks className="h-5 w-5 text-slate-950" /></div>
          <span className="text-lg font-semibold tracking-tight">ElementorForge</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight max-w-xl">
          AI that builds real <span className="text-emerald-400">Elementor</span> websites.
        </h1>
        <p className="mt-4 text-slate-300 max-w-lg text-base sm:text-lg">
          Describe your business. Get complete, responsive, fully editable pages — native Elementor
          containers and widgets, written straight into your WordPress site as drafts. No iframes.
          No screenshots. No custom HTML dumps.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-3 max-w-2xl">
          {[
            { icon: Globe2, title: 'Connect', text: 'Pair your WordPress site in 2 minutes' },
            { icon: Sparkles, title: 'Generate', text: 'Sitemap, design system, pages — by AI' },
            { icon: ShieldCheck, title: 'Verify', text: 'Every page validated & read back' },
          ].map(f => (
            <div key={f.title} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
              <f.icon className="h-5 w-5 text-emerald-400 mb-2" />
              <div className="font-medium text-sm">{f.title}</div>
              <div className="text-xs text-slate-400 mt-1">{f.text}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <Card className="w-full max-w-md shadow-2xl">
          <CardHeader>
            <CardTitle>{mode === 'login' ? 'Welcome back' : 'Create your account'}</CardTitle>
            <CardDescription>
              {mode === 'login' ? 'Sign in to your workspace' : 'Start with 25 free AI credits — no card required'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {mode === 'register' && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="Alex Founder" autoComplete="name" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </div>
              {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 rounded-md px-3 py-2">{error}</div>}
              <Button type="submit" className="w-full h-11" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'login' ? 'Sign in' : 'Create account & start free'}
              </Button>
            </form>
            <div className="mt-4 text-sm text-center text-muted-foreground">
              {mode === 'login' ? (
                <>New here? <button className="text-emerald-600 hover:underline font-medium" onClick={() => setMode('register')}>Create an account</button></>
              ) : (
                <>Already have an account? <button className="text-emerald-600 hover:underline font-medium" onClick={() => setMode('login')}>Sign in</button></>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Shell

export type Session = { refresh: () => Promise<void> };

const NAV = [
  { id: 'overview', label: 'Overview', icon: Zap },
  { id: 'sites', label: 'Connected sites', icon: Globe2 },
  { id: 'build', label: 'New build', icon: Sparkles },
  { id: 'projects', label: 'Projects', icon: Blocks },
  { id: 'credits', label: 'AI credits', icon: KeyRound },
  { id: 'billing', label: 'Billing', icon: ArrowRight },
];

function AppShell({ user, entitlements, refreshSession }: { user: User; entitlements: Entitlements | null; refreshSession: () => Promise<void> }) {
  const [hash, setHash] = useState('');
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    onChange();
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const parts = hash.replace(/^#\/?/, '').split('/');
  const view = parts[0] || 'overview';
  const param = parts[1] ?? null;

  const navigate = (v: string, p?: string) => navigateTo(v, p);

  const logout = async () => { await api.post('/api/auth/logout'); window.location.assign(window.location.pathname); };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-60 flex-col bg-slate-950 text-slate-300 p-4 sticky top-0 h-screen">
          <div className="flex items-center gap-2 px-2 py-3 mb-4">
            <div className="h-8 w-8 rounded-lg bg-emerald-500 flex items-center justify-center"><Blocks className="h-4 w-4 text-slate-950" /></div>
            <span className="font-semibold text-white">ElementorForge</span>
          </div>
          <nav className="space-y-1 flex-1">
            {NAV.map(item => (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${view === item.id || (item.id === 'sites' && view === 'site') || (item.id === 'projects' && view === 'project') ? 'bg-emerald-500/15 text-emerald-300 font-medium' : 'hover:bg-white/5 hover:text-white'}`}
              >
                <item.icon className="h-4 w-4" /> {item.label}
              </button>
            ))}
          </nav>
          <div className="rounded-lg bg-white/5 p-3 text-xs">
            <div className="font-medium text-white mb-1">{entitlements?.plan?.name ?? 'Free'} plan</div>
            <div className="text-slate-400">{entitlements?.balance ?? 0} AI credits available</div>
            <button onClick={() => navigate('billing')} className="mt-2 text-emerald-400 hover:underline">Upgrade plan →</button>
          </div>
          <div className="mt-3 px-2 flex items-center justify-between text-xs">
            <span className="truncate text-slate-400">{user.email}</span>
            <button onClick={logout} className="text-slate-400 hover:text-white">Sign out</button>
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="lg:hidden bg-slate-950 text-slate-300 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-emerald-500 flex items-center justify-center"><Blocks className="h-4 w-4 text-slate-950" /></div>
              <span className="font-semibold text-white text-sm">ElementorForge</span>
            </div>
            <button onClick={logout} className="text-xs text-slate-400">Sign out</button>
          </header>
          <nav className="lg:hidden flex overflow-x-auto gap-1 bg-slate-950 px-2 pb-2 text-xs">
            {NAV.map(item => (
              <button key={item.id} onClick={() => navigate(item.id)} className={`whitespace-nowrap rounded-full px-3 py-1.5 ${view === item.id ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400'}`}>
                {item.label}
              </button>
            ))}
          </nav>

          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">
            {view === 'overview' && <Overview entitlements={entitlements} />}
            {view === 'sites' && <SitesView session={{ refresh: async () => { await refreshSession(); } }} entitlements={entitlements} />}
            {view === 'site' && param && <SitesView session={{ refresh: async () => { await refreshSession(); } }} entitlements={entitlements} siteId={param} />}
            {view === 'build' && <NewBuildView entitlements={entitlements} />}
            {view === 'projects' && <ProjectsView />}
            {view === 'project' && param && <ProjectView id={param} />}
            {view === 'credits' && <CreditsView />}
            {view === 'billing' && <BillingView refreshSession={refreshSession} />}
          </main>

          <footer className="mt-auto border-t bg-background px-6 py-4 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 justify-between">
            <span>ElementorForge — native Elementor page generation. Drafts only until you approve & publish.</span>
            <span>Elementor Pro widgets require a valid Pro license on the connected site.</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

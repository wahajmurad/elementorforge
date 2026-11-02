'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ApiError, Entitlements, User } from '@/lib/client';
import { Loader2, Check, KeyRound, Receipt, Activity } from 'lucide-react';

interface Plan {
  id: string; code: string; name: string; priceCents: number; monthlyCredits: number; maxSites: number; features: string[];
}

export function CreditsView() {
  const [balance, setBalance] = useState<number | null>(null);
  const [ledger, setLedger] = useState<{ id: string; delta: number; balanceAfter: number; reason: string; createdAt: string; meta: Record<string, unknown> }[]>([]);
  const [usage, setUsage] = useState<{ totals: { provider: string; step: string; tokensIn: number; tokensOut: number; calls: number }[] } | null>(null);

  useEffect(() => {
    api.get<{ balance: number; ledger: typeof ledger }>('/api/credits').then(r => { setBalance(r.balance); setLedger(r.ledger); }).catch(() => {});
    api.get<{ totals: { provider: string; step: string; tokensIn: number; tokensOut: number; calls: number }[] }>('/api/usage').then(setUsage).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI credits</h1>
        <p className="text-sm text-muted-foreground mt-1">Credits are reserved when a build starts and consumed only for confirmed results.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <KeyRound className="h-4 w-4 text-emerald-600 mb-2" />
            <div className="text-3xl font-semibold">{balance ?? '…'}</div>
            <div className="text-xs text-muted-foreground mt-1">Available credits</div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" /> AI usage by step</CardTitle></CardHeader>
          <CardContent>
            {!usage || usage.totals.length === 0 ? (
              <div className="text-xs text-muted-foreground">No AI calls yet. Usage appears here after your first build.</div>
            ) : (
              <div className="divide-y text-sm">
                {usage.totals.map((t, i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <span className="capitalize">{t.step} <Badge variant="outline" className="ml-1 font-normal text-[10px]">{t.provider}</Badge></span>
                    <span className="text-xs text-muted-foreground">{t.calls} calls · {t.tokensIn + t.tokensOut} tokens</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4" /> Credit ledger</CardTitle><CardDescription>Append-only. Every entry has an idempotency key, so retries can never double-charge.</CardDescription></CardHeader>
        <CardContent>
          {ledger.length === 0 ? <div className="text-xs text-muted-foreground py-4">No entries yet.</div> : (
            <div className="divide-y text-sm max-h-96 overflow-y-auto">
              {ledger.map(l => (
                <div key={l.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <div className="text-sm">{reasonLabel(l.reason)}{l.meta && typeof l.meta === 'object' && 'plan' in l.meta ? <span className="text-muted-foreground"> · {String((l.meta as { plan?: string }).plan)}</span> : null}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(l.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium ${l.delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</div>
                    <div className="text-[11px] text-muted-foreground">bal {l.balanceAfter}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function reasonLabel(r: string) {
  const map: Record<string, string> = {
    signup_bonus: 'Welcome bonus', plan_grant: 'Plan credits', build_reserve: 'Build reserved',
    build_consume: 'Build consumed', build_release: 'Unused refunded', admin_grant: 'Admin grant',
  };
  return map[r] ?? r;
}

export function BillingView({ refreshSession }: { refreshSession: () => Promise<void> }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<Entitlements | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.get<{ plans: Plan[] }>('/api/plans').then(r => setPlans(r.plans)).catch(() => {});
    api.get<{ user: User | null; entitlements?: Entitlements }>('/api/auth/me').then(r => setCurrent(r.entitlements ?? null)).catch(() => {});
  };
  useEffect(load, []);

  const activate = async (code: string) => {
    setBusy(code); setError(null);
    try {
      const res = await api.post<{ mode: string; url?: string }>('/api/billing/checkout', { planCode: code });
      if (res.mode === 'stripe' && res.url) { window.location.href = res.url; return; }
      await refreshSession(); load();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Checkout failed'); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Current plan: <strong>{current?.plan?.name ?? 'Free'}</strong> · {current?.balance ?? 0} credits.
          {process.env.NODE_ENV !== 'production' || !process.env.STRIPE_SECRET_KEY
            ? ' Test mode: plan changes activate instantly. Set STRIPE_SECRET_KEY for real Stripe Checkout.'
            : ' Payments via Stripe Checkout.'}
        </p>
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 rounded-md px-3 py-2">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map(p => {
          const isCurrent = current?.plan?.code === p.code;
          return (
            <Card key={p.code} className={isCurrent ? 'ring-2 ring-emerald-500' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  {isCurrent && <Badge className="bg-emerald-600">Current</Badge>}
                </div>
                <CardDescription>
                  {p.priceCents === 0 ? 'Free' : `$${(p.priceCents / 100).toFixed(0)}/mo`}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-2xl font-semibold">{p.monthlyCredits} <span className="text-sm font-normal text-muted-foreground">credits/mo</span></div>
                <ul className="text-xs space-y-1.5 text-muted-foreground">
                  {p.features.map(f => <li key={f} className="flex gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> {f}</li>)}
                </ul>
                <Button className="w-full" variant={isCurrent ? 'secondary' : 'default'} disabled={isCurrent || busy === p.code} onClick={() => activate(p.code)}>
                  {busy === p.code ? <Loader2 className="h-4 w-4 animate-spin" /> : isCurrent ? 'Active' : p.priceCents === 0 ? 'Switch to Free' : 'Upgrade'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

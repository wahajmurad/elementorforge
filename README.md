# ElementorForge — AI-Powered Elementor Website Builder SaaS

Generate complete, **native Elementor** pages (containers + widgets, fully editable) directly
into customers' WordPress sites. No iframes, no custom-HTML dumps, no screenshots.

```
┌───────────────────────────── SaaS (this repo) ──────────────────────────────┐
│  Next.js 16 dashboard (SPA on /)        API routes (/api/*)                 │
│  • auth + onboarding  • sites/pairing   • projects + build jobs              │
│  • credits ledger     • billing/plans   • page preview + publish approval   │
│                                                                              │
│  Pipeline worker:  analyze → sitemap → design system → per-page             │
│  [components → compile → validate → write draft → verify read-back]         │
│  Queue: memory (dev) | BullMQ+Redis (production) — pluggable driver          │
│  AI:    Anthropic | OpenAI | Z.ai | deterministic mock — pluggable provider  │
│  Sites: connector REST | Elementor MCP | third-party MCP — pluggable adapter │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               │ 1) HMAC-signed REST (connector plugin)
                               │ 2) MCP over HTTP (application passwords)
                               ▼
                 Customer WordPress + Elementor (content stays on their site)
```

## What "verified draft" means

A page is only marked `draft` (and only credits consumed) when **all** of these happened:

1. The site adapter **confirmed** creation with a real WordPress page ID.
2. The page was **read back** from the site.
3. The canonical **structure hash** of the read-back Elementor JSON matches what we sent.

Failures never block successful pages — retry single pages for free. Publishing requires an
explicit per-page approval, and publish is only confirmed when the site reports `publish` status.

## Repository layout

| Path | What |
| --- | --- |
| `src/app/api/*` | REST API (auth, sites, pairing hook, projects, jobs, pages, credits, billing) |
| `src/app/page.tsx` + `src/components/dashboard/*` | The dashboard SPA (single-page shell, hash-routed views) |
| `src/lib/elementor/*` | Widget catalog, structural validator, semantic→Elementor compiler, preview renderer |
| `src/lib/ai/*` | Provider registry (anthropic/openai/zai/mock), pipeline prompts, offline mock engine |
| `src/lib/wp/*` | Site adapters: connector client (HMAC), MCP client (tools/list discovery), WP simulator |
| `src/lib/pipeline/build.ts` | The build/revise/retry/publish orchestrator |
| `src/lib/queue/*` | Queue abstraction: memory driver + BullMQ driver |
| `src/lib/credits.ts` | Atomic credit ledger (reserve→consume/release, idempotency keys) |
| `plugins/elementor-connect/` | Versioned WordPress connector plugin (installable separately) |
| `tests/` | Vitest: validator, compiler, crypto, auth, credits, full E2E pipeline |
| `docker/` | Production deployment (web, worker, postgres, redis, Caddy) |
| `docs/` | ARCHITECTURE, SETUP, SECURITY, PLUGIN-AND-MCP |

## Quick start (sandbox/dev)

```bash
cp .env.example .env            # defaults work for local dev
bun run db:push                 # create SQLite schema
bun run dev                     # http://localhost:3000
bunx vitest run                 # 30 tests incl. full E2E golden path
```

First run: register → **Add site → Try the demo site** (a simulated WordPress implementing the
exact connector contract) → **New AI build** → watch progress → preview → revise → publish.

## Connecting a real WordPress site

1. Install `plugins/elementor-connect/` (v1.0.0) on the target site + activate Elementor (free).
2. Dashboard → **Sites → Add site → Connector plugin** → copy the pairing code.
3. wp-admin → **ElementorForge** → paste dashboard URL + pairing code → Pair.
4. Run diagnostics. Pro widgets unlock only when a valid Pro license is verified on the site.

Details incl. the official Elementor MCP path: [docs/PLUGIN-AND-MCP.md](docs/PLUGIN-AND-MCP.md).

## Production deploy (Hostinger VPS or any Docker host)

```bash
cp .env.example .env   # set SECRET_VAULT_KEY, POSTGRES_PASSWORD, APP_DOMAIN, AI keys
cd docker && docker compose up -d --build
docker compose exec web npx prisma migrate deploy --schema prisma/schema.postgres.prisma
```

Caddy terminates HTTPS automatically for your domain; web + worker + postgres + redis run as
services. See [docs/SETUP.md](docs/SETUP.md).

## Honest limitations

- **PHP files were written against WordPress/Elementor APIs but could not be `php -l` linted in
  this sandbox (no PHP CLI available).** Review before first activation; the code avoids exotic
  syntax and targets PHP 7.4+.
- Stripe: without `STRIPE_SECRET_KEY` the app runs in clearly-labeled **test mode** (instant plan
  activation). With the key, Checkout is used; the webhook fulfillment route should be added per
  `src/lib/billing.ts#fulfillSubscription` before charging real customers.
- The Elementor MCP adapter discovers tools dynamically (`tools/list`) and requires the operator
  to map operations to tools in site settings — the official Elementor MCP's exact tool names are
  not hardcoded anywhere.
- MySQL/SQLite is the dev database; production schema for PostgreSQL ships in
  `prisma/schema.postgres.prisma`.

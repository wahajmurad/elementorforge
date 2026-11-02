# Setup guide

## A. Local development (sandbox)

```bash
cp .env.example .env
bun install
bun run db:push          # SQLite at db/custom.db
bun run dev              # Next.js on :3000 (dev server is managed in the sandbox)
bunx vitest run          # full test suite (uses db/test.db, mock AI, simulated site)
```

Environment notes:
- `AI_PROVIDER` unset → auto-detect: ANTHROPIC_API_KEY → OPENAI_API_KEY → Z.ai SDK → mock.
- `QUEUE_DRIVER=memory` (default) runs the worker inside the Next.js process; jobs survive in
  the DB queue and are picked up automatically after restarts.
- The demo site requires no external services.

## B. Production on a VPS (e.g. Hostinger) with Docker

1. **Provision**: Ubuntu 22.04+, 2 vCPU / 4 GB, Docker + Compose plugin, DNS A record → VPS IP.
2. **Configure**:
   ```bash
   git clone <your-repo> && cd elementorforge
   cp .env.example .env
   # REQUIRED:
   #  SECRET_VAULT_KEY=$(openssl rand -hex 32)
   #  POSTGRES_PASSWORD=$(openssl rand -hex 16)
   #  APP_URL=https://app.yourdomain.com   APP_DOMAIN=app.yourdomain.com
   #  AI_PROVIDER=anthropic  ANTHROPIC_API_KEY=sk-ant-...
   ```
3. **Up**:
   ```bash
   cd docker && docker compose up -d --build
   docker compose exec web npx prisma migrate deploy --schema prisma/schema.postgres.prisma
   ```
   Caddy issues Let's Encrypt certificates automatically for `APP_DOMAIN`.
4. **Stripe (optional)**: set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`, add a webhook
   endpoint to `/api/hooks/stripe` (implement it by calling `fulfillSubscription()` — signature
   verification helper `verifyStripeSignature()` is provided). Without keys, billing runs in
   clearly-labeled test mode.
5. **Backups**: `pgdata` volume (customer account data) + Caddy certs. WordPress content is on
   customer sites — backup there, not here.

## C. Connecting the first real site

See docs/PLUGIN-AND-MCP.md (plugin install, pairing, diagnostics, MCP alternatives).

## D. Operations

| Task | How |
| --- | --- |
| Watch builds | Dashboard → project page (auto-refreshing progress + full build log) |
| Retry failed page | Project → page card → "Retry this page" (free, targeted) |
| Rollback a revision | Snapshot is written before every AI update (last 10 per page, via plugin) |
| Inspect credit history | AI credits → append-only ledger with idempotency keys |
| Audit actions | Plugin admin → Audit Log (pairing + page mutations with IPs) |
| Rotate a site secret | Sites → site → disconnect → re-pair (new secret generated) |

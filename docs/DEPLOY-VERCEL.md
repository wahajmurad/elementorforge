# Deploy ElementorForge to Vercel

This guide deploys the SaaS dashboard + API to **Vercel** with a managed
**Postgres** database. After this, your WordPress connector can pair with a
real, valid TLS domain (`https://<app>.vercel.app`) — which fixes the
`cURL error 60: SSL certificate mismatch` you saw with the sandbox preview URL.

> Architecture on Vercel: Next.js app + API in serverless functions, jobs run
> through the in-process **memory queue** (the `after()` fix keeps builds
> running post-response), data in **Vercel Postgres** (Neon). The BullMQ/Redis
> worker (docker/) is only needed for self-hosted long-running AI builds.

---

## 1. Push the repo to GitHub

```bash
cd /path/to/elementorforge
git init && git add -A && git commit -m "ElementorForge SaaS"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/elementorforge.git
git push -u origin main
```

> `.env` is git-ignored. Never commit real secrets.

## 2. Create the Vercel project

1. https://vercel.com → **Add New → Project** → import the repo.
2. Framework auto-detects **Next.js**. `vercel.json` already sets the correct
   build command (`prisma generate --schema prisma/schema.postgres.prisma && next build`).
3. **Do not deploy yet** — first add the database and env vars (steps 3–4),
   then hit **Deploy**.

## 3. Create the database (Vercel Postgres)

1. Project → **Storage** tab → **Create Database → Postgres (Neon)**.
2. Choose a region close to your WordPress host (e.g. `fra1` for EU, `bom1` for India).
3. After creation, open the database → **`.env.local`** tab → it shows
   `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` / `DIRECT_URL`.
4. "Connect to project" links it — Vercel injects `DATABASE_URL` automatically.
   Verify under Settings → Environment Variables.

## 4. Set environment variables

Project → Settings → Environment Variables (Production + Preview):

| Key | Value | Notes |
|---|---|---|
| `DATABASE_URL` | *(auto-injected by Vercel Postgres)* | pooled URL |
| `APP_SECRET` | `openssl rand -hex 32` output | **required** — derives the AES key that encrypts WP site secrets |
| `AI_PROVIDER` | `mock` | start with the mock engine; switch to `anthropic`/`openai` + API key later |
| `QUEUE_DRIVER` | `memory` | serverless-safe driver |

> `SECRET_VAULT_KEY` (optional, hex-64) must be set **before the first site
> pairing** and never rotated casually — stored site secrets become unreadable
> if it changes.

## 5. Push the database schema (one time, from your machine)

Prisma needs the **direct (unpooled)** URL for DDL:

```bash
DATABASE_URL="<DATABASE_URL_UNPOOLED or DIRECT_URL>" \
  bun run db:push:pg
```

This creates all tables. **Plans are seeded automatically** on first use
(`ensurePlansSeeded()` upserts free/starter/pro/agency) — no extra seed step.

## 6. Deploy & verify

Hit **Deploy** (or `git push` to re-deploy). Then check:

- `https://<app>.vercel.app/api/plans` → JSON with the 4 plans ✅
- Register an account → 25 signup credits ✅
- Vercel logs (Deployments → Runtime Logs) show no errors ✅

## 7. Pair your WordPress site

1. WP admin → **Plugins → Add New → Upload** → `elementor-connect.zip` → Activate.
2. ElementorForge dashboard → **Sites → Add site → Connector plugin** → copy the pairing code.
3. WP admin → **ElementorForge** → dashboard URL:

   ```
   https://<app>.vercel.app
   ```

   → paste code → **Pair site**. ✅ Vercel serves a valid certificate for this
   hostname, so WordPress accepts it (no more cURL error 60).

4. Run a build from **New build** → the page appears as a **draft** in WP.

## 8. Custom domain (recommended)

Vercel → Settings → Domains → add e.g. `app.yourdomain.com` (A/CNAME per
instructions — TLS is automatic). Re-pair WordPress with the new URL after
switching (disconnect → re-pair generates a fresh secret).

## Notes & limits

- **Function duration**: routes that trigger builds/pairing export
  `maxDuration = 60` (Hobby plan max). The mock engine finishes in seconds.
  With real AI providers, long page builds may need the **Pro** plan (up to
  300s) or the self-hosted docker worker (see `docs/SETUP.md`).
- **Queue**: memory driver is per-instance and single-concurrency — fine for
  MVP traffic. For heavy parallel builds, self-host with `QUEUE_DRIVER=bullmq`.
- **Local dev** keeps using SQLite (`prisma/schema.prisma`); Vercel/Docker use
  `prisma/schema.postgres.prisma` — selected automatically by the build command.
- **Log noise / PII**: Prisma query logging is disabled in production.

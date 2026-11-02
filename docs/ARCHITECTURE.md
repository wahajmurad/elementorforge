# Architecture

## 1. Guiding decisions

| Decision | Rationale |
| --- | --- |
| **Three pluggable site adapters** (`SiteAdapter` interface) | The pipeline never knows how a site is reached. Connector REST (deterministic, primary), official Elementor MCP (per documented enable flow), third-party MCP (generic). Swap without touching the pipeline. |
| **AI emits semantic blocks, never raw Elementor JSON** | LLM output is compiled deterministically into native Elementor containers/widgets. Valid-by-construction, then validated again — defense in depth. |
| **Simulated WordPress site** implementing the exact connector contract | Enables the full golden path (connect → build → verify → preview → revise → publish) in dev/tests without a live site. Clearly labeled in the UI; production path is untouched code. |
| **Credits as an append-only ledger** | Every mutation carries a UNIQUE idempotency key → replays, double-clicks and webhook retries can never double-charge. Reserve→consume/release refunds unused credits automatically. |
| **Queue driver abstraction** | `memory` in dev (in-process, DB-backed job state), `bullmq` in production (dedicated worker container). Same pipeline code. |
| **AI provider registry** | anthropic / openai / zai / deterministic mock. Selected by env; the pipeline is provider-agnostic; usage is logged per step. |

## 2. Build pipeline (per `build_site` job)

```
preflight      site diagnostics (must pass before any AI spend)
analyze        brief → brand analysis JSON                     (AI)
sitemap        analysis + requested pages → page specs         (AI)
design_system  analysis → tokens (colors/fonts/spacing/radius) (AI)
per page:
  components   page spec → semantic blocks JSON                (AI)
  compile      blocks → native Elementor tree (containers/widgets)
  validate     structural whitelist check (+1 self-repair round)
  write        draft page via SiteAdapter  ← full meta set
  verify       read back, canonical structure hash must match
finalize       consume credits for built pages only
```

`revise_page` loads the stored semantic spec, applies the instruction (AI), recompiles,
**snapshots the current WordPress data first** (rollback point), updates, verifies.
`rebuild_page` retries exactly one page (free). `publish_page` requires `approved=true` and is
only marked published when the site confirms `status: publish`.

## 3. Data model (Prisma)

`User · Session · Plan · Subscription · Site · SiteCredential (encrypted secrets) · Project ·
BuildJob (logs) · GeneratedPage (+specJson, verifyHash, validationReport) · PageRevision ·
CreditEntry · UsageLog · JobLog · AuditLog`

WordPress content never lands in the SaaS DB except the Elementor JSON needed for preview/audit —
the source of truth stays in the customer's `wp_postmeta`.

## 4. Security model (summary — full detail in SECURITY.md)

- Sessions: httpOnly, SameSite=Strict cookies; scrypt password hashing; sessions hashed at rest.
- SaaS→site calls: `X-AELC-Key` + HMAC-SHA256 over (METHOD, path, sha256(body), timestamp),
  ±300s replay window, per-key rate limiting. Secrets AES-256-GCM encrypted at rest.
- Pairing: one-time 30-min code, exchanged exactly once for the HMAC secret over HTTPS.
- Plugin side: machine routes are HMAC-gated; admin routes use capabilities + nonces; only
  pages the connector created (`_aelc_managed`) can be mutated; published pages are never
  auto-deleted; uninstall deletes nothing without explicit double opt-in.
- Secrets never reach the browser: the UI only ever sees pairing codes and site-key prefixes.

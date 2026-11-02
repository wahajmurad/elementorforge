# Security & privacy model

## Threat model summary

Assets: customer WordPress sites (write access), SaaS account data, AI credits, provider API
keys, pairing secrets. Untrusted: the public internet, browser clients, the customer's own
low-privileged WP users, replayed or forged SaaS→site requests.

## Authentication & sessions (SaaS)

- Passwords: scrypt (N=16384, r=8, p=1) with per-user salt, constant-time verification,
  dummy-hash on unknown email to prevent user-enumeration timing.
- Sessions: 32-byte CSPRNG tokens; only SHA-256 hashes stored; cookie `HttpOnly; SameSite=Strict;
  Secure` (in production); 14-day expiry with server-side revocation.
- Login/register rate-limited per IP (10/min).

## SaaS → WordPress (connector plugin)

- **Pairing**: dashboard issues a one-time code (format `XXXX-XXXX`, 30-minute TTL, single use,
  rate-limited hook). The plugin exchanges it for a per-site key + 32-byte HMAC secret over
  HTTPS. The secret is stored AES-256-GCM encrypted in the SaaS and in the plugin options.
- **Request signing** (machine traffic; WP nonces are session-scoped and do not apply here):
  ```
  base = METHOD \n /wp-json/aelc/v1/... \n sha256(body) \n unix_timestamp
  X-AELC-Signature = HMAC-SHA256(secret, base)     # ±300s replay window
  ```
  Verified with `hash_equals` in `AEFC_Security::verify_request()`; failures are audit-logged.
- **Rate limiting**: 120 requests / 5 min per site key (transient-based, swappable for Redis).
- **Least privilege**: REST routes can only mutate pages carrying `_aelc_managed = 1`
  (set by the connector at creation). Deleting published pages is refused — drafts go to trash
  (recoverable), never hard-deleted via API. Pages are authored by a dedicated `editor`-role
  service user, not a real admin.
- **Content safety**: every Elementor tree is re-validated inside the plugin (widget whitelist,
  setting whitelist, repeater whitelist, URL scheme allow-list http(s)/relative/mailto/tel,
  no script/iframe/style in text-editor content). The SaaS is never trusted blindly.

## Browser-facing plugin UI

All admin actions require `manage_options` + `check_admin_referer` nonces. Diagnostics and audit
log pages escape all output. No credentials are rendered beyond a site-key prefix.

## Secrets handling (SaaS)

- HMAC secrets and MCP application passwords: AES-256-GCM (`SECRET_VAULT_KEY`), never returned by
  any API — only presence flags and key prefixes reach the client.
- AI provider keys: server-side env only; the z-ai SDK is imported exclusively in backend code.
- Audit log records auth events, pairing, diagnostics, page mutations, publishes with IP + meta.

## Credit enforcement (server-side only)

- Cost is computed server-side from page counts; the client never passes amounts.
- `reserve()` before job start (402 on shortfall) → `consume()` actual after confirmation →
  unused reserve refunded automatically; failures release in full. All entries idempotent via
  UNIQUE keys — retries and double-submits cannot double-charge.
- Concurrency: per-user in-process mutex; in Postgres production additionally wrap balance reads
  in `SELECT ... FOR UPDATE` inside the interactive transaction.

## MCP path

Application passwords are stored encrypted and used as HTTP Basic auth to the site's MCP
endpoint. Tool discovery is dynamic; operations require explicit operator mapping. The official
Elementor MCP is enabled per site by an admin (Elementor → Elementor MCP) — we never assume it is
on, and the UI walks through the documented enable flow first.

## Known hardening TODOs (documented honestly)

- In-memory rate limiter → swap for Redis limiter in multi-replica deployments (interface ready).
- Stripe webhook fulfillment route needs wiring before real charges (helper provided).
- Consider 2FA/TOTP for SaaS accounts and optional IP allow-list per site credential.
- PHP plugin files could not be linted in this sandbox (no PHP CLI) — run `php -l` in CI.

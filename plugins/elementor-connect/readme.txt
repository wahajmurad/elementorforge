=== ElementorForge Connect ===
Contributors: elementorforge
Tags: elementor, ai, saas, page builder, connector
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPL-2.0-or-later

Securely pair your WordPress site with the ElementorForge SaaS so an AI agent
can draft complete, fully editable, native Elementor pages for you.

== Description ==

ElementorForge Connect is the WordPress-side half of the ElementorForge SaaS:

* **Pairing** — exchange a one-time 30-minute pairing code for a site key +
  HMAC secret. All SaaS requests are signed (HMAC-SHA256 over
  method/path/body/timestamp) with a replay window and per-key rate limits.
* **Native Elementor pages** — the agent writes real Elementor containers and
  widgets into `_elementor_data` with all required meta (`_elementor_edit_mode`
  = builder, template type, version, page settings), then regenerates page CSS.
  No iframes, no custom-HTML dumps, no screenshots.
* **Drafts first** — everything arrives as a draft. Nothing is published
  without an explicit, confirmed publish request from the dashboard.
* **Rollback** — automatic pre-update snapshots per page (last 10).
* **Least privilege** — the connector only mutates pages it created
  (`_aelc_managed` flag). Your existing pages are out of reach.
* **Compatibility checks** — Elementor active/version, Elementor Pro
  presence AND license verification, container support. Pro widgets are only
  written when a valid Pro license is verified on your site.
* **Audit log** — every pairing change and page mutation is recorded with IP.
* **Clean uninstall** — removes nothing by default; content deletion requires
  explicit double opt-in and only ever touches managed drafts.

Elementor Pro is NOT bundled. Respect Elementor's licensing: Pro widgets
require your own valid Pro license on the connected site.

== Installation ==

1. Upload the `elementor-connect` folder to `/wp-content/plugins/` and activate.
2. Install/activate Elementor (free). Elementor Pro is optional and requires your license.
3. In your ElementorForge dashboard: Sites → Add site → Connector plugin → copy pairing code.
4. In wp-admin open **ElementorForge** → paste dashboard URL + pairing code → Pair site.

== Changelog ==

= 1.0.0 =
* Initial release: pairing, HMAC-signed REST API, native Elementor writer,
  snapshots/rollback, diagnostics, audit log, uninstall safeguards.

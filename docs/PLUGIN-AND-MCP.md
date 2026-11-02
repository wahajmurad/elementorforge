# Connector plugin & MCP integrations

Verified against public documentation as of 2026-11-01.

## 1. elementor-connect plugin (primary path — recommended)

**Version 1.0.0**, separately installable, `plugins/elementor-connect/`.

### Install & pair
1. Copy the folder to `wp-content/plugins/elementor-connect/`, activate.
2. Install + activate **Elementor (free ≥ 3.6)** on the site — generated pages need it to render.
   Elementor Pro is optional and requires the customer's own valid license (never bundled).
3. SaaS dashboard → Sites → Add site → **Connector plugin** → copy the pairing code.
4. wp-admin → **ElementorForge** → enter dashboard URL + code → *Pair site*.
   The plugin POSTs to `{SaaS}/api/hooks/pair` and stores the returned site key + HMAC secret.
   The code is single-use and expires in 30 minutes; re-issue anytime from the dashboard.

### What the plugin exposes (namespace `aelc/v1`, all HMAC-gated)
| Endpoint | Purpose |
| --- | --- |
| `GET /status` | Diagnostics: WP/PHP/HTTPS, Elementor active + version, Pro presence **and license verification**, container support |
| `POST /pages` | Create a draft page with full native Elementor data |
| `GET /pages/{id}` | Read back page + Elementor JSON + hash (verification) |
| `POST /pages/{id}/update` | Update (auto-snapshot first — last 10 kept) |
| `POST /pages/{id}/publish` | Publish a managed page |
| `POST /pages/{id}/snapshot` / `GET .../snapshots` / `POST .../restore` | Rollback points |
| `DELETE /pages/{id}` | Trash a managed **draft** only (published pages refused) |

### How pages are written correctly (the part most integrations get wrong)
The writer sets the **complete meta set**, not just `_elementor_data`:
`_elementor_edit_mode = builder` (without it Elementor ignores the page and renders a blank
template — a documented failure mode in third-party MCP servers), `_elementor_template_type`,
`_elementor_version`, `_elementor_data` (wp_slash'd JSON), `_elementor_page_settings`,
`_wp_page_template = elementor_header_footer`, then **regenerates the page CSS**
(`\Elementor\Core\Files\CSS\Post->update()`) and deletes the stale `_elementor_css` meta.

### Uninstall & data ownership
- Default uninstall: removes plugin options + audit table only. **No customer content touched.**
- Deleting connector-created pages requires two explicit opt-ins on the settings page, and even
  then only managed drafts (published pages are never deleted).
- Disconnecting removes credentials only.

## 2. Official Elementor MCP (alternative path)

Enabled **by the site admin, per site** — it is not on by default and must not be assumed:

1. On the customer site: **Elementor → Elementor MCP** → pick “Other MCP-compatible tool”.
2. Elementor creates the required **WordPress Application Password** and shows a connection
   prompt/config for that tool. (Access is admin-only; basic sections are free, Pro features need
   a valid Pro plan, advanced features may require Angie.)
3. In our dashboard: Add site → **Official Elementor MCP** → paste the site URL, MCP endpoint and
   WordPress username; then paste the Application Password in the site's settings (stored
   encrypted server-side; never exposed in the browser).
4. Run diagnostics: our adapter performs the MCP `initialize` handshake and `tools/list`, and
   shows every discovered tool. Map operations (`createPage`, `getPage`, `updatePage`,
   `publishPage`) to discovered tools via the JSON mapping editor — values like `$.title` pull
   fields from our payloads. **No tool names are hardcoded**, because the official tool set may
   change; builds refuse to proceed on unmapped operations rather than guessing.

## 3. Third-party MCP servers (generic)

Same flow as (2) with mode `mcp_third_party`: works with any HTTP/JSON-RPC MCP server that
authenticates via Basic or Bearer headers. Community Elementor MCP servers exist (e.g. npm
`elementor-mcp`, WordPress MCP plugins); quality varies — our validator still re-checks every
structure, and pages are marked built only after verified read-back.

## 4. Why the connector is the default

| | Connector plugin | Elementor MCP | Third-party MCP |
| --- | --- | --- | --- |
| Deterministic writes + full meta set | ✔ native | via mapped tools | via mapped tools |
| Snapshots/rollback | ✔ built-in | server-dependent | server-dependent |
| Draft + verify loop | ✔ first-class | partial (tool-dependent) | partial |
| Extra credentials | none beyond pairing | WP application password | varies |
| Setup effort | 2 minutes | medium (per-site enable) | varies |

import { SiteAdapter } from './types';
import { connectorAdapter, connectorConfigFrom } from './connector';
import { mcpAdapter } from './mcp';
import { simulatorAdapter } from './simulator';

/**
 * Adapter factory — the single place that decides how a Site row talks to
 * WordPress. Pipeline code only ever depends on SiteAdapter.
 */
export interface AdapterSite {
  url: string;
  mode: string;
  mcpConfig: string;
  credentials: { siteKey: string; hmacSecret: string; transportToken: string | null } | null;
}

export function getSiteAdapter(site: AdapterSite): SiteAdapter {
  if (!site.credentials) throw new Error('Site is not paired (no credentials)');
  switch (site.mode) {
    case 'elementor_mcp':
    case 'mcp_third_party':
      return mcpAdapter({ mcpConfig: site.mcpConfig }, { transportToken: site.credentials.transportToken });
    case 'simulated':
      return simulatorAdapter(site.credentials.siteKey, site.credentials.hmacSecret);
    case 'connector':
    default:
      return connectorAdapter(connectorConfigFrom({ url: site.url }, {
        siteKey: site.credentials.siteKey,
        hmacSecret: site.credentials.hmacSecret,
      }));
  }
}

export function isSimulated(site: { mode: string }): boolean {
  return site.mode === 'simulated';
}

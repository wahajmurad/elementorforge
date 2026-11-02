/** Minimal HTML escaping for renderer output (node:util has no escapeHtml). */
const MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => MAP[c]);
}

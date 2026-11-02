/** Hash navigation helper (assign() avoids direct property writes). */
export function navigateTo(view: string, param?: string): void {
  window.location.assign(`#/${view}${param ? `/${param}` : ''}`);
}

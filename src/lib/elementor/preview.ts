import { escapeHtml } from '@/lib/htmlutil';

/**
 * Preview renderer: approximates how a native Elementor container/widget
 * tree will look, directly from the _elementor_data JSON. This is ONLY for
 * the dashboard preview panel — real rendering always happens in WordPress.
 */

interface ElNode {
  id: string;
  elType: 'container' | 'widget';
  settings: Record<string, unknown>;
  elements: ElNode[];
  widgetType?: string;
}

function esc(v: unknown): string { return escapeHtml(String(v ?? '')); }

function get(n: ElNode, key: string): unknown { return n.settings?.[key]; }
function str(n: ElNode, key: string): string { const v = get(n, key); return typeof v === 'string' ? v : ''; }
function num(n: ElNode, key: string, fallback = 0): number { const v = get(n, key); return typeof v === 'number' ? v : parseFloat(String(v)) || fallback; }
function color(n: ElNode, key: string): string { const v = get(n, key); return typeof v === 'string' && v ? v : ''; }

function dimSize(v: unknown, fallback?: number | string): string | null {
  if (!v || typeof v !== 'object') {
    if (typeof v === 'number') return `${v}px`;
    if (fallback !== undefined) return typeof fallback === 'number' ? `${fallback}px` : fallback;
    return null;
  }
  const o = v as Record<string, unknown>;
  const size = typeof o.size === 'number' ? o.size : parseFloat(String(o.size));
  if (Number.isNaN(size)) return fallback ? `${fallback}px` : null;
  return `${size}${o.unit === '%' ? '%' : o.unit || 'px'}`;
}

function boxStyle(n: ElNode): string {
  const s: string[] = [];
  const dir = str(n, 'flex_direction') || 'column';
  s.push(`display:flex`, `flex-direction:${dir}`);
  if (get(n, 'flex_wrap')) s.push(`flex-wrap:${str(n, 'flex_wrap')}`);
  if (get(n, 'justify_content')) s.push(`justify-content:${str(n, 'flex_direction') === 'column' ? 'flex-start' : str(n, 'justify_content')}`);
  if (get(n, 'align_items')) s.push(`align-items:${str(n, 'align_items')}`);
  const gap = get(n, 'flex_gap') ?? get(n, 'flex_gap_mobile');
  const gapCss = dimSize(gap);
  if (gapCss) s.push(`gap:${gapCss}`);
  if (str(n, 'content_width') === 'boxed') s.push(`max-width:1140px`, `margin:0 auto`, `width:100%`);
  const pad = get(n, 'padding') as Record<string, unknown> | undefined;
  if (pad && typeof pad === 'object') s.push(`padding:${pad.top ?? 0}px ${pad.right ?? 0}px ${pad.bottom ?? 0}px ${pad.left ?? 0}px`);
  const mar = get(n, 'margin') as Record<string, unknown> | undefined;
  if (mar && typeof mar === 'object') s.push(`margin-top:${mar.top ?? 0}px;margin-bottom:${mar.bottom ?? 0}px`);
  const bg = str(n, 'background_background');
  if (bg === 'classic' && color(n, 'background_color')) s.push(`background:${color(n, 'background_color')}`);
  if (bg === 'gradient') s.push(`background:linear-gradient(${num(n, 'background_gradient_angle', 135)}deg, ${color(n, 'background_color') || '#222'}, ${color(n, 'background_color_b') || '#111'})`);
  const radius = dimSize(get(n, 'border_radius'));
  if (radius) s.push(`border-radius:${radius}`);
  if (str(n, 'border_border')) {
    const bw = get(n, 'border_width') as Record<string, unknown> | undefined;
    s.push(`border:${bw?.top ?? 1}px ${str(n, 'border_border')} ${color(n, 'border_color') || '#ddd'}`);
  }
  if (get(n, 'min_height')) { const mh = dimSize(get(n, 'min_height')); if (mh) s.push(`min-height:${mh}`); }
  const width = get(n, 'width') ? dimSize(get(n, 'width')) : null;
  if (width) s.push(`flex:0 0 ${width};max-width:${width}`);
  return s.join(';');
}

function typoStyle(n: ElNode, prefix = 'typography'): string {
  const s: string[] = [];
  if (get(n, `${prefix}_font_family`)) s.push(`font-family:'${str(n, `${prefix}_font_family`)}',sans-serif`);
  const fs = dimSize(get(n, `${prefix}_font_size`));
  if (fs) s.push(`font-size:${fs}`);
  if (get(n, `${prefix}_font_weight`)) s.push(`font-weight:${str(n, `${prefix}_font_weight`)}`);
  if (get(n, `${prefix}_text_transform`)) s.push(`text-transform:${str(n, `${prefix}_text_transform`)}`);
  const lh = dimSize(get(n, `${prefix}_line_height`));
  if (lh) s.push(`line-height:${lh}`);
  return s.join(';');
}

function widgetHtml(n: ElNode): string {
  const t = n.widgetType;
  switch (t) {
    case 'heading': {
      const tag = /^(h[1-6]|div|span|p)$/i.test(str(n, 'header_size')) ? str(n, 'header_size') : 'h2';
      const align = str(n, 'align') ? `text-align:${str(n, 'align')};` : '';
      return `<${tag} style="${align}color:${color(n, 'title_color') || 'inherit'};margin:0;${typoStyle(n)}">${esc(str(n, 'title'))}</${tag}>`;
    }
    case 'text-editor': {
      const align = str(n, 'align') ? `text-align:${str(n, 'align')};` : '';
      return `<div style="${align}color:${color(n, 'text_color') || 'inherit'};${typoStyle(n)}">${str(n, 'editor')}</div>`;
    }
    case 'animated-headline': {
      return `<h2 style="margin:0;${typoStyle(n)}">${esc(str(n, 'before_text'))} <span style="color:${color(n, 'highlighted_color') || '#F59E0B'}">${esc(str(n, 'highlighted_text'))}</span> ${esc(str(n, 'after_text'))}</h2>`;
    }
    case 'image': {
      const img = get(n, 'image') as Record<string, unknown> | null;
      const url = typeof img?.url === 'string' ? img.url : '';
      if (!url) return '';
      const w = dimSize(get(n, 'width'), undefined);
      return `<img src="${esc(url)}" alt="${esc(img?.alt ?? '')}" style="width:${w ?? '100%'};height:auto;border-radius:${dimSize(get(n, 'border_radius'), 0)};display:${str(n, 'align') === 'center' ? 'block;margin:0 auto' : 'block'};object-fit:${str(n, 'object_fit') || 'cover'}" />`;
    }
    case 'button': {
      const lnk = get(n, 'link') as Record<string, unknown> | null;
      const url = typeof lnk?.url === 'string' ? lnk.url : '#';
      const bg = color(n, 'background_color');
      const outline = str(n, 'border_border') === 'solid';
      return `<a href="${esc(url)}" style="display:inline-block;padding:14px 30px;border-radius:${dimSize(get(n, 'border_radius'), 999)};background:${outline ? 'transparent' : bg || '#0F766E'};color:${color(n, 'button_text_color') || '#fff'};${outline ? `border:2px solid ${bg || '#fff'}` : ''};text-decoration:none;font-weight:600;${typoStyle(n)}">${esc(str(n, 'text'))}</a>`;
    }
    case 'icon-list': {
      const items = (get(n, 'icon_list') as Record<string, unknown>[] | undefined) ?? [];
      const inline = str(n, 'view') === 'inline';
      const lis = items.map(it => {
        const l = it.link as Record<string, unknown> | undefined;
        return `<li style="list-style:none;display:flex;align-items:center;gap:8px;margin:${inline ? '0' : '0 0 8px'}"><span style="color:${color(n, 'icon_color') || '#0F766E'};font-size:${dimSize(get(n, 'icon_size'), 14)}">✓</span><span style="color:${color(n, 'text_color') || 'inherit'}">${l?.url ? `<a href="${esc(String(l.url))}" style="color:inherit;text-decoration:none">${esc(String(it.text))}</a>` : esc(String(it.text))}</span></li>`;
      }).join('');
      return `<ul style="margin:0;padding:0;${inline ? 'display:flex;flex-wrap:wrap;gap:18px' : ''}">${lis}</ul>`;
    }
    case 'image-box': {
      const img = get(n, 'image') as Record<string, unknown> | null;
      return `<div style="text-align:center"><img src="${esc(String(img?.url ?? ''))}" alt="${esc(String(img?.alt ?? ''))}" style="max-width:100%;border-radius:12px" /><h3 style="margin:12px 0 6px;color:${color(n, 'title_color') || 'inherit'}">${esc(str(n, 'title_text'))}</h3><p style="margin:0;color:${color(n, 'description_color') || 'inherit'}">${esc(str(n, 'description_text'))}</p></div>`;
    }
    case 'icon': {
      const ic = get(n, 'selected_icon') as Record<string, unknown> | null;
      const label = String(ic?.value ?? '').replace(/^fa[bsr]-\s*/, '').replace(/^fa-/, '').split('-').join(' ');
      return `<div style="text-align:${str(n, 'align') || 'left'}"><span style="display:inline-flex;width:52px;height:52px;border-radius:50%;background:${color(n, 'primary_color') || '#eee'};color:${color(n, 'secondary_color') || '#333'};align-items:center;justify-content:center;font-size:${dimSize(get(n, 'size'), 22)};text-transform:uppercase">${esc(label.slice(0, 2))}</span></div>`;
    }
    case 'divider': return `<hr style="border:0;border-top:${num(n, 'weight', 1)}px ${str(n, 'style') || 'solid'} ${color(n, 'color') || '#ddd'};margin:0" />`;
    case 'spacer': { const h = dimSize(get(n, 'space')); return `<div style="height:${h ?? '20px'}"></div>`; }
    case 'video': {
      const type = str(n, 'video_type') || 'youtube';
      const src = type === 'youtube'
        ? `https://www.youtube.com/embed/${esc(String(get(n, 'youtube') ?? '').split(/[/=]/).pop() ?? '')}`
        : type === 'vimeo' ? `https://player.vimeo.com/video/${esc(String(get(n, 'vimeo') ?? ''))}` : '';
      return src ? `<div style="aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden"><iframe src="${src}" style="width:100%;height:100%;border:0" allowfullscreen></iframe></div>` : '';
    }
    case 'google_maps': {
      const addr = encodeURIComponent(str(n, 'address') || 'New York');
      return `<iframe src="https://maps.google.com/maps?q=${addr}&z=${num(n, 'zoom', 14)}&output=embed" style="width:100%;height:${dimSize(get(n, 'height'), '420px')};border:0;border-radius:12px" loading="lazy"></iframe>`;
    }
    case 'tabs':
    case 'accordion':
    case 'toggle': {
      const tabs = (get(n, 'tabs') as Record<string, unknown>[] | undefined) ?? [];
      if (t === 'accordion' || t === 'toggle') {
        return tabs.map(tb => `<details style="border:1px solid ${color(n, 'border_color') || '#e2e8f0'};border-radius:10px;margin-bottom:10px;padding:12px 16px"><summary style="cursor:pointer;font-weight:600;color:${color(n, 'title_color') || 'inherit'}">${esc(String(tb.tab_title))}</summary><div style="padding-top:8px">${String(tb.tab_content ?? '')}</div></details>`).join('');
      }
      const titles = tabs.map((tb, i) => `<button style="padding:10px 18px;border:0;background:${i === 0 ? color(n, 'tab_active_color') || '#0F766E' : 'transparent'};color:${i === 0 ? '#fff' : color(n, 'tab_color') || 'inherit'};border-radius:8px;cursor:pointer">${esc(String(tb.tab_title))}</button>`).join('');
      return `<div style="display:flex;gap:8px;margin-bottom:16px">${titles}</div><div>${String(tabs[0]?.tab_content ?? '')}</div>`;
    }
    case 'testimonial': {
      const img = get(n, 'testimonial_image') as Record<string, unknown> | null;
      return `<div style="display:flex;gap:14px;align-items:flex-start"><div style="flex:1"><p style="margin:0 0 10px;color:${color(n, 'content_content_color') || 'inherit'}">“${esc(str(n, 'testimonial_content'))}”</p><strong style="color:${color(n, 'name_text_color') || 'inherit'}">${esc(str(n, 'testimonial_name'))}</strong><div style="font-size:13px;color:${color(n, 'job_text_color') || '#888'}">${esc(str(n, 'testimonial_job'))}</div></div>${img?.url ? `<img src="${esc(String(img.url))}" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover" />` : ''}</div>`;
    }
    case 'counter': return `<div style="text-align:center"><div style="font-size:${dimSize(get(n, 'typography_font_size'), '40px')};font-weight:700;color:${color(n, 'number_color') || 'inherit'}">${esc(String(get(n, 'prefix') ?? ''))}${num(n, 'ending_number', 0)}${esc(String(get(n, 'suffix') ?? ''))}</div><div style="color:${color(n, 'title_color') || '#888'}">${esc(str(n, 'title'))}</div></div>`;
    case 'progress': return `<div><div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>${esc(str(n, 'title'))}</span><span>${num(n, 'percent', 0)}%</span></div><div style="background:${color(n, 'bar_bg_color') || '#eee'};border-radius:99px;height:10px"><div style="width:${num(n, 'percent', 0)}%;background:${color(n, 'bar_color') || '#0F766E'};height:10px;border-radius:99px"></div></div></div>`;
    case 'star-rating': {
      const scale = num(n, 'rating_scale', 5), rating = num(n, 'rating', 5);
      return `<div style="color:${color(n, 'star_color') || '#F59E0B'};text-align:${str(n, 'align') || 'left'}">${'■'.repeat(Math.round(rating))}<span style="color:${color(n, 'unmarked_star_color') || '#ddd'}">${'■'.repeat(Math.max(0, scale - Math.round(rating)))}</span></div>`;
    }
    case 'social-icons': {
      const list = (get(n, 'social_icon_list') as Record<string, unknown>[] | undefined) ?? [];
      return `<div style="display:flex;gap:10px;${str(n, 'align') === 'center' ? 'justify-content:center' : ''}">${list.map(it => {
        const l = it.link as Record<string, unknown> | undefined;
        const ic = it.social_icon as Record<string, unknown> | undefined;
        const name = String(ic?.value ?? '').replace(/^fa[bsr]-/, '').replace(/^fa-/, '');
        return `<a href="${esc(String(l?.url ?? '#'))}" style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.12);color:inherit;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;text-transform:uppercase;font-size:12px;font-weight:700">${esc(name.slice(0, 2))}</a>`;
      }).join('')}</div>`;
    }
    case 'form': {
      const fields = (get(n, 'form_fields') as Record<string, unknown>[] | undefined) ?? [];
      return `<div><form onsubmit="return false">${fields.map(f => {
        const ft = String(f.field_type ?? 'text');
        const ph = esc(String(f.placeholder ?? f.field_label ?? ''));
        const req = f.required === 'yes';
        const w = String(f.width ?? '100');
        if (ft === 'textarea') return `<textarea placeholder="${ph}" style="width:${w}%;min-height:110px;margin-bottom:10px;padding:12px;border:1px solid #d5dce5;border-radius:8px;font:inherit"></textarea>`;
        if (ft === 'select') return `<select style="width:${w}%;margin-bottom:10px;padding:12px;border:1px solid #d5dce5;border-radius:8px;font:inherit"></select>`;
        const type = ft === 'email' ? 'email' : ft === 'tel' ? 'tel' : ft === 'number' ? 'number' : 'text';
        return `<input type="${type}" placeholder="${ph}" ${req ? 'required' : ''} style="width:${w}%;margin-bottom:10px;padding:12px;border:1px solid #d5dce5;border-radius:8px;font:inherit" />`;
      }).join('')}<button style="padding:13px 28px;border:0;border-radius:8px;background:${color(n, 'button_background_color') || '#0F766E'};color:${color(n, 'button_text_color') || '#fff'};font-weight:600;cursor:pointer">${esc(str(n, 'button_text') || 'Submit')}</button></form></div>`;
    }
    case 'search-form': return `<form onsubmit="return false" style="display:flex;gap:8px"><input placeholder="${esc(str(n, 'placeholder') || 'Search...')}" style="flex:1;padding:12px;border:1px solid #d5dce5;border-radius:8px;font:inherit" /><button style="padding:12px 20px;border:0;border-radius:8px;background:#0F766E;color:#fff">${esc(str(n, 'button_text') || 'Search')}</button></form>`;
    case 'nav-menu': return `<nav style="display:flex;gap:22px;align-items:center">${esc(str(n, 'menu') || 'Menu')}</nav>`;
    case 'theme-site-logo': case 'theme-page-title': case 'theme-post-title': case 'theme-post-excerpt': case 'theme-post-content': {
      const labels: Record<string, string> = {
        'theme-site-logo': 'Site Logo', 'theme-page-title': 'Page Title',
        'theme-post-title': 'Post Title', 'theme-post-excerpt': 'Post Excerpt', 'theme-post-content': 'Post Content',
      };
      return `<div style="opacity:.75;border:1px dashed rgba(128,128,128,.5);padding:10px 14px;border-radius:8px;text-align:${str(n, 'align') || 'left'}">⬡ ${labels[t ?? ''] ?? 'Theme Widget'} (dynamic)</div>`;
    }
    case 'pricing-table': {
      const feats = (get(n, 'features_list') as Record<string, unknown>[] | undefined) ?? [];
      return `<div style="border:1px solid #e2e8f0;border-radius:14px;padding:22px"><h3 style="margin:0 0 4px">${esc(str(n, 'heading'))}</h3><div style="font-size:34px;font-weight:700;margin:8px 0">${esc(str(n, 'currency_symbol'))}${esc(str(n, 'price'))}<span style="font-size:14px;color:#888"> ${esc(str(n, 'period'))}</span></div><ul style="padding:0;margin:0 0 16px;list-style:none">${feats.map(f => `<li style="margin:6px 0">✓ ${esc(String(f.item_text))}</li>`).join('')}</ul><a href="#" style="display:block;text-align:center;padding:12px;border-radius:8px;background:#0F766E;color:#fff;text-decoration:none;font-weight:600">${esc(str(n, 'button_text'))}</a></div>`;
    }
    default:
      return `<div style="opacity:.6;border:1px dashed rgba(128,128,128,.5);padding:10px;border-radius:8px">Widget: ${esc(t)}</div>`;
  }
}

function nodeHtml(n: ElNode): string {
  if (n.elType === 'container') {
    const responsive = n.settings?.flex_direction === 'row'
      ? `@media(max-width:767px){.el-${n.id}{flex-direction:${esc(String(n.settings?.flex_direction_mobile ?? 'column'))}!important}}` : '';
    const wrap = n.settings?.flex_direction === 'row'
      ? `<style>${responsive}.el-${n.id}>*{min-width:0}</style>` : '';
    return `<div class="el-${n.id}" style="${boxStyle(n)}">${wrap}${n.elements.map(nodeHtml).join('')}</div>`;
  }
  return widgetHtml(n);
}

export function renderPreview(tree: unknown, title: string, fonts?: { heading?: string; body?: string }): string {
  const nodes = Array.isArray(tree) ? (tree as ElNode[]) : [];
  const headingFont = fonts?.heading ?? 'Poppins';
  const bodyFont = fonts?.body ?? 'Inter';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(headingFont)}:wght@400;500;600;700;800&family=${encodeURIComponent(bodyFont)}:wght@400;500;600&display=swap" rel="stylesheet">
<style>html,body{margin:0;padding:0}body{font-family:'${bodyFont}',system-ui,sans-serif;color:#0f172a;background:#fff}
img{max-width:100%}h1,h2,h3,h4{font-family:'${headingFont}',sans-serif}a{color:inherit}</style>
</head><body>${nodes.map(nodeHtml).join('')}</body></html>`;
}

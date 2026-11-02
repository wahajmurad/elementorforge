import { randomBytes } from 'crypto';
import { DesignSystem, PageSpec, PageBlock, DEFAULT_DESIGN } from './design';

/**
 * Compiler: semantic page spec → native Elementor JSON (_elementor_data).
 * Deterministic, validated by construction, containers-only (no legacy
 * sections/columns), free widgets by default, Pro widgets only when the
 * target site has a verified Pro license.
 */

let counter = 0;
export function elementId(): string {
  counter = (counter + 1) % 0xffff;
  return (randomBytes(3).toString('hex') + counter.toString(16)).slice(0, 7);
}

// ---- low-level builders ----------------------------------------------------

type Settings = Record<string, unknown>;

interface ElNode {
  id: string;
  elType: 'container' | 'widget';
  settings: Settings;
  elements: ElNode[];
  isInner?: boolean;
  widgetType?: string;
}

function box(settings: Settings, elements: ElNode[], isInner = false): ElNode {
  return { id: elementId(), elType: 'container', settings, elements, isInner };
}
function widget(widgetType: string, settings: Settings = {}): ElNode {
  return { id: elementId(), elType: 'widget', settings, elements: [], widgetType };
}

function dim(size: number, unit = 'px') {
  return { unit, size, sizes: [] };
}
function spacing(top: number, right: number, bottom: number, left: number) {
  return { unit: 'px', top: String(top), right: String(right), bottom: String(bottom), left: String(left), isLinked: false };
}
function link(url: string) {
  if (!url) return undefined;
  const isExternal = /^https?:\/\//i.test(url) ? 'yes' : '';
  return { url, is_external: isExternal, nofollow: '', custom_attributes: '' };
}
function heading(text: string, s: { tag?: string; color?: string; align?: string; size?: number; family?: string; weight?: string; lineHeight?: number; spacing?: number } = {}) {
  const settings: Settings = { title: text, header_size: s.tag ?? 'h2', align: s.align };
  if (s.color) settings.title_color = s.color;
  settings.typography_typography = 'custom';
  if (s.family) settings.typography_font_family = s.family;
  if (s.size) { settings.typography_font_size = dim(s.size); settings.typography_font_size_mobile = dim(Math.max(16, Math.round(s.size * 0.62))); }
  if (s.weight) settings.typography_font_weight = s.weight;
  if (s.lineHeight) settings.typography_line_height = { unit: 'em', size: s.lineHeight, sizes: [] };
  if (s.spacing) settings.typography_letter_spacing = { unit: 'px', size: s.spacing, sizes: [] };
  return widget('heading', settings);
}
function text(html: string, s: { color?: string; align?: string; size?: number; family?: string; lineHeight?: number } = {}) {
  const alignStyle = s.align && s.align !== 'left' ? ` style="text-align:${s.align}"` : '';
  const settings: Settings = {
    editor: `<p${alignStyle}>${html}</p>`,
    text_color: s.color,
    typography_typography: 'custom',
  };
  if (s.family) settings.typography_font_family = s.family;
  if (s.size) { settings.typography_font_size = dim(s.size); settings.typography_font_size_mobile = dim(Math.max(14, s.size)); }
  if (s.lineHeight) settings.typography_line_height = { unit: 'em', size: s.lineHeight, sizes: [] };
  return widget('text-editor', settings);
}
function button(label: string, url: string, s: { bg?: string; color?: string; radius?: number; align?: string; size?: string; outline?: boolean; family?: string } = {}) {
  const settings: Settings = {
    text: label,
    link: link(url) ?? { url: '#', is_external: '', nofollow: '', custom_attributes: '' },
    align: s.align ?? 'left',
    size: s.size ?? 'md',
    button_text_color: s.color,
    background_color: s.outline ? 'rgba(0,0,0,0)' : s.bg,
    border_border: s.outline ? 'solid' : undefined,
    border_width: s.outline ? spacing(2, 2, 2, 2) : undefined,
    border_color: s.outline ? s.bg : undefined,
    border_radius: dim(s.radius ?? 999),
    typography_typography: 'custom',
    typography_font_family: s.family,
    typography_font_weight: '600',
  };
  return widget('button', settings);
}
function icon(name: string, s: { color?: string; size?: number; align?: string; view?: string; shape?: string; bg?: string } = {}) {
  return widget('icon', {
    selected_icon: { value: name, library: 'fa-solid' },
    view: s.view ?? 'stacked',
    shape: s.shape ?? 'circle',
    primary_color: s.bg,
    secondary_color: s.color,
    size: dim(s.size ?? 28),
    align: s.align,
  });
}
function iconList(items: { text: string; url?: string }[], s: { iconColor?: string; textColor?: string; inline?: boolean; size?: number } = {}) {
  return widget('icon-list', {
    icon_list: items.map(i => ({
      text: i.text,
      selected_icon: { value: 'fas fa-check', library: 'fa-solid' },
      link: i.url ? link(i.url) : undefined,
      _id: elementId(),
    })),
    view: s.inline ? 'inline' : 'traditional',
    icon_color: s.iconColor,
    text_color: s.textColor,
    icon_size: dim(s.size ?? 14),
    space_between: dim(s.inline ? 24 : 12),
  });
}

// ---- section scaffolding ---------------------------------------------------

interface Ctx { ds: DesignSystem; allowPro: boolean; }

function bgFor(variant: PageBlock['background'] | undefined, ctx: Ctx): Settings {
  const c = ctx.ds.colors;
  switch (variant) {
    case 'dark':
      return { background_background: 'classic', background_color: c.dark };
    case 'primary':
      return { background_background: 'classic', background_color: c.primary };
    case 'surface':
      return { background_background: 'classic', background_color: c.surface };
    case 'light':
      return { background_background: 'classic', background_color: c.light };
    case 'gradient':
      return {
        background_background: 'gradient',
        background_color: c.primary,
        background_color_b: c.secondary,
        background_gradient_type: 'linear',
        background_gradient_angle: { unit: 'deg', size: 135, sizes: [] },
      };
    default:
      return { background_background: 'classic', background_color: c.bg };
  }
}

const PAD_Y = (ctx: Ctx, m = 1) => spacing(ctx.ds.sectionSpacing * m, 24, ctx.ds.sectionSpacing * m, 24);

// ---- block compilers --------------------------------------------------------

function compileHero(b: Extract<PageBlock, { type: 'hero' }>, ctx: Ctx): ElNode {
  const c = ctx.ds.colors;
  const onDark = b.background === 'dark' || b.background === 'primary' || b.background === 'gradient' || b.background === 'image';
  const fg = onDark ? c.white : c.text;
  const muted = onDark ? 'rgba(255,255,255,0.78)' : c.muted;

  const left: ElNode[] = [];
  if (b.badge) {
    left.push(widget('heading', {
      title: b.badge, header_size: 'div', align: 'left',
      title_color: onDark ? c.accent : c.primary,
      typography_typography: 'custom', typography_font_family: ctx.ds.fonts.body,
      typography_font_weight: '600', typography_font_size: dim(13),
      typography_text_transform: 'uppercase', typography_letter_spacing: dim(1.5),
    }));
  }
  left.push(heading(b.highlight ? b.headline.replace(b.highlight, '') + '' : b.headline, {
    tag: 'h1', color: fg, align: 'left', size: 52, family: ctx.ds.fonts.heading, weight: '700', lineHeight: 1.12,
  }));
  if (b.highlight) {
    // Replace with animated-headline free widget for the highlight part
    left[left.length - 1] = widget('animated-headline', {
      headline_style: 'highlighted_text',
      before_text: b.headline.split(b.highlight)[0] ?? '',
      highlighted_text: b.highlight,
      after_text: b.headline.split(b.highlight)[1] ?? '',
      highlighted_typography: { value: 'circle', library: '' },
      align: 'left',
      headline_typography_typography: 'custom',
      headline_typography_font_family: ctx.ds.fonts.heading,
      headline_typography_font_size: dim(52),
      headline_typography_font_size_mobile: dim(32),
      headline_typography_font_weight: '700',
      highlighted_color: onDark ? c.accent : c.primary,
      after_text_color: fg,
    });
  }
  if (b.subhead) left.push(text(b.subhead, { color: muted, size: 18, family: ctx.ds.fonts.body, lineHeight: 1.7 }));
  const btns: ElNode[] = [];
  if (b.primaryCta) btns.push(button(b.primaryCta.label, b.primaryCta.url, { bg: onDark ? c.accent : c.primary, color: onDark ? c.dark : c.white, align: 'left', family: ctx.ds.fonts.body }));
  if (b.secondaryCta) btns.push(button(b.secondaryCta.label, b.secondaryCta.url, { bg: fg, align: 'left', outline: true, color: fg, family: ctx.ds.fonts.body }));
  if (btns.length) left.push(box({ flex_direction: 'row', flex_gap: dim(16), flex_wrap: 'wrap', width: { unit: '%', size: 100, sizes: [] } }, btns, true));
  if (b.bullets?.length) left.push(iconList(b.bullets.map(t => ({ text: t })), { iconColor: onDark ? c.accent : c.primary, textColor: muted }));

  const contentColumn = box({ flex_direction: 'column', flex_gap: dim(22), width: { unit: '%', size: 52, sizes: [] }, width_mobile: { unit: '%', size: 100, sizes: [] } }, left, true);

  const children: ElNode[] = [contentColumn];
  if (b.imageUrl) {
    children.push(widget('image', {
      image: { url: b.imageUrl, id: '', alt: b.headline, source: 'library' },
      image_size: 'full',
      width: { unit: '%', size: 44, sizes: [] },
      width_mobile: { unit: '%', size: 100, sizes: [] },
      border_radius: dim(ctx.ds.radius + 6),
    }));
  }

  return box({
    content_width: 'boxed',
    flex_direction: 'row',
    align_items: 'center',
    flex_gap: dim(48),
    flex_gap_mobile: dim(28),
    padding: PAD_Y(ctx, 1.15),
    ...bgFor(b.background === 'image' ? 'gradient' : b.background, ctx),
  }, children);
}

function compileFeatures(b: Extract<PageBlock, { type: 'features' }>, ctx: Ctx): ElNode {
  const c = ctx.ds.colors;
  const onDark = b.background === 'dark' || b.background === 'primary' || b.background === 'gradient';
  const fg = onDark ? c.white : c.text;
  const muted = onDark ? 'rgba(255,255,255,0.75)' : c.muted;
  const head: ElNode[] = [];
  if (b.title) head.push(heading(b.title, { tag: 'h2', color: fg, align: 'center', size: 34, family: ctx.ds.fonts.heading, weight: '700' }));
  if (b.subhead) head.push(text(b.subhead, { color: muted, align: 'center', size: 17, family: ctx.ds.fonts.body }));

  const cols = b.columns ?? 3;
  const colWidth = cols === 2 ? 48 : cols === 4 ? 23.5 : 31.5;
  const cards = b.items.map(item => box({
    flex_direction: 'column',
    flex_gap: dim(14),
    padding: spacing(28, 24, 28, 24),
    width: { unit: '%', size: colWidth, sizes: [] },
    width_tablet: { unit: '%', size: 47, sizes: [] },
    width_mobile: { unit: '%', size: 100, sizes: [] },
    background_background: 'classic',
    background_color: onDark ? 'rgba(255,255,255,0.06)' : c.surface,
    border_radius: dim(ctx.ds.radius),
  }, [
    icon(item.icon || 'fas fa-star', { color: onDark ? c.accent : c.primary, bg: onDark ? 'rgba(255,255,255,0.12)' : c.light, size: 24 }),
    heading(item.title, { tag: 'h3', color: fg, size: 19, family: ctx.ds.fonts.heading, weight: '600' }),
    text(item.text, { color: muted, size: 15, family: ctx.ds.fonts.body, lineHeight: 1.65 }),
  ], true));

  return box({
    content_width: 'boxed', flex_direction: 'column', flex_gap: dim(36),
    padding: PAD_Y(ctx), ...bgFor(b.background, ctx),
  }, [...head, box({ flex_direction: 'row', flex_wrap: 'wrap', flex_gap: dim(20), justify_content: 'center' }, cards, true)]);
}

function compileAbout(b: Extract<PageBlock, { type: 'about' }>, ctx: Ctx): ElNode {
  const c = ctx.ds.colors;
  const onDark = b.background === 'dark' || b.background === 'primary' || b.background === 'gradient';
  const fg = onDark ? c.white : c.text;
  const muted = onDark ? 'rgba(255,255,255,0.75)' : c.muted;
  const colText: ElNode[] = [
    heading(b.title, { tag: 'h2', color: fg, size: 32, family: ctx.ds.fonts.heading, weight: '700' }),
    text(b.body, { color: muted, size: 16.5, family: ctx.ds.fonts.body, lineHeight: 1.8 }),
  ];
  if (b.bullets?.length) colText.push(iconList(b.bullets.map(t => ({ text: t })), { iconColor: onDark ? c.accent : c.primary, textColor: muted }));
  const children: ElNode[] = [];
  if (b.imageUrl && b.imageSide !== 'right') {
    children.push(widget('image', { image: { url: b.imageUrl, id: '', alt: b.title, source: 'library' }, image_size: 'full', width: { unit: '%', size: 44, sizes: [] }, width_mobile: { unit: '%', size: 100, sizes: [] }, border_radius: dim(ctx.ds.radius) }));
  }
  children.push(box({ flex_direction: 'column', flex_gap: dim(18), width: { unit: '%', size: b.imageUrl ? 52 : 100, sizes: [] }, width_mobile: { unit: '%', size: 100, sizes: [] } }, colText, true));
  if (b.imageUrl && b.imageSide === 'right') {
    children.push(widget('image', { image: { url: b.imageUrl, id: '', alt: b.title, source: 'library' }, image_size: 'full', width: { unit: '%', size: 44, sizes: [] }, width_mobile: { unit: '%', size: 100, sizes: [] }, border_radius: dim(ctx.ds.radius) }));
  }
  return box({ content_width: 'boxed', flex_direction: 'row', align_items: 'center', flex_gap: dim(48), flex_gap_mobile: dim(28), padding: PAD_Y(ctx), ...bgFor(b.background, ctx) }, children);
}

function compileStats(b: Extract<PageBlock, { type: 'stats' }>, ctx: Ctx): ElNode {
  const c = ctx.ds.colors;
  const onDark = b.background === 'dark' || b.background === 'primary' || b.background === 'gradient';
  const cells = b.items.map(s => box({
    flex_direction: 'column', flex_gap: dim(6), align_items: 'center',
    width: { unit: '%', size: 100 / Math.max(1, Math.min(4, b.items.length)), sizes: [] },
    width_mobile: { unit: '%', size: 50, sizes: [] },
  }, [
    widget('counter', {
      starting_number: 0, ending_number: s.value, suffix: s.suffix ?? '', duration: 1800,
      thousand_separator: 'yes', number_color: onDark ? c.accent : c.primary,
      typography_typography: 'custom', typography_font_family: ctx.ds.fonts.heading, typography_font_size: dim(40), typography_font_weight: '700',
    }),
    heading(s.label, { tag: 'div', color: onDark ? 'rgba(255,255,255,0.8)' : c.muted, align: 'center', size: 14, family: ctx.ds.fonts.body, weight: '500' }),
  ], true));
  return box({ content_width: 'boxed', flex_direction: 'row', flex_wrap: 'wrap', flex_gap: dim(24), padding: spacing(48, 24, 48, 24), ...bgFor(b.background, ctx) }, cells);
}

function compileTestimonials(b: Extract<PageBlock, { type: 'testimonials' }>, ctx: Ctx): ElNode {
  const c = ctx.ds.colors;
  const onDark = b.background === 'dark' || b.background === 'primary' || b.background === 'gradient';
  const fg = onDark ? c.white : c.text;
  const head: ElNode[] = [];
  if (b.title) head.push(heading(b.title, { tag: 'h2', color: fg, align: 'center', size: 34, family: ctx.ds.fonts.heading, weight: '700' }));
  const cards = b.items.map(t => widget('testimonial', {
    testimonial_content: t.quote,
    testimonial_name: t.name,
    testimonial_job: t.role ?? '',
    testimonial_image_position: 'aside',
    content_content_color: onDark ? 'rgba(255,255,255,0.85)' : c.text,
    name_text_color: fg,
    job_text_color: onDark ? 'rgba(255,255,255,0.6)' : c.muted,
  }));
  const grid = box({ flex_direction: 'row', flex_wrap: 'wrap', flex_gap: dim(24) },
    cards.map(c2 => box({
      flex_direction: 'column', width: { unit: '%', size: b.items.length >= 3 ? 31.5 : 48, sizes: [] },
      width_mobile: { unit: '%', size: 100, sizes: [] },
      padding: spacing(8, 8, 8, 8),
    }, [c2], true)), true);
  return box({ content_width: 'boxed', flex_direction: 'column', flex_gap: dim(36), padding: PAD_Y(ctx), ...bgFor(b.background, ctx) }, [...head, grid]);
}

function compilePricing(b: Extract<PageBlock, { type: 'pricing' }>, ctx: Ctx): ElNode {
  const c = ctx.ds.colors;
  const onDark = b.background === 'dark' || b.background === 'primary' || b.background === 'gradient';
  const fg = onDark ? c.white : c.text;
  const muted = onDark ? 'rgba(255,255,255,0.75)' : c.muted;
  const head: ElNode[] = [];
  if (b.title) head.push(heading(b.title, { tag: 'h2', color: fg, align: 'center', size: 34, family: ctx.ds.fonts.heading, weight: '700' }));
  if (b.subhead) head.push(text(b.subhead, { color: muted, align: 'center', size: 16, family: ctx.ds.fonts.body }));

  // Use native Pro pricing-table when allowed; otherwise compose from free widgets.
  if (ctx.allowPro && b.plans.length <= 4) {
    const cards = b.plans.map(p => widget('pricing-table', {
      heading: p.name,
      sub_heading: p.period ?? '',
      currency_symbol: p.price.replace(/[\d.,]/g, '').slice(0, 3) || '$',
      price: p.price.replace(/[^\d.,]/g, ''),
      features_list: p.features.map(f => ({ item_text: f, selected_item_icon: { value: 'fas fa-check', library: 'fa-solid' }, _id: elementId() })),
      button_text: p.ctaLabel,
      link: link(p.ctaUrl),
      highlight: p.highlighted ? 'yes' : '',
    }));
    const grid = box({ flex_direction: 'row', flex_wrap: 'wrap', flex_gap: dim(24), justify_content: 'center' },
      cards.map(card => box({ flex_direction: 'column', width: { unit: '%', size: b.plans.length >= 3 ? 30 : 44, sizes: [] }, width_mobile: { unit: '%', size: 100, sizes: [] } }, [card], true)), true);
    return box({ content_width: 'boxed', flex_direction: 'column', flex_gap: dim(36), padding: PAD_Y(ctx), ...bgFor(b.background, ctx) }, [...head, grid]);
  }

  const cards = b.plans.map(p => box({
    flex_direction: 'column', flex_gap: dim(14),
    padding: spacing(30, 26, 30, 26),
    width: { unit: '%', size: b.plans.length >= 3 ? 30 : 44, sizes: [] },
    width_mobile: { unit: '%', size: 100, sizes: [] },
    background_background: 'classic',
    background_color: p.highlighted ? (onDark ? 'rgba(255,255,255,0.1)' : c.primary) : (onDark ? 'rgba(255,255,255,0.06)' : c.surface),
    border_border: 'solid',
    border_width: p.highlighted ? spacing(2, 2, 2, 2) : spacing(1, 1, 1, 1),
    border_color: p.highlighted ? c.accent : (onDark ? 'rgba(255,255,255,0.15)' : '#E2E8F0'),
    border_radius: dim(ctx.ds.radius),
  }, [
    heading(p.name, { tag: 'h3', color: p.highlighted ? (onDark ? c.accent : c.white) : fg, size: 18, family: ctx.ds.fonts.heading, weight: '600' }),
    heading(`${p.price}${p.period ? ` / ${p.period}` : ''}`, { tag: 'div', color: fg, size: 34, family: ctx.ds.fonts.heading, weight: '700' }),
    iconList(p.features.map(f => ({ text: f })), { iconColor: p.highlighted ? (onDark ? c.accent : c.white) : c.primary, textColor: muted }),
    button(p.ctaLabel, p.ctaUrl, { bg: p.highlighted ? (onDark ? c.accent : c.white) : c.primary, color: p.highlighted && !onDark ? c.primary : onDark ? c.dark : c.white, radius: ctx.ds.buttonRadius }),
  ], true));
  return box({ content_width: 'boxed', flex_direction: 'column', flex_gap: dim(36), padding: PAD_Y(ctx), ...bgFor(b.background, ctx) }, [...head, box({ flex_direction: 'row', flex_wrap: 'wrap', flex_gap: dim(24), justify_content: 'center' }, cards, true)]);
}

function compileCta(b: Extract<PageBlock, { type: 'cta' }>, ctx: Ctx): ElNode {
  const c = ctx.ds.colors;
  const onDark = true;
  const col: ElNode[] = [
    heading(b.headline, { tag: 'h2', color: c.white, align: 'center', size: 32, family: ctx.ds.fonts.heading, weight: '700' }),
  ];
  if (b.text) col.push(text(b.text, { color: 'rgba(255,255,255,0.8)', align: 'center', size: 16.5, family: ctx.ds.fonts.body }));
  col.push(button(b.buttonLabel, b.buttonUrl, { bg: c.accent, color: c.dark, align: 'center', family: ctx.ds.fonts.body }));
  return box({
    content_width: 'boxed', flex_direction: 'column', flex_gap: dim(18), align_items: 'center',
    padding: PAD_Y(ctx, 0.8), ...bgFor('gradient', ctx),
    border_radius: dim(ctx.ds.radius + 6),
  }, col);
}

function compileFaq(b: Extract<PageBlock, { type: 'faq' }>, ctx: Ctx): ElNode {
  const c = ctx.ds.colors;
  const onDark = b.background === 'dark' || b.background === 'primary' || b.background === 'gradient';
  const fg = onDark ? c.white : c.text;
  const head: ElNode[] = [];
  if (b.title) head.push(heading(b.title, { tag: 'h2', color: fg, align: 'center', size: 32, family: ctx.ds.fonts.heading, weight: '700' }));
  head.push(widget('accordion', {
    tabs: b.items.map(i => ({ tab_title: i.q, tab_content: `<p>${i.a}</p>`, _id: elementId() })),
    title_color: fg,
    border_color: onDark ? 'rgba(255,255,255,0.15)' : '#E2E8F0',
    typography_typography: 'custom',
    typography_font_family: ctx.ds.fonts.heading,
    typography_font_size: dim(16),
  }));
  return box({ content_width: 'boxed', flex_direction: 'column', flex_gap: dim(32), padding: PAD_Y(ctx), ...bgFor(b.background, ctx) }, head);
}

function compileContact(b: Extract<PageBlock, { type: 'contact' }>, ctx: Ctx): ElNode {
  const c = ctx.ds.colors;
  const onDark = b.background === 'dark' || b.background === 'primary' || b.background === 'gradient';
  const fg = onDark ? c.white : c.text;
  const muted = onDark ? 'rgba(255,255,255,0.75)' : c.muted;
  const left: ElNode[] = [];
  if (b.title) left.push(heading(b.title, { tag: 'h2', color: fg, size: 30, family: ctx.ds.fonts.heading, weight: '700' }));
  if (b.text) left.push(text(b.text, { color: muted, size: 16, family: ctx.ds.fonts.body, lineHeight: 1.7 }));

  const right: ElNode[] = [];
  if (ctx.allowPro) {
    right.push(widget('form', {
      form_name: `${b.title || 'Contact'} Form`,
      form_fields: (b.fields.length ? b.fields : [{ id: 'name', label: 'Name', type: 'text' as const }, { id: 'email', label: 'Email', type: 'email' as const }, { id: 'message', label: 'Message', type: 'textarea' as const }])
        .map(f => ({
          custom_id: f.id, field_type: f.type, field_label: f.label, placeholder: f.placeholder ?? '',
          required: f.required ? 'yes' : '', width: f.type === 'textarea' ? '100' : '50', _id: elementId(),
        })),
      button_text: b.submitText ?? 'Send Message',
      button_size: 'md',
      button_background_color: onDark ? c.accent : c.primary,
      button_text_color: onDark ? c.dark : c.white,
      button_align: 'left',
      email_to: b.emailTo,
      email_subject: `New message from ${b.title || 'website'}`,
      email_content: '[all-fields]',
      actions: ['email'],
      success_message: 'Thanks! Your message has been sent.',
      error_message: 'Sorry, something went wrong. Please try again.',
      required_message: 'This field is required.',
      invalid_message: 'Please check the value and try again.',
    }));
  } else {
    // Free fallback: still fully native — contact details + CTA button.
    right.push(iconList(
      (b.fields.length ? b.fields : [{ label: 'Email us', type: 'email' as const }]).slice(0, 4).map(f => ({ text: `${f.label}: ` })),
      { iconColor: onDark ? c.accent : c.primary, textColor: muted },
    ));
    right.push(text(`Email: <strong>${b.emailTo}</strong>`, { color: muted, size: 15, family: ctx.ds.fonts.body }));
    right.push(button(b.submitText ?? 'Get In Touch', `mailto:${b.emailTo}`, { bg: onDark ? c.accent : c.primary, color: onDark ? c.dark : c.white, family: ctx.ds.fonts.body }));
  }
  const rightBox = box({
    flex_direction: 'column', flex_gap: dim(16), width: { unit: '%', size: 46, sizes: [] }, width_mobile: { unit: '%', size: 100, sizes: [] },
    padding: spacing(28, 26, 28, 26),
    background_background: 'classic', background_color: onDark ? 'rgba(255,255,255,0.07)' : c.surface,
    border_radius: dim(ctx.ds.radius),
  }, right, true);

  return box({
    content_width: 'boxed', flex_direction: 'row', align_items: 'center', flex_gap: dim(48), flex_gap_mobile: dim(28),
    padding: PAD_Y(ctx), ...bgFor(b.background, ctx),
  }, [
    box({ flex_direction: 'column', flex_gap: dim(16), width: { unit: '%', size: 50, sizes: [] }, width_mobile: { unit: '%', size: 100, sizes: [] } }, left, true),
    rightBox,
  ]);
}

function compileText(b: Extract<PageBlock, { type: 'text' }>, ctx: Ctx): ElNode {
  const c = ctx.ds.colors;
  const onDark = b.background === 'dark' || b.background === 'primary' || b.background === 'gradient';
  const fg = onDark ? c.white : c.text;
  const col: ElNode[] = [];
  if (b.title) col.push(heading(b.title, { tag: 'h2', color: fg, align: b.align ?? 'left', size: 30, family: ctx.ds.fonts.heading, weight: '700' }));
  col.push(text(b.body, { color: onDark ? 'rgba(255,255,255,0.8)' : c.muted, align: b.align ?? 'left', size: 16, family: ctx.ds.fonts.body, lineHeight: 1.75 }));
  return box({ content_width: 'boxed', flex_direction: 'column', flex_gap: dim(16), padding: PAD_Y(ctx, 0.7), ...bgFor(b.background, ctx) }, col);
}

function compileGallery(b: Extract<PageBlock, { type: 'gallery' }>, ctx: Ctx): ElNode {
  const c = ctx.ds.colors;
  const onDark = b.background === 'dark' || b.background === 'primary' || b.background === 'gradient';
  const fg = onDark ? c.white : c.text;
  const head: ElNode[] = [];
  if (b.title) head.push(heading(b.title, { tag: 'h2', color: fg, align: 'center', size: 32, family: ctx.ds.fonts.heading, weight: '700' }));
  const imgs = b.images.slice(0, 8).map(g => widget('image', {
    image: { url: g.url, id: '', alt: g.alt ?? '', source: 'library' },
    image_size: 'full',
    width: { unit: '%', size: b.images.length > 2 ? 31.5 : 48, sizes: [] },
    width_mobile: { unit: '%', size: 100, sizes: [] },
    border_radius: dim(ctx.ds.radius),
  }));
  head.push(box({ flex_direction: 'row', flex_wrap: 'wrap', flex_gap: dim(20) }, imgs, true));
  return box({ content_width: 'boxed', flex_direction: 'column', flex_gap: dim(32), padding: PAD_Y(ctx, 0.8), ...bgFor(b.background, ctx) }, head);
}

function compileMap(b: Extract<PageBlock, { type: 'map' }>, ctx: Ctx): ElNode {
  const col: ElNode[] = [widget('google_maps', { address: b.address, zoom: { unit: 'px', size: 14, sizes: [] }, height: { unit: 'px', size: 420, sizes: [] }, height_mobile: { unit: 'px', size: 280, sizes: [] } })];
  return box({ content_width: 'full', flex_direction: 'column', padding: spacing(0, 0, 0, 0), ...bgFor(b.background, ctx) }, col);
}

function compileFooter(b: Extract<PageBlock, { type: 'footer' }>, ctx: Ctx): ElNode {
  const c = ctx.ds.colors;
  const col: ElNode[] = [];
  const brandCol: ElNode[] = [];
  if (b.brand) brandCol.push(heading(b.brand, { tag: 'div', color: c.white, size: 20, family: ctx.ds.fonts.heading, weight: '700' }));
  if (b.tagline) brandCol.push(text(b.tagline, { color: 'rgba(255,255,255,0.65)', size: 14, family: ctx.ds.fonts.body }));
  const main = box({ flex_direction: 'row', flex_gap: dim(48), flex_gap_mobile: dim(24) }, [
    box({ flex_direction: 'column', flex_gap: dim(12), width: { unit: '%', size: 40, sizes: [] }, width_mobile: { unit: '%', size: 100, sizes: [] } }, brandCol, true),
    b.links?.length ? box({
      flex_direction: 'column', width: { unit: '%', size: 30, sizes: [] }, width_mobile: { unit: '%', size: 100, sizes: [] },
    }, [
      heading('Quick Links', { tag: 'div', color: c.white, size: 15, family: ctx.ds.fonts.heading, weight: '600' }),
      iconList(b.links.map(l => ({ text: l.label, url: l.url })), { iconColor: c.accent, textColor: 'rgba(255,255,255,0.75)' }),
    ], true) : null,
    b.socials?.length ? box({ flex_direction: 'column', width: { unit: '%', size: 30, sizes: [] }, width_mobile: { unit: '%', size: 100, sizes: [] } }, [
      heading('Follow Us', { tag: 'div', color: c.white, size: 15, family: ctx.ds.fonts.heading, weight: '600' }),
      widget('social-icons', {
        social_icon_list: b.socials.slice(0, 6).map(s => ({
          social_icon: { value: socialIcon(s.network), library: 'fa-brands' },
          link: link(s.url),
          _id: elementId(),
        })),
        shape: 'circle',
        icon_size: { unit: 'px', size: 16, sizes: [] },
      }),
    ], true) : null,
  ].filter(Boolean) as ElNode[]);
  col.push(main);
  if (b.copyright) col.push(widget('divider', { style: 'solid', color: 'rgba(255,255,255,0.15)', weight: { unit: 'px', size: 1, sizes: [] } }));
  if (b.copyright) col.push(heading(b.copyright, { tag: 'div', color: 'rgba(255,255,255,0.55)', align: 'center', size: 13, family: ctx.ds.fonts.body }));
  return box({
    content_width: 'boxed', flex_direction: 'column', flex_gap: dim(24),
    padding: spacing(48, 24, 28, 24), background_background: 'classic', background_color: c.dark,
  }, col);
}

function socialIcon(network: string | undefined): string {
  const n = String(network ?? '').toLowerCase();
  const map: Record<string, string> = {
    facebook: 'fab fa-facebook-f', x: 'fab fa-x-twitter', twitter: 'fab fa-x-twitter',
    instagram: 'fab fa-instagram', linkedin: 'fab fa-linkedin-in', youtube: 'fab fa-youtube',
    tiktok: 'fab fa-tiktok', github: 'fab fa-github', pinterest: 'fab fa-pinterest-p',
  };
  return map[n] ?? 'fas fa-globe';
}

// ---- top-level compile -------------------------------------------------------

export function compilePage(spec: PageSpec, dsInput?: Partial<DesignSystem>, allowPro = false): { tree: ElNode[]; design: DesignSystem } {
  const ds: DesignSystem = { ...DEFAULT_DESIGN, ...dsInput ?? {}, colors: { ...DEFAULT_DESIGN.colors, ...dsInput?.colors } };
  const ctx: Ctx = { ds, allowPro };
  const tree = spec.blocks.map(b => {
    switch (b.type) {
      case 'hero': return compileHero(b, ctx);
      case 'features': return compileFeatures(b, ctx);
      case 'about': return compileAbout(b, ctx);
      case 'stats': return compileStats(b, ctx);
      case 'testimonials': return compileTestimonials(b, ctx);
      case 'pricing': return compilePricing(b, ctx);
      case 'cta': return compileCta(b, ctx);
      case 'faq': return compileFaq(b, ctx);
      case 'contact': return compileContact(b, ctx);
      case 'text': return compileText(b, ctx);
      case 'gallery': return compileGallery(b, ctx);
      case 'map': return compileMap(b, ctx);
      case 'footer': return compileFooter(b, ctx);
      default: return compileText({ type: 'text', body: '' }, ctx);
    }
  });
  return { tree, design: ds };
}

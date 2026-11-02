import { PageSpec, PageBlock, BLOCK_TYPES } from '@/lib/elementor/design';

/**
 * Coerce raw LLM output into a safe PageSpec. Real providers drift from the
 * schema (missing fields, wrong types, extra keys); the compiler and validator
 * stay strict, so everything is normalized HERE first. Anything unusable is
 * dropped or defaulted — never guessed into invalid Elementor data.
 */

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : fallback;

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : []);

const bg = (v: unknown): PageBlock['background'] => {
  const allowed = ['dark', 'light', 'primary', 'gradient', 'surface'];
  return allowed.includes(String(v)) ? (String(v) as PageBlock['background']) : undefined;
};

function block(b: Record<string, unknown>): PageBlock | null {
  const type = str(b.type);
  if (!BLOCK_TYPES.includes(type as never)) return null;
  switch (type) {
    case 'hero':
      return {
        type: 'hero', background: bg(b.background),
        badge: str(b.badge) || undefined,
        headline: str(b.headline, 'Welcome'),
        highlight: str(b.highlight) || undefined,
        subhead: str(b.subhead) || undefined,
        primaryCta: b.primaryCta ? { label: str((b.primaryCta as Record<string, unknown>).label, 'Contact us'), url: str((b.primaryCta as Record<string, unknown>).url, '/contact') } : undefined,
        secondaryCta: b.secondaryCta ? { label: str((b.secondaryCta as Record<string, unknown>).label, 'Learn more'), url: str((b.secondaryCta as Record<string, unknown>).url, '#') } : undefined,
        imageUrl: /^https?:\/\//.test(str(b.imageUrl)) ? str(b.imageUrl) : undefined,
        bullets: arr(b.bullets).map(x => str(typeof x === 'object' ? (x as Record<string, unknown>).text : x)).filter(Boolean).slice(0, 6),
      };
    case 'features':
      return {
        type: 'features', background: bg(b.background),
        title: str(b.title) || undefined, subhead: str(b.subhead) || undefined,
        columns: ([2, 3, 4].includes(num(b.columns, 3)) ? num(b.columns, 3) : 3) as 2 | 3 | 4,
        items: arr(b.items).map(i => {
          const o = i as Record<string, unknown>;
          return { icon: str(o.icon) || undefined, title: str(o.title, 'Feature'), text: str(o.text) };
        }).filter(i => i.title).slice(0, 6),
      };
    case 'about':
      return {
        type: 'about', background: bg(b.background),
        title: str(b.title, 'About us'), body: str(b.body),
        bullets: arr(b.bullets).map(x => str(typeof x === 'object' ? (x as Record<string, unknown>).text : x)).filter(Boolean).slice(0, 6),
        imageUrl: /^https?:\/\//.test(str(b.imageUrl)) ? str(b.imageUrl) : undefined,
        imageSide: str(b.imageSide) === 'left' ? 'left' : 'right',
      };
    case 'stats':
      return {
        type: 'stats', background: bg(b.background),
        items: arr(b.items).map(i => {
          const o = i as Record<string, unknown>;
          return { value: Math.round(num(o.value, 0)), suffix: str(o.suffix) || undefined, label: str(o.label) };
        }).filter(i => i.label).slice(0, 4),
      };
    case 'testimonials':
      return {
        type: 'testimonials', background: bg(b.background),
        title: str(b.title) || undefined,
        items: arr(b.items).map(i => {
          const o = i as Record<string, unknown>;
          return { quote: str(o.quote), name: str(o.name, 'Customer'), role: str(o.role) || undefined };
        }).filter(i => i.quote).slice(0, 6),
      };
    case 'pricing':
      return {
        type: 'pricing', background: bg(b.background),
        title: str(b.title) || undefined, subhead: str(b.subhead) || undefined,
        plans: arr(b.plans).map(p => {
          const o = p as Record<string, unknown>;
          return {
            name: str(o.name, 'Plan'), price: str(o.price, '$0'), period: str(o.period) || undefined,
            features: arr(o.features).map(f => str(typeof f === 'object' ? (f as Record<string, unknown>).text : f)).filter(Boolean).slice(0, 8),
            ctaLabel: str(o.ctaLabel, 'Choose'), ctaUrl: str(o.ctaUrl, '/contact'),
            highlighted: o.highlighted === true || o.highlighted === 'yes',
          };
        }).slice(0, 4),
      };
    case 'cta':
      return {
        type: 'cta', headline: str(b.headline, 'Get started'), text: str(b.text) || undefined,
        buttonLabel: str(b.buttonLabel, 'Contact us'), buttonUrl: str(b.buttonUrl, '/contact'),
      };
    case 'faq':
      return {
        type: 'faq', background: bg(b.background), title: str(b.title) || undefined,
        items: arr(b.items).map(i => {
          const o = i as Record<string, unknown>;
          return { q: str(o.q ?? o.question), a: str(o.a ?? o.answer) };
        }).filter(i => i.q && i.a).slice(0, 8),
      };
    case 'contact':
      return {
        type: 'contact', background: bg(b.background),
        title: str(b.title) || undefined, text: str(b.text) || undefined,
        emailTo: str(b.emailTo ?? b.email, 'hello@example.com'),
        submitText: str(b.submitText) || undefined,
        fields: arr(b.fields).map(f => {
          const o = f as Record<string, unknown>;
          const t = str(o.type, 'text');
          return {
            id: str(o.id, `field${Math.random().toString(36).slice(2, 6)}`),
            label: str(o.label, 'Field'),
            type: (['text', 'email', 'textarea', 'tel'].includes(t) ? t : 'text') as 'text' | 'email' | 'textarea' | 'tel',
            required: o.required === true || o.required === 'yes',
            placeholder: str(o.placeholder) || undefined,
          };
        }).slice(0, 8),
      };
    case 'text':
      return {
        type: 'text', background: bg(b.background),
        title: str(b.title) || undefined, body: str(b.body),
        align: str(b.align) === 'center' ? 'center' : 'left',
      };
    case 'gallery':
      return {
        type: 'gallery', background: bg(b.background), title: str(b.title) || undefined,
        images: arr(b.images).map(i => {
          const o = i as Record<string, unknown>;
          const url = str(o.url ?? (typeof i === 'string' ? i : ''));
          return /^https?:\/\//.test(url) ? { url, alt: str(o.alt) || undefined } : null;
        }).filter(Boolean).slice(0, 8) as { url: string; alt?: string }[],
      };
    case 'map':
      return { type: 'map', background: bg(b.background), title: str(b.title) || undefined, address: str(b.address) };
    case 'footer':
      return {
        type: 'footer',
        brand: str(b.brand) || undefined, tagline: str(b.tagline) || undefined,
        links: arr(b.links).map(l => {
          const o = l as Record<string, unknown>;
          return { label: str(o.label ?? o.text), url: str(o.url, '#') };
        }).filter(l => l.label).slice(0, 8),
        socials: arr(b.socials).map(s => {
          const o = s as Record<string, unknown>;
          // Providers use network | icon | name — coerce all of them.
          return { network: str(o.network ?? o.icon ?? o.name, 'globe').toLowerCase(), url: str(o.url, '#') };
        }).slice(0, 6),
        copyright: str(b.copyright) || undefined,
      };
    default:
      return null;
  }
}

export function normalizeSpec(raw: unknown, fallbackTitle = 'Page'): PageSpec {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const blocks = arr(o.blocks)
    .map(b => block(b as Record<string, unknown>))
    .filter((b): b is PageBlock => b !== null);
  const title = str(o.title, fallbackTitle);
  const slug = str(o.slug).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ||
    title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
  return { title, slug, description: str(o.description) || undefined, blocks };
}

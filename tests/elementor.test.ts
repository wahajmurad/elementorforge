import { describe, it, expect } from 'vitest';
import { validateElementorTree, structureHash } from '@/lib/elementor/validator';
import { compilePage } from '@/lib/elementor/compile';
import { PageSpec } from '@/lib/elementor/design';

const headingWidget = {
  id: 'a1b2c3d',
  elType: 'widget',
  widgetType: 'heading',
  settings: { title: 'Hello', header_size: 'h1' },
  elements: [],
};

const heroContainer = {
  id: 'b2c3d4e',
  elType: 'container',
  settings: { content_width: 'boxed', flex_direction: 'column' },
  elements: [headingWidget],
};

describe('Elementor validator', () => {
  it('accepts a valid native tree', () => {
    const r = validateElementorTree([heroContainer]);
    expect(r.valid).toBe(true);
    expect(r.stats.containers).toBe(1);
    expect(r.stats.widgets).toBe(1);
  });

  it('rejects non-array roots', () => {
    expect(validateElementorTree({}).valid).toBe(false);
    expect(validateElementorTree(null).valid).toBe(false);
  });

  it('rejects custom HTML / shortcode widgets by policy', () => {
    const tree = [{ ...heroContainer, elements: [{ ...headingWidget, widgetType: 'html', settings: { html: '<script>' } }] }];
    const r = validateElementorTree(tree);
    expect(r.valid).toBe(false);
    expect(r.errors[0].message).toMatch(/forbidden/i);
  });

  it('rejects Pro widgets without a license', () => {
    const tree = [{ ...heroContainer, elements: [{ ...headingWidget, widgetType: 'form', settings: { form_name: 'x' } }] }];
    expect(validateElementorTree(tree, { allowPro: false }).valid).toBe(false);
    expect(validateElementorTree(tree, { allowPro: true }).valid).toBe(true);
  });

  it('rejects unknown widget settings and javascript: URLs', () => {
    const bad = [{ ...heroContainer, elements: [{ ...headingWidget, settings: { title: 'x', evil_setting: 1 } }] }];
    expect(validateElementorTree(bad).valid).toBe(false);
    const jsUrl = [{ ...heroContainer, elements: [{ ...headingWidget, settings: { title: 'x', link: { url: 'javascript:alert(1)' } } }] }];
    expect(validateElementorTree(jsUrl).valid).toBe(false);
  });

  it('rejects legacy sections/columns', () => {
    const legacy = [{ id: 'c3d4e5f', elType: 'section', settings: {}, elements: [] }];
    expect(validateElementorTree(legacy).valid).toBe(false);
  });

  it('rejects excessive depth and size', () => {
    let deep: Record<string, unknown> = { ...headingWidget, id: 'd4e5f6a' };
    for (let i = 0; i < 8; i++) deep = { id: `d${i}e5f6a`.slice(0, 7), elType: 'container', settings: {}, elements: [deep] };
    expect(validateElementorTree([deep]).valid).toBe(false);
  });

  it('structureHash ignores element ids', () => {
    const a = [JSON.parse(JSON.stringify(heroContainer))];
    const b = [JSON.parse(JSON.stringify(heroContainer))];
    b[0].id = 'ffffff1'; b[0].elements[0].id = 'ffffff2';
    expect(structureHash(a)).toBe(structureHash(b));
    b[0].settings.content_width = 'full';
    expect(structureHash(a)).not.toBe(structureHash(b));
  });
});

describe('Compiler output is valid Elementor', () => {
  const spec: PageSpec = {
    title: 'Home',
    slug: 'home',
    blocks: [
      { type: 'hero', background: 'gradient', headline: 'We build gardens', highlight: 'gardens', subhead: 'Award winning landscaping.', primaryCta: { label: 'Quote', url: '/contact' }, bullets: ['Fast', 'Insured'] },
      { type: 'features', title: 'Why us', columns: 3, items: [{ icon: 'fas fa-award', title: 'Quality', text: 'Top quality.' }, { title: 'Speed', text: 'On time.' }, { title: 'Care', text: 'We care.' }] },
      { type: 'stats', background: 'dark', items: [{ value: 250, suffix: '+', label: 'Projects' }, { value: 98, suffix: '%', label: 'Satisfaction' }] },
      { type: 'testimonials', title: 'Clients', items: [{ quote: 'Great work', name: 'Sara', role: 'CEO' }] },
      { type: 'pricing', title: 'Plans', plans: [{ name: 'Basic', price: '$99', period: 'mo', features: ['1 room'], ctaLabel: 'Choose', ctaUrl: '/contact', highlighted: true }, { name: 'Full', price: '$299', period: 'mo', features: ['All rooms'], ctaLabel: 'Choose', ctaUrl: '/contact' }] },
      { type: 'faq', title: 'Questions', items: [{ q: 'How fast?', a: 'Very.' }] },
      { type: 'contact', title: 'Talk to us', emailTo: 'hi@acme.com', fields: [{ id: 'name', label: 'Name', type: 'text', required: true }, { id: 'email', label: 'Email', type: 'email', required: true }, { id: 'msg', label: 'Message', type: 'textarea' }] },
      { type: 'gallery', title: 'Work', images: [{ url: 'https://example.com/1.jpg', alt: 'one' }, { url: 'https://example.com/2.jpg', alt: 'two' }] },
      { type: 'map', address: 'Austin TX' },
      { type: 'footer', brand: 'Acme', links: [{ label: 'Home', url: '/home' }], socials: [{ network: 'facebook', url: 'https://facebook.com/acme' }], copyright: '© 2026 Acme' },
    ],
  };

  it('compiles the full vocabulary into a valid free-widget tree', () => {
    const { tree, design } = compilePage(spec);
    const report = validateElementorTree(tree, { allowPro: false });
    if (!report.valid) console.error(report.errors.slice(0, 8));
    expect(report.valid).toBe(true);
    expect(report.stats.widgets).toBeGreaterThan(15);
    expect(report.stats.containers).toBeGreaterThan(8);
    expect(design.colors.primary).toBeTruthy();
  });

  it('compiles Pro blocks when a license is verified', () => {
    const contactSpec: PageSpec = { title: 'Contact', slug: 'contact', blocks: [{ type: 'contact', title: 'Contact', emailTo: 'a@b.com', fields: [{ id: 'e', label: 'Email', type: 'email' }] }] };
    const { tree } = compilePage(contactSpec, undefined, true);
    const report = validateElementorTree(tree, { allowPro: true });
    expect(report.valid).toBe(true);
    expect(report.stats.proWidgets).toContain('form');
  });

  it('every element id is 7-char hex', () => {
    const { tree } = compilePage({ title: 'Home', slug: 'home', blocks: [{ type: 'hero', headline: 'x', subhead: 'y' }] });
    const walk = (n: { id: string; elements?: unknown[] }) => {
      expect(n.id).toMatch(/^[0-9a-f]{6,8}$/i);
      (n.elements ?? []).forEach(walk as never);
    };
    (tree as unknown[]).forEach(walk as never);
  });
});

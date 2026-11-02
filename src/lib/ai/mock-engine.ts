import type { ChatMessage } from './registry';

/**
 * Deterministic offline engine for tests and key-less environments.
 * Parses the pipeline prompts (which carry step + brief) and returns the
 * same JSON shapes as the real providers — enough to exercise the full
 * pipeline end-to-end without network access.
 */

function field(brief: Record<string, unknown>, key: string, fallback: string): string {
  const v = brief[key];
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

function parseBrief(messages: ChatMessage[]): Record<string, unknown> {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const match = m.content.match(/<brief>([\s\S]*?)<\/brief>/);
    if (match) {
      try { return JSON.parse(match[1]); } catch { /* fallthrough */ }
    }
  }
  return {};
}

function parseStep(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const match = m.content.match(/<step>([\s\S]*?)<\/step>/);
    if (match) return match[1].trim();
  }
  return 'components';
}

/** Extracts the <page> metadata (title/goal/blocks) from components prompts. */
function parsePage(messages: ChatMessage[]): { title?: string; goal?: string; allowedBlocks?: string[] } {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const match = m.content.match(/<page>([\s\S]*?)<\/page>/);
    if (match) {
      try { return JSON.parse(match[1]); } catch { /* fallthrough */ }
    }
  }
  return {};
}

export function mockComplete(messages: ChatMessage[]): string {
  const step = parseStep(messages);
  const brief = parseBrief(messages);
  const name = field(brief, 'businessName', 'Acme Studio');
  const industry = field(brief, 'industry', 'Professional Services');
  const description = field(brief, 'description', `${name} is a ${industry.toLowerCase()} company serving its local community.`);
  const email = field(brief, 'email', 'hello@example.com');
  const city = field(brief, 'city', 'our area');

  if (step === 'analyze') {
    return JSON.stringify({
      brandName: name,
      tagline: `${industry} done right`,
      tone: 'professional, friendly, trustworthy',
      audience: `Customers looking for ${industry.toLowerCase()} in ${city}`,
      valueProps: [
        `Experienced ${industry.toLowerCase()} team`,
        'Transparent pricing and clear communication',
        'Fast, reliable service with follow-up support',
      ],
      primaryCta: 'Get a Free Quote',
      contactEmail: email,
      keywords: [industry.toLowerCase(), 'services', 'contact'],
    });
  }

  if (step === 'sitemap') {
    const pages = Array.isArray(brief.pages) && brief.pages.length
      ? (brief.pages as string[]) : ['Home', 'About', 'Services', 'Contact'];
    return JSON.stringify({
      pages: pages.map((p, i) => ({
        title: p,
        slug: i === 0 ? 'home' : p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        goal: i === 0 ? 'Convert visitors into inquiries' : `Inform about ${p.toLowerCase()}`,
        blocks: i === 0
          ? ['hero', 'features', 'stats', 'testimonials', 'cta']
          : p.toLowerCase() === 'about' ? ['about', 'stats', 'cta']
          : p.toLowerCase() === 'services' ? ['text', 'features', 'cta']
          : p.toLowerCase() === 'contact' ? ['contact', 'map']
          : ['text', 'cta'],
      })),
    });
  }

  if (step === 'design_system') {
    return JSON.stringify({
      colors: {
        primary: '#0F766E', secondary: '#134E4A', accent: '#F59E0B',
        dark: '#0B1120', light: '#F8FAFC', bg: '#FFFFFF', surface: '#F1F5F9',
        text: '#0F172A', muted: '#64748B', white: '#FFFFFF',
      },
      fonts: { heading: 'Poppins', body: 'Inter' },
      radius: 14, buttonRadius: 999, sectionSpacing: 72,
    });
  }

  // components / revise — return a PageSpec (single page)
  const pageMeta = step === 'components' ? parsePage(messages) : {};
  const pageTitle = pageMeta.title || field(brief, 'pageTitle', 'Home');
  const pageBlocks = pageMeta.allowedBlocks?.length ? pageMeta.allowedBlocks : null;
  const isHome = /home/i.test(pageTitle);
  const blocks: unknown[] = isHome ? [
    {
      type: 'hero', background: 'gradient', badge: industry,
      headline: `Welcome to ${name}`,
      highlight: name,
      subhead: description,
      primaryCta: { label: 'Get a Free Quote', url: '/contact' },
      secondaryCta: { label: 'Our Services', url: '/services' },
      bullets: [`Trusted ${industry.toLowerCase()} experts`, 'Transparent pricing', 'Satisfaction guaranteed'],
    },
    {
      type: 'features', title: 'Why Choose Us', subhead: `What sets ${name} apart`, columns: 3,
      items: [
        { icon: 'fas fa-award', title: 'Proven Expertise', text: `Years of experience delivering ${industry.toLowerCase()} with consistent results.` },
        { icon: 'fas fa-handshake', title: 'Customer First', text: 'Clear communication, honest timelines and pricing you can rely on.' },
        { icon: 'fas fa-bolt', title: 'Fast Turnaround', text: 'We respect your schedule and deliver on time, every time.' },
      ],
    },
    {
      type: 'stats', background: 'dark',
      items: [ { value: 250, suffix: '+', label: 'Projects Completed' }, { value: 98, suffix: '%', label: 'Client Satisfaction' }, { value: 12, suffix: '', label: 'Years of Experience' } ],
    },
    {
      type: 'testimonials', title: 'What Our Clients Say',
      items: [
        { quote: `${name} exceeded our expectations. Professional from start to finish.`, name: 'Sarah M.', role: 'Homeowner' },
        { quote: 'Reliable, transparent and high quality work. Highly recommended.', name: 'David K.', role: 'Business Owner' },
      ],
    },
    {
      type: 'cta', headline: 'Ready to get started?', text: 'Reach out today for a free, no-obligation quote.',
      buttonLabel: 'Contact Us', buttonUrl: '/contact',
    },
    {
      type: 'footer', brand: name, tagline: `${industry} in ${city}`,
      links: [ { label: 'Home', url: '/home' }, { label: 'About', url: '/about' }, { label: 'Services', url: '/services' }, { label: 'Contact', url: '/contact' } ],
      socials: [ { network: 'facebook', url: 'https://facebook.com' }, { network: 'instagram', url: 'https://instagram.com' } ],
      copyright: `© ${new Date().getFullYear()} ${name}. All rights reserved.`,
    },
  ] : (() => {
    const inner: unknown[] = [
      { type: 'hero', background: 'dark', badge: name, headline: pageTitle, subhead: `${pageTitle} — ${description}`, primaryCta: { label: 'Contact Us', url: '/contact' } },
    ];
    if (pageBlocks?.includes('about')) inner.push({ type: 'about', title: `About ${pageTitle}`, background: 'light', body: description, bullets: [`${industry} specialists`, `Serving ${city} and surroundings`, 'Free consultations'] });
    if (pageBlocks?.includes('features')) inner.push({ type: 'features', title: `${pageTitle} at a glance`, columns: 3, items: [
      { icon: 'fas fa-award', title: 'Proven Expertise', text: `Years of experience delivering ${industry.toLowerCase()}.` },
      { icon: 'fas fa-handshake', title: 'Customer First', text: 'Clear communication and honest timelines.' },
      { icon: 'fas fa-bolt', title: 'Fast Turnaround', text: 'We deliver on time, every time.' },
    ] });
    if (pageBlocks?.includes('contact')) inner.push({ type: 'contact', title: 'Talk to us', text: 'Send us a message and we reply within one business day.', emailTo: email, submitText: 'Send Message', fields: [
      { id: 'name', label: 'Name', type: 'text', required: true },
      { id: 'email', label: 'Email', type: 'email', required: true },
      { id: 'message', label: 'Message', type: 'textarea' },
    ] });
    if (pageBlocks?.includes('map')) inner.push({ type: 'map', address: city });
    inner.push({ type: 'cta', headline: 'Questions?', text: `Email us at ${email}`, buttonLabel: 'Email Us', buttonUrl: `mailto:${email}` });
    inner.push({
      type: 'footer', brand: name, tagline: `${industry} in ${city}`,
      links: [ { label: 'Home', url: '/home' }, { label: pageTitle, url: `/${pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` }, { label: 'Contact', url: '/contact' } ],
      copyright: `© ${new Date().getFullYear()} ${name}. All rights reserved.`,
    });
    return inner;
  })();
  return JSON.stringify({ title: pageTitle, slug: pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'), blocks });
}

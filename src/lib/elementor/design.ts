/**
 * Design system tokens + the semantic page vocabulary the AI works with.
 * The AI never emits raw Elementor JSON; it emits semantic blocks which the
 * compiler deterministically maps to native Elementor containers/widgets.
 * This keeps AI output valid by construction and still 100% Elementor-native.
 */

export interface DesignSystem {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    dark: string;
    light: string;
    bg: string;
    surface: string;
    text: string;
    muted: string;
    white: string;
  };
  fonts: { heading: string; body: string };
  radius: number;
  buttonRadius: number;
  sectionSpacing: number;
}

export const DEFAULT_DESIGN: DesignSystem = {
  colors: {
    primary: '#0F766E', secondary: '#134E4A', accent: '#F59E0B',
    dark: '#0B1120', light: '#F8FAFC', bg: '#FFFFFF', surface: '#F1F5F9',
    text: '#0F172A', muted: '#64748B', white: '#FFFFFF',
  },
  fonts: { heading: 'Poppins', body: 'Inter' },
  radius: 14,
  buttonRadius: 999,
  sectionSpacing: 72,
};

// Semantic block vocabulary ------------------------------------------------

export interface BlockBase { background?: 'dark' | 'light' | 'primary' | 'gradient' | 'surface' | 'image' }

export interface HeroBlock extends BlockBase {
  type: 'hero';
  badge?: string;
  headline: string;
  highlight?: string; // words inside headline to color with accent/primary
  subhead?: string;
  primaryCta?: { label: string; url: string };
  secondaryCta?: { label: string; url: string };
  imageUrl?: string;
  bullets?: string[];
}

export interface FeaturesBlock extends BlockBase {
  type: 'features';
  title?: string;
  subhead?: string;
  columns?: 2 | 3 | 4;
  items: { icon?: string; title: string; text: string }[];
}

export interface AboutBlock extends BlockBase {
  type: 'about';
  title: string;
  body: string;
  bullets?: string[];
  imageUrl?: string;
  imageSide?: 'left' | 'right';
}

export interface StatsBlock extends BlockBase {
  type: 'stats';
  items: { value: number; suffix?: string; label: string }[];
}

export interface TestimonialsBlock extends BlockBase {
  type: 'testimonials';
  title?: string;
  items: { quote: string; name: string; role?: string }[];
}

export interface PricingBlock extends BlockBase {
  type: 'pricing';
  title?: string;
  subhead?: string;
  plans: { name: string; price: string; period?: string; features: string[]; ctaLabel: string; ctaUrl: string; highlighted?: boolean }[];
}

export interface CtaBlock extends BlockBase {
  type: 'cta';
  headline: string;
  text?: string;
  buttonLabel: string;
  buttonUrl: string;
}

export interface FaqBlock extends BlockBase {
  type: 'faq';
  title?: string;
  items: { q: string; a: string }[];
}

export interface ContactBlock extends BlockBase {
  type: 'contact';
  title?: string;
  text?: string;
  emailTo: string;
  submitText?: string;
  fields: { id: string; label: string; type: 'text' | 'email' | 'textarea' | 'tel'; required?: boolean; placeholder?: string }[];
}

export interface TextBlock extends BlockBase {
  type: 'text';
  title?: string;
  body: string;
  align?: 'left' | 'center';
}

export interface GalleryBlock extends BlockBase {
  type: 'gallery';
  title?: string;
  images: { url: string; alt?: string }[];
}

export interface MapBlock extends BlockBase {
  type: 'map';
  title?: string;
  address: string;
}

export interface FooterBlock extends BlockBase {
  type: 'footer';
  brand?: string;
  tagline?: string;
  links?: { label: string; url: string }[];
  socials?: { network: string; url: string }[];
  copyright?: string;
}

export type PageBlock =
  | HeroBlock | FeaturesBlock | AboutBlock | StatsBlock | TestimonialsBlock
  | PricingBlock | CtaBlock | FaqBlock | ContactBlock | TextBlock
  | GalleryBlock | MapBlock | FooterBlock;

export interface PageSpec {
  title: string;
  slug: string;
  description?: string;
  blocks: PageBlock[];
}

export const BLOCK_TYPES = [
  'hero', 'features', 'about', 'stats', 'testimonials', 'pricing',
  'cta', 'faq', 'contact', 'text', 'gallery', 'map', 'footer',
] as const;

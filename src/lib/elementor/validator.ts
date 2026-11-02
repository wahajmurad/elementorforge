import { createHash } from 'crypto';
import {
  WIDGETS, CONTAINER_SETTINGS, EL_TYPES, MAX_DEPTH, MAX_NODES,
  isResponsiveKey, FORBIDDEN_WIDGETS,
} from './schema';

/**
 * Structural validator for native Elementor JSON (_elementor_data).
 * Runs server-side BEFORE writing to WordPress and AGAIN inside the
 * connector plugin. A page is never claimed as built unless the write
 * was confirmed by the site and the read-back hash matches.
 */

export interface ValidationIssue {
  level: 'error' | 'warning';
  path: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: { containers: number; widgets: number; depth: number; proWidgets: string[] };
}

const HEX_ID = /^[0-9a-f]{6,8}$/i;
const URL_RE = /^(https?:\/\/|\/|#|mailto:|tel:)/i;
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\)|transparent|currentcolor)$/i;
const SAFE_COLOR_KEYS = /color$/i;

function isDimension(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.unit === 'string' && (typeof o.size === 'number' || typeof o.size === 'string' || o.sizes !== undefined);
}

function isLink(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.url === 'string';
}

function checkColor(value: unknown, path: string, issues: ValidationIssue[]) {
  if (typeof value === 'string' && value && !COLOR_RE.test(value)) {
    issues.push({ level: 'error', path, message: `Invalid color value "${value.slice(0, 40)}"` });
  }
}

function checkUrl(value: unknown, path: string, issues: ValidationIssue[]) {
  if (typeof value !== 'string' || !value) return;
  if (!URL_RE.test(value)) {
    issues.push({ level: 'error', path, message: `URL must be http(s), relative or mailto/tel (got "${value.slice(0, 40)}")` });
  }
}

export function validateElementorTree(tree: unknown, opts: { allowPro: boolean } = { allowPro: false }): ValidationReport {
  const issues: ValidationIssue[] = [];
  const stats = { containers: 0, widgets: 0, depth: 0, proWidgets: [] as string[] };
  let nodeCount = 0;

  if (!Array.isArray(tree)) {
    return {
      valid: false,
      errors: [{ level: 'error', path: '$', message: 'Root of _elementor_data must be a JSON array of top-level containers' }],
      warnings: [],
      stats,
    };
  }

  const walk = (node: unknown, path: string, depth: number) => {
    nodeCount++;
    if (nodeCount > MAX_NODES) {
      issues.push({ level: 'error', path, message: `Structure exceeds ${MAX_NODES} elements` });
      return;
    }
    stats.depth = Math.max(stats.depth, depth);
    if (depth > MAX_DEPTH) {
      issues.push({ level: 'error', path, message: `Nesting deeper than ${MAX_DEPTH} levels` });
      return;
    }
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      issues.push({ level: 'error', path, message: 'Element must be an object' });
      return;
    }
    const el = node as Record<string, unknown>;
    if (typeof el.id !== 'string' || !HEX_ID.test(el.id)) {
      issues.push({ level: 'error', path: `${path}.id`, message: 'Element id must be a 6-8 char hex string' });
    }
    if (!EL_TYPES.includes(el.elType as never)) {
      issues.push({ level: 'error', path: `${path}.elType`, message: `elType must be container|widget (got "${String(el.elType)}"). Legacy sections/columns are not emitted.` });
      return;
    }

    if (el.elType === 'container') {
      stats.containers++;
      if (el.settings && typeof el.settings === 'object' && !Array.isArray(el.settings)) {
        for (const [k, v] of Object.entries(el.settings as Record<string, unknown>)) {
          if (!isResponsiveKey(k, CONTAINER_SETTINGS)) {
            issues.push({ level: 'error', path: `${path}.settings.${k}`, message: `Unknown container setting "${k}"` });
            continue;
          }
          if (SAFE_COLOR_KEYS.test(k)) checkColor(v, `${path}.settings.${k}`, issues);
          if (k === 'background_image' || k === 'image') {
            const img = v as Record<string, unknown> | null;
            if (img && typeof img === 'object') checkUrl(img.url, `${path}.settings.${k}.url`, issues);
          }
          if (k === 'link') checkUrl((v as Record<string, unknown>)?.url, `${path}.settings.link.url`, issues);
          if (isResponsiveKey(k, ['padding', 'margin', 'min_height', 'width', 'max_width', 'flex_gap']) && !isDimension(v)) {
            issues.push({ level: 'warning', path: `${path}.settings.${k}`, message: `Expected a dimension object {unit,size}` });
          }
        }
      }
      const children = el.elements;
      if (!Array.isArray(children)) {
        issues.push({ level: 'error', path: `${path}.elements`, message: 'Container elements must be an array' });
        return;
      }
      children.forEach((child, i) => walk(child, `${path}.elements[${i}]`, depth + 1));
      return;
    }

    // widget
    stats.widgets++;
    const widgetType = el.widgetType as string;
    const def = WIDGETS[widgetType];
    if (!def) {
      issues.push({
        level: 'error',
        path: `${path}.widgetType`,
        message: FORBIDDEN_WIDGETS.has(widgetType)
          ? `Widget "${widgetType}" is forbidden by policy (native structures only, no custom HTML)`
          : `Widget "${widgetType}" is not in the supported catalog`,
      });
      return;
    }
    if (def.pro && !opts.allowPro) {
      issues.push({ level: 'error', path: `${path}.widgetType`, message: `Widget "${widgetType}" requires Elementor Pro with an active license on the target site` });
    }
    if (def.pro && opts.allowPro && !stats.proWidgets.includes(widgetType)) stats.proWidgets.push(widgetType);

    const settings = (el.settings ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(settings)) {
      if (!isResponsiveKey(k, def.settings)) {
        issues.push({ level: 'error', path: `${path}.settings.${k}`, message: `Unknown "${widgetType}" setting "${k}"` });
        continue;
      }
      if (SAFE_COLOR_KEYS.test(k) && !/typography/.test(k)) checkColor(v, `${path}.settings.${k}`, issues);
      const repeater = def.repeaters?.[k];
      if (repeater) {
        if (!Array.isArray(v)) {
          issues.push({ level: 'error', path: `${path}.settings.${k}`, message: 'Repeater must be an array' });
          continue;
        }
        v.forEach((item, i) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            issues.push({ level: 'error', path: `${path}.settings.${k}[${i}]`, message: 'Repeater item must be an object' });
            return;
          }
          for (const ik of Object.keys(item as Record<string, unknown>)) {
            // Elementor assigns a unique _id to every repeater item
            if (ik !== '_id' && !repeater.includes(ik)) {
              issues.push({ level: 'error', path: `${path}.settings.${k}[${i}].${ik}`, message: `Unknown repeater field "${ik}"` });
            }
          }
          if (k === 'icon_list' || k === 'social_icon_list' || k === 'form_fields') {
            const link = (item as Record<string, unknown>).link;
            if (link) checkUrl((link as Record<string, unknown>).url, `${path}.settings.${k}[${i}].link.url`, issues);
          }
        });
        continue;
      }
      if (k === 'link') {
        if (!isLink(v)) issues.push({ level: 'error', path: `${path}.settings.${k}`, message: 'link must be {url, is_external?, nofollow?}' });
        else checkUrl((v as Record<string, unknown>).url, `${path}.settings.${k}.url`, issues);
        continue;
      }
      if (k === 'image' || k === 'testimonial_image' || k === 'image_overlay') {
        const img = v as Record<string, unknown> | null;
        if (img && typeof img === 'object') checkUrl(img.url, `${path}.settings.${k}.url`, issues);
        continue;
      }
      if (k === 'editor' && typeof v === 'string') {
        // text-editor content is limited paragraphs/strong/em/br — no scripts.
        if (/<\s*(script|iframe|object|embed|link|style|meta)/i.test(v)) {
          issues.push({ level: 'error', path: `${path}.settings.${k}`, message: 'text-editor content may not contain script/iframe/style tags' });
        }
      }
    }
    if (widgetType === 'heading' && typeof settings.title !== 'string') {
      issues.push({ level: 'error', path: `${path}.settings.title`, message: 'heading requires a title string' });
    }
  };

  (tree as unknown[]).forEach((top, i) => walk(top, `$[${i}]`, 1));

  const errors = issues.filter(i => i.level === 'error');
  return { valid: errors.length === 0, errors, warnings: issues.filter(i => i.level === 'warning'), stats };
}

/** Canonical structural hash used for write/read-back verification. */
export function structureHash(tree: unknown): string {
  const canonical = JSON.stringify(stripVolatile(tree));
  return createHash('sha256').update(canonical).digest('hex');
}

function stripVolatile(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripVolatile);
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'id' || k === '_id') continue; // ids are regenerated per write
      out[k] = stripVolatile(v);
    }
    return out;
  }
  return node;
}

/**
 * Pipeline prompts. Each step receives the structured brief in XML-ish tags
 * so both real providers and the offline mock can parse deterministically.
 * The AI emits SEMANTIC blocks only — the compiler maps them to native
 * Elementor containers/widgets (see lib/elementor/compile.ts).
 */

import { BLOCK_TYPES } from '@/lib/elementor/design';

export const ANALYZE_SYSTEM = `You are a senior brand strategist preparing a website brief. Respond with STRICT JSON only, no prose.`;

export function analyzePrompt(briefJson: string, designInstructions?: string, referenceUrl?: string) {
  return `<step>analyze</step>
<brief>${briefJson}</brief>
${designInstructions ? `<design_instructions>${designInstructions}</design_instructions>` : ''}
${referenceUrl ? `<reference_url>${referenceUrl}</reference_url>` : ''}
Analyze this business brief. Return JSON: {"brandName": string, "tagline": string, "tone": string, "audience": string, "valueProps": string[3], "primaryCta": string, "contactEmail": string, "keywords": string[]}`;
}

export const SITEMAP_SYSTEM = `You are a website architect. Respond with STRICT JSON only, no prose.`;

export function sitemapPrompt(briefJson: string, analysisJson: string, requestedPages: string[]) {
  return `<step>sitemap</step>
<brief>${briefJson}</brief>
<analysis>${analysisJson}</analysis>
<requested_pages>${JSON.stringify(requestedPages)}</requested_pages>
Design the sitemap. Every page slug must be unique, lowercase, kebab-case; the first requested page is the homepage (slug "home").
For each page choose 2-6 blocks from: ${BLOCK_TYPES.join(', ')}. The homepage must start with "hero". "footer" block allowed only as last block of a page. "contact" page should include a "contact" block. "map" block requires an address.
Return JSON: {"pages": [{"title": string, "slug": string, "goal": string, "blocks": string[]}]}`;
}

export const DESIGN_SYSTEM_SYSTEM = `You are a brand designer. Respond with STRICT JSON only, no prose.`;

export function designSystemPrompt(briefJson: string, analysisJson: string) {
  return `<step>design_system</step>
<brief>${briefJson}</brief>
<analysis>${analysisJson}</analysis>
Create the design system. Colors must be valid hex. Fonts must be Google Fonts family names.
Return JSON: {"colors": {"primary","secondary","accent","dark","light","bg","surface","text","muted","white": string}, "fonts": {"heading": string, "body": string}, "radius": number(px), "buttonRadius": number(px), "sectionSpacing": number(px)}`;
}

export const COMPONENTS_SYSTEM = `You are an expert web designer building a page as structured semantic blocks.
Rules:
- Respond with STRICT JSON only.
- Use ONLY these block types: ${BLOCK_TYPES.join(', ')}.
- Every image URL must be a complete https:// URL. Do not invent real-company logos.
- Buttons/links: use relative paths like "/contact" or complete https:// URLs.
- The last block may be a footer with the site navigation links.
- "hero" must have headline + subhead; "stats" 2-4 numeric items; "features" 3-6 items with FontAwesome icon names like "fas fa-award".
- Keep text concise and scannable. No lorem ipsum.`;

export function componentsPrompt(args: {
  briefJson: string; analysisJson: string; designJson: string;
  pageTitle: string; pageGoal?: string; blockTypes: string[]; businessName: string; contactEmail: string; city?: string;
}) {
  return `<step>components</step>
<brief>${args.briefJson}</brief>
<analysis>${args.analysisJson}</analysis>
<design_system>${args.designJson}</design_system>
<page>${JSON.stringify({ title: args.pageTitle, goal: args.pageGoal, allowedBlocks: args.blockTypes })}</page>
Write the content for page "${args.pageTitle}" for business "${args.businessName}" (contact email ${args.contactEmail}).
Use ONLY these blocks on this page, in a sensible order: ${args.blockTypes.join(', ')}.
Return JSON: {"title": string, "slug": string, "blocks": Block[]} where each Block matches its type's schema:
- hero: {type:"hero", background?, badge?, headline, highlight?, subhead?, primaryCta:{label,url}, secondaryCta?, bullets?}
- features: {type:"features", title?, subhead?, columns?:2|3|4, items:[{icon?,title,text}]}
- about: {type:"about", title, body, bullets?, imageSide?:"left"|"right"}
- stats: {type:"stats", items:[{value:number, suffix?, label}]}
- testimonials: {type:"testimonials", title?, items:[{quote,name,role?}]}
- pricing: {type:"pricing", title?, plans:[{name,price,period?,features:string[],ctaLabel,ctaUrl,highlighted?}]}
- cta: {type:"cta", headline, text?, buttonLabel, buttonUrl}
- faq: {type:"faq", title?, items:[{q,a}]}
- contact: {type:"contact", title?, text?, emailTo, submitText?, fields:[{id,label,type:"text"|"email"|"textarea"|"tel",required?,placeholder?}]}
- text: {type:"text", title?, body, align?}
- gallery: {type:"gallery", title?, images:[{url,alt?}]}
- map: {type:"map", address}
- footer: {type:"footer", brand?, tagline?, links?, socials?, copyright?}
background values: "dark"|"light"|"primary"|"gradient"|"surface" (omit for default white). Alternate white/dark/surface sections for visual rhythm.`;
}

export const REVISION_SYSTEM = `You are editing one page of a website. Respond with STRICT JSON only, no prose.`;

export function revisionPrompt(currentSpecJson: string, instruction: string) {
  return `<step>revise</step>
<current_page>${currentSpecJson}</current_page>
<instruction>${instruction}</instruction>
Apply the instruction to the page spec. Keep everything else unchanged. Return the FULL updated page spec JSON in the same schema ({"title","slug","blocks":[...]}).`;
}

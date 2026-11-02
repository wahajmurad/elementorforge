/**
 * Elementor element catalog — the single source of truth for what our
 * generator may emit. Used by: AI output compilation, the SaaS validator,
 * the preview renderer, and mirrored inside the WordPress connector plugin
 * (server-side re-validation before anything touches the customer's DB).
 *
 * Sources of truth:
 *  - developers.elementor.com/docs/data-structure  (element JSON shape)
 *  - Elementor core widget control ids (heading, text-editor, image, button,
 *    image-box, icon-list, form, …) and container layout controls.
 *
 * Rules:
 *  - No custom HTML / shortcode widgets (project mandate: native structures only).
 *  - Pro widgets are only allowed when the target site reports an active Pro license.
 */

export interface WidgetDef {
  widgetType: string;
  pro: boolean;
  label: string;
  /** allowed top-level setting keys; keys ending in * accept responsive suffixes _tablet/_mobile */
  settings: string[];
  /** repeater settings with allowed item fields */
  repeaters?: Record<string, string[]>;
}

const TYPO = [
  'typography_typography', 'typography_font_family', 'typography_font_size', 'typography_font_size_tablet',
  'typography_font_size_mobile', 'typography_font_weight', 'typography_text_transform', 'typography_font_style',
  'typography_line_height', 'typography_letter_spacing',
];

const DIM = (name: string) => [name, `${name}_tablet`, `${name}_mobile`];

export const WIDGETS: Record<string, WidgetDef> = Object.fromEntries([
  {
    widgetType: 'heading', pro: false, label: 'Heading',
    settings: ['title', 'header_size', 'align', ...DIM('align'), 'title_color', ...TYPO],
  },
  {
    widgetType: 'text-editor', pro: false, label: 'Text Editor',
    settings: ['editor', 'text_color', 'drop_cap', ...TYPO],
  },
  {
    widgetType: 'image', pro: false, label: 'Image',
    settings: ['image', 'image_size', 'align', ...DIM('align'), 'width', 'height', 'object_fit', 'border_radius', 'caption_source', 'caption', 'link_to', 'link'],
  },
  {
    widgetType: 'image-box', pro: false, label: 'Image Box',
    settings: ['image', 'image_size', 'title_text', 'description_text', 'position', ...DIM('position'), 'title_size', 'title_color', 'description_color', 'hover_animation', ...TYPO],
  },
  {
    widgetType: 'button', pro: false, label: 'Button',
    settings: ['text', 'link', 'align', ...DIM('align'), 'size', 'button_type', 'button_text_color', 'background_color', 'button_background_hover_color', 'hover_color', 'border_radius', 'border_border', 'border_width', 'border_color', 'selected_icon', 'icon_align', 'icon_indent', ...TYPO],
  },
  {
    widgetType: 'icon', pro: false, label: 'Icon',
    settings: ['selected_icon', 'view', 'shape', 'primary_color', 'secondary_color', 'size', ...DIM('size'), 'align', ...DIM('align'), 'link'],
  },
  {
    widgetType: 'icon-list', pro: false, label: 'Icon List',
    settings: ['icon_list', 'view', 'space_between', ...DIM('space_between'), 'icon_color', 'icon_size', 'text_color', 'text_indent', ...DIM('text_indent'), ...TYPO],
    repeaters: { icon_list: ['text', 'selected_icon', 'link'] },
  },
  {
    widgetType: 'divider', pro: false, label: 'Divider',
    settings: ['style', 'color', 'weight', 'width', 'gap', ...DIM('gap')],
  },
  {
    widgetType: 'spacer', pro: false, label: 'Spacer',
    settings: ['space', 'space_tablet', 'space_mobile'],
  },
  {
    widgetType: 'video', pro: false, label: 'Video',
    settings: ['video_type', 'youtube', 'vimeo', 'dailymotion', 'hosted_url', 'start', 'end', 'autoplay', 'mute', 'loop', 'controls', 'show_image_overlay', 'image_overlay', 'lazy_load'],
  },
  {
    widgetType: 'google_maps', pro: false, label: 'Google Maps',
    settings: ['address', 'zoom', 'height', ...DIM('height'), 'css_filters'],
  },
  {
    widgetType: 'tabs', pro: false, label: 'Tabs',
    settings: ['tabs', 'type', ...TYPO, 'tab_color', 'tab_active_color'],
    repeaters: { tabs: ['tab_id', 'tab_title', 'tab_content'] },
  },
  {
    widgetType: 'accordion', pro: false, label: 'Accordion',
    settings: ['tabs', 'selected_icon', 'selected_active_icon', 'title_color', 'border_color', ...TYPO],
    repeaters: { tabs: ['tab_id', 'tab_title', 'tab_content'] },
  },
  {
    widgetType: 'toggle', pro: false, label: 'Toggle',
    settings: ['tabs', 'selected_icon', 'selected_active_icon', 'title_color', ...TYPO],
    repeaters: { tabs: ['tab_id', 'tab_title', 'tab_content'] },
  },
  {
    widgetType: 'testimonial', pro: false, label: 'Testimonial',
    settings: ['testimonial_content', 'testimonial_image', 'testimonial_name', 'testimonial_job', 'testimonial_image_position', 'testimonial_alignment', 'content_content_color', 'name_text_color', 'job_text_color', ...TYPO],
  },
  {
    widgetType: 'star-rating', pro: false, label: 'Star Rating',
    settings: ['rating_scale', 'rating', 'rating', 'star_color', 'unmarked_star_color', 'align', ...DIM('align')],
  },
  {
    widgetType: 'counter', pro: false, label: 'Counter',
    settings: ['starting_number', 'ending_number', 'prefix', 'suffix', 'duration', 'thousand_separator', 'thousand_sep_char', 'title', 'number_color', 'title_color', ...TYPO],
  },
  {
    widgetType: 'progress', pro: false, label: 'Progress Bar',
    settings: ['title', 'percent', 'display_percentage', 'inner_text', 'bar_color', 'bar_bg_color', 'title_color', 'height', ...DIM('height')],
  },
  {
    widgetType: 'social-icons', pro: false, label: 'Social Icons',
    settings: ['social_icon_list', 'shape', 'align', ...DIM('align'), 'icon_size', 'icon_padding', 'icon_spacing', 'border_radius'],
    repeaters: { social_icon_list: ['social_icon', 'link', '_id'] },
  },
  {
    widgetType: 'animated-headline', pro: false, label: 'Animated Headline',
    settings: ['headline_style', 'before_text', 'highlighted_text', 'rotating_text', 'after_text', 'highlighted_typography', 'highlighted_color', 'after_text_color', 'headline_typography_typography', 'headline_typography_font_family', 'headline_typography_font_size', 'headline_typography_font_size_tablet', 'headline_typography_font_size_mobile', 'headline_typography_font_weight', 'headline_typography_line_height', ...TYPO, 'align', ...DIM('align')],
  },
  // ---------------- Pro widgets (require valid Elementor Pro license) ----------------
  {
    widgetType: 'form', pro: true, label: 'Form (Pro)',
    settings: ['form_name', 'form_fields', 'button_text', 'button_size', 'submit_button_type', 'button_background_color', 'button_text_color', 'button_align', ...DIM('button_align'), 'email_to', 'email_subject', 'email_content', 'email_from', 'email_from_name', 'actions', 'success_message', 'error_message', 'required_message', 'invalid_message', 'form_title'],
    repeaters: { form_fields: ['custom_id', 'field_type', 'field_label', 'placeholder', 'required', 'width', 'options', 'min_date', 'max_date'] },
  },
  {
    widgetType: 'nav-menu', pro: true, label: 'Nav Menu (Pro)',
    settings: ['menu', 'layout', 'pointer', 'color_menu_item', 'color_menu_item_hover', 'color_menu_item_active', 'menu_typography_typography', 'menu_typography_font_family', 'menu_typography_font_size', 'menu_typography_font_weight', 'hamburger_toggle', 'toggle_align', 'dropdown'],
  },
  {
    widgetType: 'theme-site-logo', pro: true, label: 'Site Logo (Pro)',
    settings: ['align', ...DIM('align'), 'image', 'link_to'],
  },
  {
    widgetType: 'theme-page-title', pro: true, label: 'Page Title (Pro)',
    settings: ['align', ...DIM('align'), 'title_color', ...TYPO, 'html_tag'],
  },
  {
    widgetType: 'pricing-table', pro: true, label: 'Pricing Table (Pro)',
    settings: ['heading', 'sub_heading', 'currency_symbol', 'price', 'period', 'features_list', 'button_text', 'link', 'footer_text', 'pricing_table_color_scheme', 'highlight'],
    repeaters: { features_list: ['item_text', 'selected_item_icon'] },
  },
  {
    widgetType: 'slides', pro: true, label: 'Slides (Pro)',
    settings: ['slides', 'navigation', 'autoplay', 'autoplay_speed', 'transition', 'transition_duration'],
    repeaters: { slides: ['_id', 'heading', 'description', 'button_text', 'link', 'background_image', 'background_overlay'] },
  },
  {
    widgetType: 'search-form', pro: true, label: 'Search Form (Pro)',
    settings: ['placeholder', 'button_text', 'input_size'],
  },
].map(w => [w.widgetType, w as WidgetDef]));

export const FORBIDDEN_WIDGETS = new Set(['html', 'shortcode', 'text-path', 'code-highlight']);

export const CONTAINER_SETTINGS: string[] = [
  'content_width', 'flex_direction', 'flex_wrap', 'justify_content', 'align_items', 'flex_gap',
  'width', 'max_width', 'min_height', 'height', 'overflow', '_title', '_element_id',
  'css_classes', 'z_index', 'flex_align_self', 'flex_shrink', 'flex_grow',
  // responsive variants
  'flex_direction_tablet', 'flex_direction_mobile', 'flex_wrap_tablet', 'flex_wrap_mobile',
  'justify_content_tablet', 'justify_content_mobile', 'align_items_tablet', 'align_items_mobile',
  'flex_gap_tablet', 'flex_gap_mobile', 'content_width_tablet', 'content_width_mobile',
  'width_tablet', 'width_mobile', 'max_width_tablet', 'max_width_mobile', 'min_height_tablet', 'min_height_mobile',
  // background
  'background_background', 'background_color', 'background_color_stop', 'background_color_b',
  'background_color_b_stop', 'background_gradient_type', 'background_gradient_angle',
  'background_image', 'background_size', 'background_position', 'background_attachment', 'background_repeat',
  'background_overlay_background', 'background_overlay_color', 'background_overlay_opacity',
  'background_video_link', 'background_overlay_color_stop', 'background_overlay_color_b', 'background_overlay_gradient_angle',
  // border + shadow
  'border_border', 'border_width', 'border_color', 'border_radius',
  'box_shadow_box_shadow_type', 'box_shadow_box_shadow',
  ...TYPO,
  // misc
  'animation', 'hover_animation', 'entrance_animation', 'shape_divider_top', 'shape_divider_bottom',
  'link',
  // dimension boxes
  ...DIM('padding'), ...DIM('margin'),
];

export const EL_TYPES = ['container', 'widget'] as const;
export type ElType = (typeof EL_TYPES)[number];

export const MAX_DEPTH = 6;
export const MAX_NODES = 400;

export function isResponsiveKey(key: string, allowed: string[]): boolean {
  for (const base of allowed) {
    if (key === base) return true;
    if (key.startsWith(`${base}_tablet`) || key.startsWith(`${base}_mobile`)) return true;
  }
  return false;
}

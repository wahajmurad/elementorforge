<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Native Elementor writer.
 *
 * Writes a complete, editable Elementor page:
 *   - _elementor_data           the JSON tree (containers + widgets only)
 *   - _elementor_edit_mode      'builder'  ← without this Elementor ignores
 *                               the page and renders an empty theme template
 *   - _elementor_template_type  'wp-page'
 *   - _elementor_version        this site's Elementor version
 *   - _elementor_page_settings  page-level settings JSON
 *   - _wp_page_template         elementor_header_footer (or canvas)
 * Then regenerates the page CSS so the frontend renders immediately.
 *
 * The incoming tree is RE-VALIDATED here against the same whitelist the SaaS
 * uses — the SaaS is never trusted blindly (defense in depth).
 */
class AEFC_Elementor {

        /** Elementor core (free) widgets this connector may write. */
        public static function widget_catalog() {
                return array(
                        // free
                        'heading' => array( 'title', 'header_size', 'align', 'align_tablet', 'align_mobile', 'title_color', 'typography_typography', 'typography_font_family', 'typography_font_size', 'typography_font_size_tablet', 'typography_font_size_mobile', 'typography_font_weight', 'typography_text_transform', 'typography_font_style', 'typography_line_height', 'typography_letter_spacing' ),
                        'text-editor' => array( 'editor', 'text_color', 'drop_cap', 'typography_typography', 'typography_font_family', 'typography_font_size', 'typography_font_size_tablet', 'typography_font_size_mobile', 'typography_font_weight', 'typography_line_height' ),
                        'image' => array( 'image', 'image_size', 'align', 'align_tablet', 'align_mobile', 'width', 'height', 'object_fit', 'border_radius', 'caption_source', 'caption', 'link_to', 'link' ),
                        'image-box' => array( 'image', 'image_size', 'title_text', 'description_text', 'position', 'position_tablet', 'position_mobile', 'title_size', 'title_color', 'description_color', 'hover_animation', 'typography_typography', 'typography_font_family' ),
                        'button' => array( 'text', 'link', 'align', 'align_tablet', 'align_mobile', 'size', 'button_type', 'button_text_color', 'background_color', 'button_background_hover_color', 'hover_color', 'border_radius', 'selected_icon', 'icon_align', 'icon_indent', 'typography_typography', 'typography_font_family', 'typography_font_weight' ),
                        'icon' => array( 'selected_icon', 'view', 'shape', 'primary_color', 'secondary_color', 'size', 'size_tablet', 'size_mobile', 'align', 'align_tablet', 'align_mobile', 'link' ),
                        'icon-list' => array( 'icon_list', 'view', 'space_between', 'space_between_tablet', 'space_between_mobile', 'icon_color', 'icon_size', 'text_color', 'text_indent', 'text_indent_tablet', 'text_indent_mobile', 'typography_typography' ),
                        'divider' => array( 'style', 'color', 'weight', 'width', 'gap', 'gap_tablet', 'gap_mobile' ),
                        'spacer' => array( 'space', 'space_tablet', 'space_mobile' ),
                        'video' => array( 'video_type', 'youtube', 'vimeo', 'dailymotion', 'hosted_url', 'start', 'end', 'autoplay', 'mute', 'loop', 'controls', 'show_image_overlay', 'image_overlay', 'lazy_load' ),
                        'google_maps' => array( 'address', 'zoom', 'height', 'height_tablet', 'height_mobile', 'css_filters' ),
                        'tabs' => array( 'tabs', 'type', 'typography_typography', 'typography_font_family', 'tab_color', 'tab_active_color' ),
                        'accordion' => array( 'tabs', 'selected_icon', 'selected_active_icon', 'title_color', 'border_color', 'typography_typography', 'typography_font_family', 'typography_font_size' ),
                        'toggle' => array( 'tabs', 'selected_icon', 'selected_active_icon', 'title_color', 'typography_typography' ),
                        'testimonial' => array( 'testimonial_content', 'testimonial_image', 'testimonial_name', 'testimonial_job', 'testimonial_image_position', 'testimonial_alignment', 'content_content_color', 'name_text_color', 'job_text_color', 'typography_typography' ),
                        'star-rating' => array( 'rating_scale', 'rating', 'star_color', 'unmarked_star_color', 'align', 'align_tablet', 'align_mobile' ),
                        'counter' => array( 'starting_number', 'ending_number', 'prefix', 'suffix', 'duration', 'thousand_separator', 'thousand_sep_char', 'title', 'number_color', 'title_color', 'typography_typography', 'typography_font_family', 'typography_font_size', 'typography_font_weight' ),
                        'progress' => array( 'title', 'percent', 'display_percentage', 'inner_text', 'bar_color', 'bar_bg_color', 'title_color', 'height', 'height_tablet', 'height_mobile' ),
                        'social-icons' => array( 'social_icon_list', 'shape', 'align', 'align_tablet', 'align_mobile', 'icon_size', 'icon_padding', 'icon_spacing', 'border_radius' ),
                        'animated-headline' => array( 'headline_style', 'before_text', 'highlighted_text', 'rotating_text', 'after_text', 'headline_typography', 'typography_typography', 'align', 'align_tablet', 'align_mobile' ),
                        // pro — only when the site has an active Pro license
                        'form' => array( 'form_name', 'form_fields', 'button_text', 'button_size', 'submit_button_type', 'button_background_color', 'button_text_color', 'button_align', 'button_align_tablet', 'button_align_mobile', 'email_to', 'email_subject', 'email_content', 'email_from', 'email_from_name', 'actions', 'success_message', 'error_message', 'required_message', 'invalid_message', 'form_title' ),
                        'nav-menu' => array( 'menu', 'layout', 'pointer', 'color_menu_item', 'color_menu_item_hover', 'color_menu_item_active', 'menu_typography_typography', 'menu_typography_font_family', 'menu_typography_font_size', 'menu_typography_font_weight', 'hamburger_toggle', 'toggle_align', 'dropdown' ),
                        'theme-site-logo' => array( 'align', 'align_tablet', 'align_mobile', 'image', 'link_to' ),
                        'theme-page-title' => array( 'align', 'align_tablet', 'align_mobile', 'title_color', 'typography_typography', 'html_tag' ),
                        'pricing-table' => array( 'heading', 'sub_heading', 'currency_symbol', 'price', 'period', 'features_list', 'button_text', 'link', 'footer_text', 'pricing_table_color_scheme', 'highlight' ),
                        'slides' => array( 'slides', 'navigation', 'autoplay', 'autoplay_speed', 'transition', 'transition_duration' ),
                        'search-form' => array( 'placeholder', 'button_text', 'input_size' ),
                );
        }

        /**
         * Allowed fields per repeater setting (items additionally always carry _id).
         */
        public static function repeater_fields() {
                return array(
                        'icon_list'        => array( 'text', 'selected_icon', 'link' ),
                        'tabs'             => array( 'tab_id', 'tab_title', 'tab_content' ),
                        'form_fields'      => array( 'custom_id', 'field_type', 'field_label', 'placeholder', 'required', 'width', 'options', 'field_options', 'min_date', 'max_date' ),
                        'social_icon_list' => array( 'social_icon', 'link' ),
                        'features_list'    => array( 'item_text', 'selected_item_icon' ),
                        'slides'           => array( 'heading', 'description', 'button_text', 'link', 'background_image', 'background_overlay' ),
                );
        }

        private static function pro_widgets() {
                return array( 'form', 'nav-menu', 'theme-site-logo', 'theme-page-title', 'pricing-table', 'slides', 'search-form' );
        }

        /** Container setting whitelist (shared by all containers). */
        private static function container_settings() {
                return array(
                        'content_width', 'content_width_tablet', 'content_width_mobile', 'flex_direction', 'flex_direction_tablet', 'flex_direction_mobile',
                        'flex_wrap', 'flex_wrap_tablet', 'flex_wrap_mobile', 'justify_content', 'justify_content_tablet', 'justify_content_mobile',
                        'align_items', 'align_items_tablet', 'align_items_mobile', 'flex_gap', 'flex_gap_tablet', 'flex_gap_mobile',
                        'width', 'width_tablet', 'width_mobile', 'max_width', 'max_width_tablet', 'max_width_mobile', 'min_height', 'min_height_tablet', 'min_height_mobile',
                        'overflow', '_title', '_element_id', 'css_classes', 'z_index', 'flex_align_self', 'flex_shrink', 'flex_grow',
                        'background_background', 'background_color', 'background_color_stop', 'background_color_b', 'background_color_b_stop',
                        'background_gradient_type', 'background_gradient_angle', 'background_image', 'background_size', 'background_position',
                        'background_attachment', 'background_repeat', 'background_overlay_background', 'background_overlay_color', 'background_overlay_opacity',
                        'background_overlay_color_stop', 'background_overlay_color_b', 'background_overlay_gradient_angle', 'background_video_link',
                        'border_border', 'border_width', 'border_color', 'border_radius', 'box_shadow_box_shadow_type', 'box_shadow_box_shadow',
                        'padding', 'padding_tablet', 'padding_mobile', 'margin', 'margin_tablet', 'margin_mobile',
                        'typography_typography', 'typography_font_family', 'animation', 'hover_animation', 'entrance_animation',
                        'shape_divider_top', 'shape_divider_bottom', 'link',
                );
        }

        /**
         * Validate an incoming Elementor tree. Returns array of error strings (empty = valid).
         */
        public static function validate_tree( $tree, $allow_pro ) {
                $errors   = array();
                $catalog  = self::widget_catalog();
                $pro      = self::pro_widgets();
                $allowed_container = self::container_settings();
                $nodes    = 0;
                $max      = 400;

                $check_url = function ( $url, $path ) use ( &$errors ) {
                        if ( ! is_string( $url ) || '' === $url ) { return; }
                        if ( preg_match( '/^(https?:\/\/|\/|#|mailto:|tel:)/i', $url ) !== 1 ) {
                                $errors[] = "Blocked URL at {$path}: " . substr( $url, 0, 60 );
                        }
                };

                $walk = function ( $node, $path, $depth ) use ( &$walk, &$errors, &$nodes, $catalog, $pro, $allowed_container, $allow_pro, $check_url, $max ) {
                        $nodes++;
                        if ( $nodes > $max ) { $errors[] = 'Structure exceeds 400 elements'; return; }
                        if ( $depth > 6 ) { $errors[] = "Nesting deeper than 6 levels at {$path}"; return; }
                        if ( ! is_array( $node ) || ! isset( $node['elType'] ) ) { $errors[] = "Element missing elType at {$path}"; return; }

                        if ( 'container' === $node['elType'] ) {
                                $settings = isset( $node['settings'] ) && is_array( $node['settings'] ) ? $node['settings'] : array();
                                foreach ( array_keys( $settings ) as $key ) {
                                        if ( ! in_array( $key, $allowed_container, true ) ) {
                                                $errors[] = "Unknown container setting '{$key}' at {$path}";
                                        }
                                }
                                if ( isset( $settings['background_image']['url'] ) ) { $check_url( $settings['background_image']['url'], "{$path}.background_image" ); }
                                $children = isset( $node['elements'] ) && is_array( $node['elements'] ) ? $node['elements'] : array();
                                foreach ( $children as $i => $child ) { $walk( $child, "{$path}.elements[{$i}]", $depth + 1 ); }
                                return;
                        }

                        if ( 'widget' !== $node['elType'] ) {
                                $errors[] = "Unsupported elType '{$node['elType']}' at {$path} (legacy sections/columns are not accepted)";
                                return;
                        }

                        $widget = isset( $node['widgetType'] ) ? (string) $node['widgetType'] : '';
                        if ( '' === $widget || ! isset( $catalog[ $widget ] ) ) {
                                $errors[] = "Widget '{$widget}' is not supported at {$path}";
                                return;
                        }
                        if ( in_array( $widget, $pro, true ) && ! $allow_pro ) {
                                $errors[] = "Widget '{$widget}' requires Elementor Pro with an active license at {$path}";
                                return;
                        }
                        $settings = isset( $node['settings'] ) && is_array( $node['settings'] ) ? $node['settings'] : array();
                        $allowed  = $catalog[ $widget ];
                        foreach ( array_keys( $settings ) as $key ) {
                                $ok = false;
                                foreach ( $allowed as $a ) {
                                        if ( $key === $a || 0 === strpos( $key, $a . '_tablet' ) || 0 === strpos( $key, $a . '_mobile' ) ) { $ok = true; break; }
                                }
                                if ( ! $ok ) { $errors[] = "Unknown setting '{$key}' for widget '{$widget}' at {$path}"; }
                        }
                        // repeaters
                        foreach ( array( 'icon_list', 'tabs', 'form_fields', 'social_icon_list', 'features_list', 'slides' ) as $rep ) {
                                if ( isset( $settings[ $rep ] ) && is_array( $settings[ $rep ] ) ) {
                                        $allowed_fields = self::repeater_fields()[ $rep ] ?? array();
                                        foreach ( $settings[ $rep ] as $ri => $item ) {
                                                if ( ! is_array( $item ) ) { $errors[] = "Repeater {$rep}[{$ri}] must be an object"; continue; }
                                                foreach ( array_keys( $item ) as $ik ) {
                                                        // Elementor assigns a unique _id to every repeater item
                                                        if ( '_id' !== $ik && ! in_array( $ik, $allowed_fields, true ) ) {
                                                                $errors[] = "Unknown repeater field '{$ik}' in {$rep} at {$path}";
                                                        }
                                                }
                                                if ( isset( $item['link']['url'] ) ) { $check_url( $item['link']['url'], "{$path}.{$rep}[{$ri}].link" ); }
                                        }
                                }
                        }
                        if ( 'text-editor' === $widget && isset( $settings['editor'] ) && is_string( $settings['editor'] ) ) {
                                if ( preg_match( '/<\s*(script|iframe|object|embed|link|style|meta)/i', $settings['editor'] ) ) {
                                        $errors[] = "text-editor content contains forbidden tags at {$path}";
                                }
                        }
                        if ( isset( $settings['link']['url'] ) ) { $check_url( $settings['link']['url'], "{$path}.link" ); }
                };

                if ( ! is_array( $tree ) || ( isset( $tree[0] ) && ! is_array( $tree[0] ) ) || empty( array_filter( array_keys( $tree ), 'is_int' ) ) ) {
                        $errors[] = 'Root of _elementor_data must be a JSON array of elements';
                        return $errors;
                }
                foreach ( $tree as $i => $top ) { $walk( $top, "\$[{$i}]", 1 ); }
                return $errors;
        }

        /**
         * Create a draft page with full Elementor data. Returns [ok, page_id, hash, edit_url, preview_url, slug] or [ok=false, error].
         */
        public static function create_page( $args ) {
                $title   = isset( $args['title'] ) ? sanitize_text_field( $args['title'] ) : 'Untitled';
                $slug    = isset( $args['slug'] ) ? sanitize_title( $args['slug'] ) : sanitize_title( $title );
                $template = isset( $args['template'] ) ? $args['template'] : 'elementor_header_footer';
                $tree    = isset( $args['elementorData'] ) ? json_decode( wp_json_encode( $args['elementorData'] ), true ) : null;
                $settings = isset( $args['pageSettings'] ) && is_array( $args['pageSettings'] ) ? $args['pageSettings'] : array();

                if ( ! is_array( $tree ) || empty( $tree ) ) {
                        return array( 'ok' => false, 'error' => 'elementorData must be a non-empty JSON array' );
                }
                $errors = self::validate_tree( $tree, self::pro_allowed() );
                if ( ! empty( $errors ) ) {
                        return array( 'ok' => false, 'error' => 'Elementor validation failed: ' . implode( ' | ', array_slice( $errors, 0, 4 ) ) );
                }

                // Never overwrite an existing page silently — slugs get -2, -3 suffixes (WP default)
                $post_id = wp_insert_post(
                        array(
                                'post_title'  => $title,
                                'post_name'   => $slug,
                                'post_status' => 'draft',
                                'post_type'   => 'page',
                                'post_author' => self::service_user_id(),
                        ),
                        true
                );
                if ( is_wp_error( $post_id ) ) {
                        return array( 'ok' => false, 'error' => $post_id->get_error_message() );
                }

                self::write_elementor_data( $post_id, $tree, $settings, $template );
                AEFC_Logger::log( 'info', 'page.created', sprintf( 'Draft page #%d "%s" created via SaaS', $post_id, $title ) );

                return array(
                        'ok'         => true,
                        'pageId'     => (int) $post_id,
                        'slug'       => get_post_field( 'post_name', $post_id ),
                        'hash'       => self::hash_tree( $tree ),
                        'editUrl'    => admin_url( 'post.php?post=' . $post_id . '&action=elementor' ),
                        'previewUrl' => get_preview_post_link( $post_id ),
                );
        }

        public static function update_page( $post_id, $args ) {
                $guarded = AEFC_Security::assert_managed( $post_id );
                if ( is_wp_error( $guarded ) ) { return array( 'ok' => false, 'error' => $guarded->get_error_message() ); }

                if ( isset( $args['title'] ) ) {
                        wp_update_post( array( 'ID' => $post_id, 'post_title' => sanitize_text_field( $args['title'] ) ) );
                }
                if ( isset( $args['elementorData'] ) ) {
                        $tree = json_decode( wp_json_encode( $args['elementorData'] ), true );
                        $errors = self::validate_tree( $tree, self::pro_allowed() );
                        if ( ! empty( $errors ) ) {
                                return array( 'ok' => false, 'error' => 'Elementor validation failed: ' . implode( ' | ', array_slice( $errors, 0, 4 ) ) );
                        }
                        // automatic pre-update snapshot for rollback
                        self::store_snapshot( $post_id );
                        $settings = isset( $args['pageSettings'] ) && is_array( $args['pageSettings'] ) ? $args['pageSettings'] : array();
                        self::write_elementor_data( $post_id, $tree, $settings, null );
                        AEFC_Logger::log( 'info', 'page.updated', sprintf( 'Page #%d updated via SaaS', $post_id ) );
                        return array( 'ok' => true, 'pageId' => (int) $post_id, 'hash' => self::hash_tree( $tree ) );
                }
                return array( 'ok' => true, 'pageId' => (int) $post_id );
        }

        public static function publish_page( $post_id ) {
                $guarded = AEFC_Security::assert_managed( $post_id );
                if ( is_wp_error( $guarded ) ) { return array( 'ok' => false, 'error' => $guarded->get_error_message() ); }
                $result = wp_update_post( array( 'ID' => $post_id, 'post_status' => 'publish' ), true );
                if ( is_wp_error( $result ) ) { return array( 'ok' => false, 'error' => $result->get_error_message() ); }
                AEFC_Logger::log( 'info', 'page.published', sprintf( 'Page #%d published via SaaS', $post_id ) );
                return array( 'ok' => true, 'pageId' => (int) $post_id, 'status' => 'publish' );
        }

        public static function read_page( $post_id ) {
                $post = get_post( $post_id );
                if ( ! $post || 'page' !== $post->post_type ) { return array( 'ok' => false, 'error' => 'Page not found' ); }
                $data = get_post_meta( $post_id, '_elementor_data', true );
                $tree = json_decode( (string) $data, true );
                return array(
                        'ok'   => true,
                        'page' => array(
                                'id'            => (int) $post_id,
                                'title'         => $post->post_title,
                                'slug'          => $post->post_name,
                                'status'        => $post->post_status,
                                'elementorData' => $tree,
                                'hash'          => self::hash_tree( $tree ),
                                'modified'      => $post->post_modified_gmt,
                        ),
                );
        }

        private static function write_elementor_data( $post_id, $tree, $settings, $template ) {
                update_post_meta( $post_id, '_elementor_edit_mode', 'builder' );
                update_post_meta( $post_id, '_elementor_template_type', 'wp-page' );
                if ( defined( 'ELEMENTOR_VERSION' ) ) {
                        update_post_meta( $post_id, '_elementor_version', ELEMENTOR_VERSION );
                }
                update_post_meta( $post_id, '_elementor_data', wp_slash( wp_json_encode( $tree ) ) );
                update_post_meta( $post_id, '_elementor_page_settings', wp_slash( wp_json_encode( $settings ) ) );
                if ( $template && in_array( $template, array( 'elementor_header_footer', 'elementor_canvas', 'default' ), true ) ) {
                        update_post_meta( $post_id, '_wp_page_template', $template );
                }
                update_post_meta( $post_id, '_aelc_managed', '1' );
                delete_post_meta( $post_id, '_elementor_css' );

                // Regenerate Elementor page CSS so the draft renders correctly immediately.
                if ( class_exists( '\Elementor\Core\Files\CSS\Post' ) ) {
                        try {
                                $css_file = new \Elementor\Core\Files\CSS\Post( $post_id );
                                $css_file->update();
                        } catch ( \Throwable $e ) {
                                AEFC_Logger::log( 'warn', 'css.regenerate', $e->getMessage() );
                        }
                }
        }

        public static function hash_tree( $tree ) {
                return hash( 'sha256', wp_json_encode( $tree ) );
        }

        private static function pro_allowed() {
                return AEFC_Diagnostics::pro_license_active();
        }

        private static function service_user_id() {
                // Attribute SaaS-created pages to the connector's own service account
                // so edits are never attributed to a real admin.
                $existing = get_option( 'aefc_service_user_id' );
                if ( $existing && get_user_by( 'id', $existing ) ) { return (int) $existing; }
                $user_id = wp_insert_user(
                        array(
                                'user_login' => 'elementorforge-service',
                                'user_pass'  => wp_generate_password( 32, true, true ),
                                'user_email' => 'elementorforge-service@localhost',
                                'role'       => 'editor',
                        )
                );
                if ( is_wp_error( $user_id ) ) { return get_current_user_id() ?: 0; }
                update_option( 'aefc_service_user_id', (int) $user_id );
                return (int) $user_id;
        }

        // ------------------------------------------------------------- snapshots

        public static function store_snapshot( $post_id ) {
                $data = get_post_meta( $post_id, '_elementor_data', true );
                $snapshots = get_post_meta( $post_id, '_aelc_snapshots', true );
                if ( ! is_array( $snapshots ) ) { $snapshots = array(); }
                $snapshots[] = array(
                        'id'        => wp_generate_uuid4(),
                        'hash'      => self::hash_tree( json_decode( (string) $data, true ) ),
                        'data'      => $data,
                        'createdAt' => gmdate( 'c' ),
                        'revision'  => count( $snapshots ) + 1,
                );
                if ( count( $snapshots ) > 10 ) { array_shift( $snapshots ); }
                update_post_meta( $post_id, '_aelc_snapshots', $snapshots );
                $latest = end( $snapshots );
                return array( 'ok' => true, 'snapshotId' => $latest['id'], 'hash' => $latest['hash'], 'revision' => $latest['revision'] );
        }

        public static function list_snapshots( $post_id ) {
                $snapshots = get_post_meta( $post_id, '_aelc_snapshots', true );
                $out = array();
                foreach ( (array) $snapshots as $s ) {
                        $out[] = array( 'snapshotId' => $s['id'], 'hash' => $s['hash'], 'createdAt' => $s['createdAt'], 'revision' => $s['revision'] );
                }
                return array( 'ok' => true, 'snapshots' => $out );
        }

        public static function restore_snapshot( $post_id, $snapshot_id ) {
                $guarded = AEFC_Security::assert_managed( $post_id );
                if ( is_wp_error( $guarded ) ) { return array( 'ok' => false, 'error' => $guarded->get_error_message() ); }
                $snapshots = get_post_meta( $post_id, '_aelc_snapshots', true );
                foreach ( (array) $snapshots as $s ) {
                        if ( hash_equals( (string) $s['id'], (string) $snapshot_id ) ) {
                                $tree = json_decode( (string) $s['data'], true );
                                self::write_elementor_data( $post_id, $tree, array(), null );
                                AEFC_Logger::log( 'info', 'page.restored', sprintf( 'Page #%d restored to snapshot %s', $post_id, $snapshot_id ) );
                                return array( 'ok' => true, 'pageId' => (int) $post_id, 'hash' => self::hash_tree( $tree ) );
                        }
                }
                return array( 'ok' => false, 'error' => 'Snapshot not found' );
        }

        public static function delete_page( $post_id ) {
                $guarded = AEFC_Security::assert_managed( $post_id );
                if ( is_wp_error( $guarded ) ) { return array( 'ok' => false, 'error' => $guarded->get_error_message() ); }
                $status = get_post_status( $post_id );
                if ( 'publish' === $status ) {
                        return array( 'ok' => false, 'error' => 'Refusing to delete a published page. Move it to draft first.' );
                }
                wp_trash_post( $post_id );
                AEFC_Logger::log( 'info', 'page.trashed', sprintf( 'Managed draft page #%d moved to trash', $post_id ) );
                return array( 'ok' => true, 'deleted' => (int) $post_id );
        }
}

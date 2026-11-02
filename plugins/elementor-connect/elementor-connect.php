<?php
/**
 * Plugin Name: ElementorForge Connect
 * Plugin URI:  https://elementorforge.example
 * Description: Securely pairs this WordPress site with the ElementorForge SaaS so AI agents can create native, editable Elementor pages as drafts. Requires Elementor (free) for page rendering; Elementor Pro features require a valid Pro license on this site.
 * Version:     1.0.0
 * Author:      ElementorForge
 * License:     GPL-2.0-or-later
 * Text Domain: elementorforge-connect
 *
 * Security model (server-to-server):
 *  - Pairing: one-time code exchanged for a site key + HMAC secret (HTTPS only).
 *  - Every SaaS request is authenticated with X-AELC-Key + HMAC-SHA256
 *    signature over (METHOD, path, sha256(body), timestamp) with a ±300s
 *    replay window and per-key rate limiting.
 *  - Capability checks: pairing/admin actions require manage_options and use
 *    WordPress nonces. Machine REST calls are HMAC-authenticated (nonces do
 *    not apply to non-session traffic) and additionally rate-limited.
 *  - Least privilege: the connector can only create/edit/publish pages it
 *    manages (meta _aelc_managed=1) and only writes native Elementor data.
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

define( 'AEFC_VERSION', '1.0.0' );
define( 'AEFC_MIN_PHP', '7.4' );
define( 'AEFC_MIN_ELEMENTOR', '3.6.0' );
define( 'AEFC_OPT_CREDENTIALS', 'aefc_credentials' );
define( 'AEFC_OPT_UNINSTALL_PURGE', 'aefc_uninstall_purge' );
define( 'AEFC_OPT_UNINSTALL_DELETE_CONTENT', 'aefc_uninstall_delete_content' );
define( 'AEFC_TABLE_LOG', 'aefc_log' );

if ( version_compare( PHP_VERSION, AEFC_MIN_PHP, '<' ) ) {
        add_action( 'admin_notices', function () {
                echo '<div class="notice notice-error"><p>ElementorForge Connect requires PHP ' . esc_html( AEFC_MIN_PHP ) . '+.</p></div>';
        } );
        return;
}

define( 'AEFC_PLUGIN_FILE', __FILE__ );
define( 'AEFC_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );

require_once AEFC_PLUGIN_DIR . 'includes/class-aefc-logger.php';
require_once AEFC_PLUGIN_DIR . 'includes/class-aefc-security.php';
require_once AEFC_PLUGIN_DIR . 'includes/class-aefc-elementor.php';
require_once AEFC_PLUGIN_DIR . 'includes/class-aefc-diagnostics.php';
require_once AEFC_PLUGIN_DIR . 'includes/class-aefc-rest.php';
require_once AEFC_PLUGIN_DIR . 'includes/class-aefc-pairing.php';

/**
 * Main plugin bootstrap.
 */
final class AEFC_Plugin {

        public static function init() {
                AEFC_Logger::init();
                AEFC_Rest::init();
                AEFC_Pairing::init();

                register_activation_hook( AEFC_PLUGIN_FILE, array( __CLASS__, 'activate' ) );
        }

        public static function activate() {
                AEFC_Logger::create_table();
        }

        /** @return array{site_key:string,secret:string,saas_url:string}|null */
        public static function credentials() {
                $creds = get_option( AEFC_OPT_CREDENTIALS );
                if ( ! is_array( $creds ) || empty( $creds['site_key'] ) || empty( $creds['secret'] ) || empty( $creds['saas_url'] ) ) {
                        return null;
                }
                return array(
                        'site_key' => (string) $creds['site_key'],
                        'secret'   => (string) $creds['secret'],
                        'saas_url' => untrailingslashit( (string) $creds['saas_url'] ),
                );
        }
}

AEFC_Plugin::init();

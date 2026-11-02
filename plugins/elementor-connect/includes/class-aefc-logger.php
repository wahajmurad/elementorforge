<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Append-only audit log in a custom table. Records pairing changes and every
 * confirmed SaaS-driven page mutation with the caller's IP for forensics.
 */
class AEFC_Logger {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'register_log_page' ), 30 );
	}

	public static function create_table() {
		global $wpdb;
		$table = $wpdb->prefix . AEFC_TABLE_LOG;
		$charset = $wpdb->get_charset_collate();
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		dbDelta(
			"CREATE TABLE {$table} (
				id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
				created_at DATETIME NOT NULL,
				level VARCHAR(10) NOT NULL DEFAULT 'info',
				action VARCHAR(64) NOT NULL,
				details TEXT NULL,
				ip VARCHAR(64) NULL,
				PRIMARY KEY (id),
				KEY created_at (created_at)
			) {$charset};"
		);
	}

	public static function log( $level, $action, $details = '' ) {
		global $wpdb;
		$wpdb->insert(
			$wpdb->prefix . AEFC_TABLE_LOG,
			array(
				'created_at' => current_time( 'mysql', true ),
				'level'      => substr( (string) $level, 0, 10 ),
				'action'     => substr( (string) $action, 0, 64 ),
				'details'    => substr( (string) $details, 0, 4000 ),
				'ip'         => isset( $_SERVER['REMOTE_ADDR'] ) ? substr( sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ), 0, 64 ) : '',
			),
			array( '%s', '%s', '%s', '%s', '%s' )
		);
	}

	public static function recent( $limit = 50 ) {
		global $wpdb;
		$table = $wpdb->prefix . AEFC_TABLE_LOG;
		return $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$table} ORDER BY id DESC LIMIT %d", $limit ),
			ARRAY_A
		);
	}

	public static function register_log_page() {
		add_submenu_page(
			'elementorforge-connect',
			'Audit Log',
			'Audit Log',
			'manage_options',
			'elementorforge-connect-log',
			array( __CLASS__, 'render' )
		);
	}

	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) { return; }
		$rows = self::recent( 100 );
		echo '<div class="wrap"><h1>ElementorForge — Audit Log</h1>';
		echo '<table class="widefat striped"><thead><tr><th>Time (UTC)</th><th>Level</th><th>Action</th><th>Details</th><th>IP</th></tr></thead><tbody>';
		foreach ( $rows as $row ) {
			printf(
				'<tr><td>%s</td><td>%s</td><td><code>%s</code></td><td>%s</td><td>%s</td></tr>',
				esc_html( $row['created_at'] ),
				esc_html( $row['level'] ),
				esc_html( $row['action'] ),
				esc_html( $row['details'] ),
				esc_html( $row['ip'] )
			);
		}
		echo '</tbody></table></div>';
	}
}

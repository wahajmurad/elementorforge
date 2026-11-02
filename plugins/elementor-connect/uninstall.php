<?php
/**
 * Uninstall cleanup for ElementorForge Connect.
 *
 * Default behavior: remove NOTHING content-related. Only plugin-owned data
 * (credentials, audit table, service user) is removed, and only when the
 * admin explicitly opted in via the plugin settings page.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) { exit; }

$purge_data    = get_option( 'aefc_uninstall_purge', '0' ) === '1';
$delete_pages  = get_option( 'aefc_uninstall_delete_content', '0' ) === '1';

// Plugin-owned data ---------------------------------------------------------
delete_option( 'aefc_credentials' );
delete_option( 'aefc_uninstall_purge' );
delete_option( 'aefc_uninstall_delete_content' );
delete_option( 'aefc_service_user_id' );

global $wpdb;
$log_table = $wpdb->prefix . 'aefc_log';
// phpcs:ignore WordPress.DB.DirectDatabaseQuery
$wpdb->query( "DROP TABLE IF EXISTS {$log_table}" );

// Customer content ----------------------------------------------------------
// Only with explicit double authorization: purge + delete_content, and only
// MANAGED DRAFTS (meta _aelc_managed=1, status != publish). Elementor page
// data on live/published pages is never removed by the connector.
if ( $purge_data && $delete_pages ) {
	$managed_ids = $wpdb->get_col(
		"SELECT p.ID FROM {$wpdb->posts} p
		 INNER JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = '_aelc_managed' AND m.meta_value = '1'
		 WHERE p.post_type = 'page' AND p.post_status IN ('draft','pending','auto-draft')"
	);
	foreach ( (array) $managed_ids as $pid ) {
		wp_delete_post( (int) $pid, true );
	}
	// Clean leftover connector meta on any remaining managed pages
	$wpdb->query( "DELETE FROM {$wpdb->postmeta} WHERE meta_key IN ('_aelc_managed','_aelc_snapshots')" );
}

$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}aefc_log" );

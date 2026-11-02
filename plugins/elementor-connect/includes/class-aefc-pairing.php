<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Admin UI: pairing with the SaaS, connection status, diagnostics,
 * disconnect, and data/removal controls. All actions require
 * manage_options + nonces (browser-session protection).
 */
class AEFC_Pairing {

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_post_aefc_pair', array( __CLASS__, 'handle_pair' ) );
		add_action( 'admin_post_aefc_disconnect', array( __CLASS__, 'handle_disconnect' ) );
		add_action( 'admin_post_aefc_settings', array( __CLASS__, 'handle_settings' ) );
		add_action( 'admin_notices', array( __CLASS__, 'compatibility_notice' ) );
	}

	public static function menu() {
		add_menu_page(
			'ElementorForge Connect',
			'ElementorForge',
			'manage_options',
			'elementorforge-connect',
			array( __CLASS__, 'render_page' ),
			'dashicons-cloud',
			58
		);
	}

	public static function compatibility_notice() {
		if ( ! defined( 'ELEMENTOR_VERSION' ) && current_user_can( 'activate_plugins' ) ) {
			$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
			if ( $screen && false !== strpos( (string) $screen->id, 'elementorforge' ) ) {
				echo '<div class="notice notice-warning"><p><strong>Elementor is not active.</strong> ElementorForge Connect pairs fine, but AI-generated pages need Elementor (free) installed and active to render.</p></div>';
			}
		}
	}

	private static function saas_url() {
		$creds = AEFC_Plugin::credentials();
		return $creds ? $creds['saas_url'] : '';
	}

	public static function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) { return; }
		$creds   = AEFC_Plugin::credentials();
		$diag    = AEFC_Diagnostics::report();
		$paired  = (bool) $creds;
		?>
		<div class="wrap">
			<h1>ElementorForge Connect <span style="font-weight:400;color:#666">v<?php echo esc_html( AEFC_VERSION ); ?></span></h1>

			<div class="card" style="max-width:760px;padding:16px 20px">
				<h2 style="margin-top:0">Connection status</h2>
				<table class="widefat striped" style="max-width:720px">
					<tbody>
						<tr><td><strong>SaaS pairing</strong></td><td><?php echo $paired ? '<span style="color:#00a32a">● Connected</span> — ' . esc_html( $creds['saas_url'] ) : '<span style="color:#d63638">○ Not paired</span>'; ?></td></tr>
						<tr><td><strong>Site key</strong></td><td><code><?php echo $paired ? esc_html( substr( $creds['site_key'], 0, 12 ) ) . '…' : '—'; ?></code></td></tr>
						<tr><td><strong>WordPress</strong></td><td><?php echo esc_html( $diag['wp']['version'] ); ?> · PHP <?php echo esc_html( $diag['wp']['php'] ); ?> · memory <?php echo esc_html( $diag['wp']['memory_limit'] ); ?> · <?php echo $diag['wp']['https'] ? 'HTTPS ✓' : 'HTTP ⚠ (pairing requires HTTPS in production)'; ?></td></tr>
						<tr><td><strong>Elementor</strong></td><td><?php echo $diag['elementor']['active'] ? esc_html( 'v' . $diag['elementor']['version'] ) . ' ✓ containers supported' : '<span style="color:#d63638">not active</span>'; ?></td></tr>
						<tr><td><strong>Elementor Pro</strong></td><td><?php echo $diag['elementor']['pro'] ? ( $diag['elementor']['pro_license'] ? 'installed · license verified ✓ (Pro widgets allowed)' : 'installed · license <strong>not verified</strong> (Pro widgets blocked)') : 'not installed (free widgets only)'; ?></td></tr>
					</tbody>
				</table>
			</div>

			<?php if ( ! $paired ) : ?>
			<div class="card" style="max-width:760px;padding:16px 20px;margin-top:16px">
				<h2 style="margin-top:0">Pair with ElementorForge</h2>
				<ol style="margin-left:18px">
					<li>In your ElementorForge dashboard open <strong>Sites → Add site</strong> and choose <em>Connector plugin</em>.</li>
					<li>Copy the <strong>pairing code</strong> (e.g. <code>7F3K-9QM2</code>) shown there.</li>
					<li>Paste your dashboard URL and the code below. The code is valid for 30 minutes and can be used once.</li>
				</ol>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<input type="hidden" name="action" value="aefc_pair" />
					<?php wp_nonce_field( 'aefc_pair' ); ?>
					<table class="form-table" style="max-width:640px">
						<tr>
							<th><label for="aefc_saas">Dashboard URL</label></th>
							<td><input type="url" id="aefc_saas" name="saas_url" class="regular-text" required placeholder="https://app.your-domain.com" /></td>
						</tr>
						<tr>
							<th><label for="aefc_code">Pairing code</label></th>
							<td><input type="text" id="aefc_code" name="pairing_code" class="regular-text" required placeholder="XXXX-XXXX" style="text-transform:uppercase" /></td>
						</tr>
					</table>
					<?php submit_button( 'Pair site' ); ?>
				</form>
			</div>
			<?php else : ?>
			<div class="card" style="max-width:760px;padding:16px 20px;margin-top:16px">
				<h2 style="margin-top:0">Manage</h2>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="display:inline">
					<input type="hidden" name="action" value="aefc_disconnect" />
					<?php wp_nonce_field( 'aefc_disconnect' ); ?>
					<?php submit_button( 'Disconnect (keep all content)', 'delete', 'submit', false ); ?>
				</form>
				<p class="description">Disconnecting removes the stored SaaS credentials only. No pages or Elementor data are touched.</p>
			</div>
			<?php endif; ?>

			<div class="card" style="max-width:760px;padding:16px 20px;margin-top:16px">
				<h2 style="margin-top:0">Data &amp; uninstall</h2>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<input type="hidden" name="action" value="aefc_settings" />
					<?php wp_nonce_field( 'aefc_settings' ); ?>
					<p>
						<label><input type="checkbox" name="uninstall_purge" value="1" <?php checked( get_option( AEFC_OPT_UNINSTALL_PURGE, '0' ), '1' ); ?> />
							On uninstall, remove plugin data (credentials, audit log, service user)</label>
					</p>
					<p>
						<label><input type="checkbox" name="uninstall_delete_content" value="1" <?php checked( get_option( AEFC_OPT_UNINSTALL_DELETE_CONTENT, '0' ), '1' ); ?> />
							<strong>Also delete pages created by ElementorForge</strong> (only managed <em>drafts</em> — published pages are never deleted)</label>
					</p>
					<?php submit_button( 'Save settings' ); ?>
				</form>
				<p class="description">By default nothing is deleted on uninstall. Customer content always stays on this site unless you explicitly authorize removal here.</p>
			</div>
		</div>
		<?php
	}

	public static function handle_pair() {
		if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Forbidden' ); }
		check_admin_referer( 'aefc_pair' );

		$saas_url = untrailingslashit( esc_url_raw( wp_unslash( $_POST['saas_url'] ?? '' ) ) );
		$code     = strtoupper( sanitize_text_field( wp_unslash( $_POST['pairing_code'] ?? '' ) ) );
		if ( ! $saas_url || ! preg_match( '/^[A-Z0-9]{4}-[A-Z0-9]{4}$/', $code ) ) {
			wp_die( 'Please provide a valid dashboard URL and pairing code (format XXXX-XXXX).' );
		}

		$diag = AEFC_Diagnostics::report();
		$body = array(
			'pairingCode'   => $code,
			'siteUrl'       => home_url(),
			'wpVersion'     => get_bloginfo( 'version' ),
			'phpVersion'    => PHP_VERSION,
			'elementor'     => array(
				'version'   => $diag['elementor']['active'] ? ELEMENTOR_VERSION : null,
				'pro'       => $diag['elementor']['pro'],
				'proLicense'=> $diag['elementor']['pro_license'],
				'containers'=> $diag['elementor']['containers'],
			),
			'pluginVersion' => AEFC_VERSION,
		);

		$response = wp_remote_post( $saas_url . '/api/hooks/pair', array(
			'timeout' => 20,
			'headers' => array( 'Content-Type' => 'application/json' ),
			'body'    => wp_json_encode( $body ),
		) );
		if ( is_wp_error( $response ) ) {
			AEFC_Logger::log( 'error', 'pair.failed', $response->get_error_message() );
			wp_die( 'Pairing request failed: ' . esc_html( $response->get_error_message() ) );
		}
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( 200 !== (int) wp_remote_retrieve_response_code( $response ) || empty( $data['ok'] ) ) {
			AEFC_Logger::log( 'error', 'pair.rejected', wp_remote_retrieve_body( $response ) );
			wp_die( 'Pairing rejected: ' . esc_html( $data['error'] ?? 'unknown error' ) );
		}

		update_option( AEFC_OPT_CREDENTIALS, array(
			'site_key' => sanitize_text_field( $data['siteKey'] ),
			'secret'   => sanitize_text_field( $data['hmacSecret'] ),
			'saas_url' => $saas_url,
			'paired_at'=> gmdate( 'c' ),
		), false );
		AEFC_Logger::log( 'info', 'pair.success', 'Paired with ' . $saas_url );
		wp_safe_redirect( admin_url( 'admin.php?page=elementorforge-connect&paired=1' ) );
		exit;
	}

	public static function handle_disconnect() {
		if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Forbidden' ); }
		check_admin_referer( 'aefc_disconnect' );
		delete_option( AEFC_OPT_CREDENTIALS );
		AEFC_Logger::log( 'info', 'pair.disconnected', 'Credentials removed by admin' );
		wp_safe_redirect( admin_url( 'admin.php?page=elementorforge-connect&disconnected=1' ) );
		exit;
	}

	public static function handle_settings() {
		if ( ! current_user_can( 'manage_options' ) ) { wp_die( 'Forbidden' ); }
		check_admin_referer( 'aefc_settings' );
		update_option( AEFC_OPT_UNINSTALL_PURGE, isset( $_POST['uninstall_purge'] ) ? '1' : '0' );
		update_option( AEFC_OPT_UNINSTALL_DELETE_CONTENT, isset( $_POST['uninstall_delete_content'] ) ? '1' : '0' );
		AEFC_Logger::log( 'info', 'settings.updated', 'purge=' . get_option( AEFC_OPT_UNINSTALL_PURGE ) . ' delete_content=' . get_option( AEFC_OPT_UNINSTALL_DELETE_CONTENT ) );
		wp_safe_redirect( admin_url( 'admin.php?page=elementorforge-connect&saved=1' ) );
		exit;
	}
}

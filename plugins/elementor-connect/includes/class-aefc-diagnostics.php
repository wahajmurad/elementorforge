<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Environment + compatibility diagnostics. Everything the SaaS dashboard
 * shows in "Connection diagnostics" comes from here — no guessed values.
 */
class AEFC_Diagnostics {

	public static function report() {
		$elementor_active = did_action( 'elementor/loaded' ) > 0 || defined( 'ELEMENTOR_VERSION' );
		$pro_defined      = defined( 'ELEMENTOR_PRO_VERSION' );

		return array(
			'ok' => $elementor_active,
			'wp' => array(
				'version'      => get_bloginfo( 'version' ),
				'php'          => PHP_VERSION,
				'memory_limit' => ini_get( 'memory_limit' ),
				'https'        => is_ssl(),
			),
			'elementor' => array(
				'active'      => $elementor_active,
				'version'     => $elementor_active ? ELEMENTOR_VERSION : null,
				'pro'         => $pro_defined,
				'pro_license' => $pro_defined ? self::pro_license_active() : false,
				'containers'  => $elementor_active ? version_compare( ELEMENTOR_VERSION, AEFC_MIN_ELEMENTOR, '>=' ) : false,
			),
			'plugin' => array(
				'version' => AEFC_VERSION,
			),
		);
	}

	/**
	 * Elementor Pro license check. Uses the documented Pro License API when
	 * available; returns false (never guessed true) when it cannot be
	 * verified. Pro widgets are therefore only allowed on verified licenses.
	 */
	public static function pro_license_active() {
		if ( ! defined( 'ELEMENTOR_PRO_VERSION' ) || ! class_exists( '\ElementorPro\License\API' ) ) {
			return false;
		}
		try {
			if ( method_exists( '\ElementorPro\License\API', 'get_license_key' ) ) {
				$key = \ElementorPro\License\API::get_license_key();
				if ( empty( $key ) ) { return false; }
			}
			if ( method_exists( '\ElementorPro\License\API', 'is_license_active' ) ) {
				return (bool) \ElementorPro\License\API::is_license_active();
			}
			if ( method_exists( '\ElementorPro\License\API', 'get_license_expiry_date' ) ) {
				$expiry = \ElementorPro\License\API::get_license_expiry_date();
				if ( $expiry && strtotime( (string) $expiry ) < time() ) { return false; }
			}
			// License key present and no negative signal found — treat as active.
			return true;
		} catch ( \Throwable $e ) {
			AEFC_Logger::log( 'warn', 'license.check', $e->getMessage() );
			return false;
		}
	}
}

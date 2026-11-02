<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * HMAC request authentication + rate limiting for SaaS → site calls.
 * Signature base string (must match the SaaS client byte-for-byte):
 *   METHOD \n /wp-json/aelc/v1/... \n sha256(body) \n timestamp
 * The path is the full /wp-json/... path so proxies cannot rewrite it.
 */
class AEFC_Security {

	const REPLAY_WINDOW = 300; // seconds
	const RATE_LIMIT    = 120; // requests
	const RATE_WINDOW   = 300; // seconds

	/**
	 * WP_REST permission_callback for every aelc/v1 route.
	 * Returns true or a WP_Error with a precise reason.
	 */
	public static function verify_request( WP_REST_Request $request ) {
		$creds = AEFC_Plugin::credentials();
		if ( ! $creds ) {
			return new WP_Error( 'aefc_not_paired', 'This site is not paired with a SaaS account.', array( 'status' => 403 ) );
		}

		$site_key  = (string) $request->get_header( 'X-AELC-Key' );
		$timestamp = (string) $request->get_header( 'X-AELC-Timestamp' );
		$signature = (string) $request->get_header( 'X-AELC-Signature' );

		if ( '' === $site_key || '' === $timestamp || '' === $signature ) {
			return new WP_Error( 'aefc_missing_headers', 'Missing authentication headers.', array( 'status' => 401 ) );
		}
		if ( ! hash_equals( $creds['site_key'], $site_key ) ) {
			return new WP_Error( 'aefc_unknown_key', 'Unknown site key.', array( 'status' => 401 ) );
		}
		if ( ! preg_match( '/^\d{1,12}$/', $timestamp ) ) {
			return new WP_Error( 'aefc_bad_timestamp', 'Malformed timestamp.', array( 'status' => 401 ) );
		}
		$skew = abs( time() - (int) $timestamp );
		if ( $skew > self::REPLAY_WINDOW ) {
			return new WP_Error( 'aefc_replay', 'Timestamp outside the allowed window (possible replay).', array( 'status' => 401 ) );
		}

		$body = (string) $request->get_body();
		$path = '/wp-json' . $request->get_route();
		$base = strtoupper( $request->get_method() ) . "\n" . $path . "\n" . hash( 'sha256', $body ) . "\n" . $timestamp;
		$expected = hash_hmac( 'sha256', $base, $creds['secret'] );

		if ( ! hash_equals( $expected, strtolower( $signature ) ) ) {
			AEFC_Logger::log( 'error', 'auth.rejected', 'HMAC verification failed for ' . $path );
			return new WP_Error( 'aefc_bad_signature', 'Invalid request signature.', array( 'status' => 401 ) );
		}

		$rate_error = self::rate_limit( $site_key );
		if ( is_wp_error( $rate_error ) ) {
			return $rate_error;
		}
		return true;
	}

	private static function rate_limit( $site_key ) {
		$bucket_key = 'aefc_rl_' . md5( $site_key );
		$bucket     = get_transient( $bucket_key );
		if ( false === $bucket ) {
			$bucket = array( 'n' => 0, 't' => time() );
		}
		if ( time() - (int) $bucket['t'] > self::RATE_WINDOW ) {
			$bucket = array( 'n' => 0, 't' => time() );
		}
		$bucket['n']++;
		set_transient( $bucket_key, $bucket, self::RATE_WINDOW );
		if ( $bucket['n'] > self::RATE_LIMIT ) {
			return new WP_Error( 'aefc_rate_limited', 'Rate limit exceeded. Slow down.', array( 'status' => 429 ) );
		}
		return true;
	}

	/** Guard: only pages created by this connector may be mutated. */
	public static function assert_managed( $post_id ) {
		$post = get_post( $post_id );
		if ( ! $post || 'page' !== $post->post_type ) {
			return new WP_Error( 'aefc_not_found', 'Page not found.', array( 'status' => 404 ) );
		}
		if ( '1' !== get_post_meta( $post_id, '_aelc_managed', true ) ) {
			return new WP_Error( 'aefc_not_managed', 'This page was not created by ElementorForge Connect and cannot be modified through it.', array( 'status' => 403 ) );
		}
		return true;
	}
}

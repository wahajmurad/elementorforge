<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * REST API exposed to the SaaS (namespace aelc/v1). Every route's
 * permission_callback runs AEFC_Security::verify_request() (HMAC + replay
 * window + rate limit). Content mutations are restricted to pages this
 * connector created (meta _aelc_managed).
 */
class AEFC_Rest {

        const NS = 'aelc/v1';

        public static function init() {
                add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
        }

        private static function perm( WP_REST_Request $request ) {
                return AEFC_Security::verify_request( $request );
        }

        public static function register_routes() {
                register_rest_route( self::NS, '/status', array(
                        'methods'             => 'GET',
                        'permission_callback' => array( __CLASS__, 'perm' ),
                        'callback'            => function () {
                                $report = AEFC_Diagnostics::report();
                                $report['ok'] = $report['ok'] && $report['elementor']['containers'];
                                if ( ! $report['elementor']['active'] ) {
                                        $report['error'] = 'Elementor is not installed or not active on this site.';
                                } elseif ( ! $report['elementor']['containers'] ) {
                                        $report['error'] = 'Elementor ' . $report['elementor']['version'] . ' does not support containers (need ' . AEFC_MIN_ELEMENTOR . '+).';
                                }
                                return rest_ensure_response( $report );
                        },
                ) );

                register_rest_route( self::NS, '/pages', array(
                        'methods'             => 'POST',
                        'permission_callback' => array( __CLASS__, 'perm' ),
                        'callback'            => function ( WP_REST_Request $request ) {
                                $body = $request->get_json_params();
                                if ( ! is_array( $body ) ) {
                                        return new WP_Error( 'aefc_bad_body', 'JSON body required', array( 'status' => 400 ) );
                                }
                                $result = AEFC_Elementor::create_page( $body );
                                return rest_ensure_response( $result )->set_status( ! empty( $result['ok'] ) ? 201 : 422 );
                        },
                ) );

                register_rest_route( self::NS, '/pages/(?P<id>\d+)', array(
                        'methods'             => array( 'GET', 'DELETE' ),
                        'permission_callback' => array( __CLASS__, 'perm' ),
                        'callback'            => function ( WP_REST_Request $request ) {
                                if ( 'DELETE' === $request->get_method() ) {
                                        return rest_ensure_response( AEFC_Elementor::delete_page( (int) $request['id'] ) );
                                }
                                return rest_ensure_response( AEFC_Elementor::read_page( (int) $request['id'] ) );
                        },
                ) );

                register_rest_route( self::NS, '/pages/(?P<id>\d+)/update', array(
                        'methods'             => 'POST',
                        'permission_callback' => array( __CLASS__, 'perm' ),
                        'callback'            => function ( WP_REST_Request $request ) {
                                $body = $request->get_json_params();
                                return rest_ensure_response( AEFC_Elementor::update_page( (int) $request['id'], is_array( $body ) ? $body : array() ) );
                        },
                ) );

                register_rest_route( self::NS, '/pages/(?P<id>\d+)/publish', array(
                        'methods'             => 'POST',
                        'permission_callback' => array( __CLASS__, 'perm' ),
                        'callback'            => function ( WP_REST_Request $request ) {
                                return rest_ensure_response( AEFC_Elementor::publish_page( (int) $request['id'] ) );
                        },
                ) );

                register_rest_route( self::NS, '/pages/(?P<id>\d+)/snapshot', array(
                        'methods'             => 'POST',
                        'permission_callback' => array( __CLASS__, 'perm' ),
                        'callback'            => function ( WP_REST_Request $request ) {
                                $guarded = AEFC_Security::assert_managed( (int) $request['id'] );
                                if ( is_wp_error( $guarded ) ) { return $guarded; }
                                return rest_ensure_response( AEFC_Elementor::store_snapshot( (int) $request['id'] ) );
                        },
                ) );

                register_rest_route( self::NS, '/pages/(?P<id>\d+)/snapshots', array(
                        'methods'             => 'GET',
                        'permission_callback' => array( __CLASS__, 'perm' ),
                        'callback'            => function ( WP_REST_Request $request ) {
                                return rest_ensure_response( AEFC_Elementor::list_snapshots( (int) $request['id'] ) );
                        },
                ) );

                register_rest_route( self::NS, '/pages/(?P<id>\d+)/restore', array(
                        'methods'             => 'POST',
                        'permission_callback' => array( __CLASS__, 'perm' ),
                        'callback'            => function ( WP_REST_Request $request ) {
                                $body  = $request->get_json_params();
                                $sid   = isset( $body['snapshotId'] ) ? (string) $body['snapshotId'] : '';
                                return rest_ensure_response( AEFC_Elementor::restore_snapshot( (int) $request['id'], $sid ) );
                        },
                ) );
        }
}

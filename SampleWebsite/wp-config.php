<?php
/**
 * The base configuration for WordPress
 *
 * The wp-config.php creation script uses this file during the installation.
 * You don't have to use the web site, you can copy this file to "wp-config.php"
 * and fill in the values.
 *
 * This file contains the following configurations:
 *
 * * Database settings
 * * Secret keys
 * * Database table prefix
 * * ABSPATH
 *
 * @link https://wordpress.org/support/article/editing-wp-config-php/
 *
 * @package WordPress
 */

// ** Database settings - You can get this info from your web host ** //
/** The name of the database for WordPress */
define( 'DB_NAME', 'SampleDB' );

/** Database username */
define( 'DB_USER', 'root' );

/** Database password */
define( 'DB_PASSWORD', '' );

/** Database hostname */
define( 'DB_HOST', 'localhost' );

/** Database charset to use in creating database tables. */
define( 'DB_CHARSET', 'utf8mb4' );

/** The database collate type. Don't change this if in doubt. */
define( 'DB_COLLATE', '' );

/**#@+
 * Authentication unique keys and salts.
 *
 * Change these to different unique phrases! You can generate these using
 * the {@link https://api.wordpress.org/secret-key/1.1/salt/ WordPress.org secret-key service}.
 *
 * You can change these at any point in time to invalidate all existing cookies.
 * This will force all users to have to log in again.
 *
 * @since 2.6.0
 */
define( 'AUTH_KEY',         'x4-f(5twVnbDR=Mk/>cvZ6b3}f=;k&&;|ANE^U){k;=BPM Wf/3-J7.1XdP1|y8E' );
define( 'SECURE_AUTH_KEY',  '#DzrJPds_1J01R)8xTS^TCEqq*6g=#~dc6,1=+w_Z^K,zR0~Xi[2}IlOf`|`>A]N' );
define( 'LOGGED_IN_KEY',    'ubhWIsp&*|CAY2TrM avEpJ~|QpJUeqBJfx}KOpn>J>^~NMw&Bz?32L9K+?zC`6u' );
define( 'NONCE_KEY',        'i{6VwvHq9!Q1dz!W5$0gvjin~y}E{E;[cb(U`eT;Q0!yH~Fn::XDDrCn^@RiA;F1' );
define( 'AUTH_SALT',        'ANl%4j5$U/*Nkri(H<h~#$3m}-5$1l<U))7a0tLe<H_Fg[7c_{fTdd3fnvu2I+2S' );
define( 'SECURE_AUTH_SALT', '~s1(D$^V2,cJ}B<3fo~^bz4R9d$lDXm,0fiHV_Q{AlN@0$Vt&;IuesmdJBNsJ}4f' );
define( 'LOGGED_IN_SALT',   '`NdX?7*TxN:Q!k7ockqNVCdgk^-n*:n~D*cy_`3{ax8~4z?nVEcLn|HjpNqh94>w' );
define( 'NONCE_SALT',       '<0Uy+;GRYm7r#]6T5 0{]`F<A]-6^8=11mp37h#uocHK|*Xde: D8ltywqL9|o*w' );

/**#@-*/

/**
 * WordPress database table prefix.
 *
 * You can have multiple installations in one database if you give each
 * a unique prefix. Only numbers, letters, and underscores please!
 */
$table_prefix = 'wp_';

/**
 * For developers: WordPress debugging mode.
 *
 * Change this to true to enable the display of notices during development.
 * It is strongly recommended that plugin and theme developers use WP_DEBUG
 * in their development environments.
 *
 * For information on other constants that can be used for debugging,
 * visit the documentation.
 *
 * @link https://wordpress.org/support/article/debugging-in-wordpress/
 */
define( 'WP_DEBUG', false );

/* Add any custom values between this line and the "stop editing" line. */



/* That's all, stop editing! Happy publishing. */

/** Absolute path to the WordPress directory. */
if ( ! defined( 'ABSPATH' ) ) {
	define( 'ABSPATH', __DIR__ . '/' );
}

/** Sets up WordPress vars and included files. */
require_once ABSPATH . 'wp-settings.php';

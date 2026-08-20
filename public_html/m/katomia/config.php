<?php

require_once "{$_SERVER['DOCUMENT_ROOT']}/hapi_base.php";
$hapi_base = get_hapi_base();
// elog($hapi_base);

// KAT-SAMEORIGIN-FE1: when the serving vhost carries the /hapi/ reverse proxy
// (KAT-SAMEORIGIN-PROXY1), set KAT_SAMEORIGIN=1 in .env_hapi and the browser is
// handed NO backend origin at all — CONFIG.HAPI_BASE goes empty (consumers fall
// back to the page origin: /hapi/ws for the socket, /kfeedback for the widget),
// and the feedback widget loads from the proxied root path. An explicit
// ?hapi_base= admin override still forces the cross-origin path untouched.
$kat_env_path = dirname($_SERVER['DOCUMENT_ROOT']) . '/.env_hapi';
$kat_env = is_readable($kat_env_path) ? parse_ini_file($kat_env_path) : [];
$hapi_sameorigin = !empty($kat_env['KAT_SAMEORIGIN']) && trim((string)($_GET['hapi_base'] ?? '')) === '';
$hapi_widget_src = $hapi_sameorigin ? '/feedback-widget.js' : "https://$hapi_base/feedback-widget.js";
if ($hapi_sameorigin) $hapi_base = '';


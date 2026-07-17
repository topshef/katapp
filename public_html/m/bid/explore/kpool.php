<?php

//placeholder minimal kpool call

require_once "{$_SERVER['DOCUMENT_ROOT']}/elog.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/hapi_base.php";

$parms = $_GET;

$action = $parms['action'] ?? 'txList';
unset($parms['action']);

// admin-only hapi_base override (mirrors auth.php's $ip_admin / future/kpool.php — keep in sync)
$hapi_admin_ips = '130.185.251.53 176.126.78.48 ';
$isAdmin = strpos($hapi_admin_ips, $_SERVER['REMOTE_ADDR']) !== false;

$hapi_override = $isAdmin ? trim($parms['hapi_base'] ?? '') : '';
unset($parms['hapi_base']); // never forward to upstream querystring

$hapi_base = get_hapi_base(null, false, $hapi_override);

if (!$parms['network']) $parms['network'] = 'mainnet';
$querystring = http_build_query($parms);

$url = "https://$hapi_base/kpool/$action?$querystring";

elog($url);

$json = file_get_contents($url);

// elog(json_decode($json), "res from $url");

// diagnostics: lets the page show what actually happened, without log-diving
header('X-Hapi-Debug: route=m/bid/explore/kpool.php; base=' . $hapi_base
	. '; override_requested=' . ($hapi_override ?: 'none')
	. '; admin=' . ($isAdmin ? '1' : '0'));

header('Content-type: application/json');

echo $json;

?>
<?php

//placeholder minimal kpool call

require_once "{$_SERVER['DOCUMENT_ROOT']}/elog.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/hapi_base.php";
$hapi_base = get_hapi_base();

$parms = $_GET;

$action = $parms['action'] ?? 'txList';
unset($parms['action']);

if (!$parms['network']) $parms['network'] = 'mainnet'; 
$querystring = http_build_query($parms);

$url = "https://$hapi_base/kpool/$action?$querystring";

elog($url);

$json = file_get_contents($url);

// elog(json_decode($json), "res from $url");

header('Content-type: application/json');

echo $json;

?>
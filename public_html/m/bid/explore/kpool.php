<?php

//placeholder minimal kpool call

require_once("{$_SERVER['DOCUMENT_ROOT']}/elog.php");

$parms = $_GET;
if (!$parms['network']) $parms['network'] = 'mainnet'; 
$querystring = http_build_query($parms);

$url = "https://hapi2.hbar.live/live/kpool/txList?$querystring";

elog($url);

$json = file_get_contents($url);

header('Content-type: application/json');

echo $json;

?>
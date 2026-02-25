<?php

// #KMM kpay market maker

// v basic starter demo

$docroot = $_SERVER['DOCUMENT_ROOT'];
require_once "$docroot/assets/php/elog.php";

$env = parse_ini_file("$docroot/../.env_kmm");
// elog($env);
// elog($_SERVER);

$label = 'c429';
$publicKey = $env["pubkey_{$label}"] ?? false;
$escrowKey = $env["escrow_{$label}"] ?? false;

// elog([$pubkey, $escrow]);

$parms = (object)[];
$parms->saas_domain = 'gmws2.gomint.me';
$parms->network = 'mainnet';
$parms->dealId = '67b8e46dd2f77f9d1b41c60788b7ea2216a4524f63b8e94b52ef4f0ba2ec5042';
$parms->userAccountId = $_GET['userAccountId'] ?? '0.0.10177400';
$parms->user_parameters = (object)[];
$parms->user_parameters->starttime = $_GET['starttime'] ?? '60secs';


$parms->keysafe = [];
$parms->keysafe[] = compact('publicKey', 'escrowKey');

$querystring = http_build_query($parms);

$url = "https://kpos.uk/deal/bytes/?$querystring";

// echo "<PRE>";
// echo $url;

$json = file_get_contents($url);

header('Content-Type: application/json');

echo $json;




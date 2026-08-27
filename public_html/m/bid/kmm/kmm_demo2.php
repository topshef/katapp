<?php

// #KMM kpay market maker

// demo a simple maker bot

//recylign 0.0.5790831 for maker tests (unused and has tokens associated)
//https://app.asana.com/1/320473451374036/project/320473451374042/task/1213411274962201

//pubkey 1/2 302a300506032b657003210078698a759cf134b3c9d1c8e7906cc49617fce9d742a37b57e5262bdd9569a2e5
//                          64 chars 78698a759cf134b3c9d1c8e7906cc49617fce9d742a37b57e5262bdd9569a2e5
// make 1/2 using kfund profile page
// success https://kpay.uk/tx/?network=mainnet&txid=0.0.5790831@1771888204.043175090
// https://hashscan.io/mainnet/transaction/1771888210.191808000
// (took a few tries unsure why)
/*
add xbar while we're here..

[23:05, 2/23/2026] Alex Taylor: new key
[23:05, 2/23/2026] KPAY: New public key is 302a300506032b657003210078698a759cf134b3c9d1c8e7906cc49617fce9d742a37b57e5262bdd9569a2e5
[23:05, 2/23/2026] KPAY: 200
[23:05, 2/23/2026] KPAY: createKey
[23:06, 2/23/2026] Alex Taylor: kmm_maker is 302a300506032b657003210078698a759cf134b3c9d1c8e7906cc49617fce9d742a37b57e5262bdd9569a2e5
[23:06, 2/23/2026] KPAY: Saved alias kmm_maker as 302a300506032b657003210078698a759cf134b3c9d1c8e7906cc49617fce9d742a37b57e5262bdd9569a2e5
[23:06, 2/23/2026] Alex Taylor: set kmm_maker
[23:06, 2/23/2026] KPAY: Default public key is now a2e5 

78698a759cf134b3c9d1c8e7906cc49617fce9d742a37b57e5262bdd9569a2e5
[23:18, 2/23/2026] Alex Taylor: add token 0.0.3241293 to 0.0.5790831
[23:19, 2/23/2026] KPAY: add token was successful

https://kpay.uk/tx/?network=mainnet&txid=0.0.5790831@1771888736.088349856


cron every 30 mins
30 * * * * curl -s https://swap.kpay.live/m/bid/kmm/kmm_demo2.php > /dev/null 2>&1


*/

$docroot = $_SERVER['DOCUMENT_ROOT'];
require_once "$docroot/assets/php/elog.php";

$env = parse_ini_file("$docroot/../.env_kmm");
// elog($env);
// elog($_SERVER);

$label = 'a2e5'; // end of pubkey
$publicKey = $env["pubkey_{$label}"] ?? false;
$escrowKey = $env["escrow_{$label}"] ?? false;

// elog([$pubkey, $escrow]);

$parms = (object)[];
$parms->saas_domain = 'gmws2.gomint.me';
$parms->network = 'mainnet';
$parms->dealId = '8fa654dfd049aaf2103d7e389d1c2c861a709749713e77ebf8bbd710da705264';
$parms->userAccountId = $_GET['userAccountId'] ?? '0.0.5790831';  // will also be the operator here
$parms->user_parameters = (object)[];
$parms->user_parameters->starttime = '600secs'; // 10 mins.. even a 5min cron would pick it up
$parms->operatorId = '0.0.4377622'; // target the taker so cant waste fees if not accepting


$parms->keysafe = [];
$parms->keysafe[] = compact('publicKey', 'escrowKey');

$querystring = http_build_query($parms);

// SECURITY 2026-08-27: kpos.uk = 176.126.78.48 (breached box) — egress neutralised to a
// dead .invalid host. Deal-bytes is KEA (deal-execution agent) WIP; FOLLOW-UP: audit
// kpos.uk and bring deal-bytes in-house in the katomia rebuild rather than restoring this call.
$url = "https://kpos.uk.invalid/deal/bytes/?$querystring";

// echo "<PRE>";
// exit("<PRE>$url");

$json = file_get_contents($url);

header('Content-Type: application/json');

echo $json;




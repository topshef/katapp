<?php

$parms = $_GET;


$action = $parms['action'] ?? false;

if (!$action) {
	//inject legacy page code
	require_once($_SERVER['DOCUMENT_ROOT'] . '/future/index.php');
	exit;
}

//else process as api so this can work inside hashpack
// copied from kpos.uk/pool

require_once("{$_SERVER['DOCUMENT_ROOT']}/elog.php");
require_once("{$_SERVER['DOCUMENT_ROOT']}/assets/php/getCachedData.php");

unset($parms['action']);

$ttl = 10; // 10 second cache on read ops
$network = $parms['network'] ?? false;

$comment = "GET ttl=$ttl"; // default
$json = file_get_contents('php://input');

if ($json) {
	$comment = 'POST'; 
	$body = json_decode($json);
	$network = $body->network && $network; // body network rules
}

if (!$network) exit('HE93843 missing network');


// unset($parms['endpoint']);

elog($_SERVER);
$parms['source_upstream'] = "{$_SERVER['HTTP_ORIGIN']}  --> {$_SERVER['SCRIPT_FILENAME']}?{$_SERVER['QUERY_STRING']}";

$querystring = http_build_query($parms);

$endpoint = ($network == 'mainnet') ? 'hapi2.hbar.live/live' : 'api.gomint.me/dev';

$url = "https://$endpoint/kpool/$action?$querystring";



if ($json) { // post
	$result = sendPost($url, $json);
} else { //get
	$result = getCachedData($url, $ttl); 
	// $result = file_get_contents($url); 
}

elog([$_GET, $parms, json_decode($json), json_decode($result)], "get, parms, json, result. $comment result from $url");


header('Content-Type: application/json');
echo $result;


function sendPost($url, $json, $debug = false) {

	$options = array(
	  'http' => array(
		'method'  => 'POST',
		'content' => $json,
		'header'=>  "Content-Type: application/json\r\n" .
					"Accept: application/json\r\n"
		)
	);

	$context  = stream_context_create( $options );
	if ($debug) error_log("calling POST url=$url with json = $json");
	$result = file_get_contents( $url, false, $context );
	return $result;
}	



<?php

// #KMM kpay market maker

// demo a simple taker bot


/*
taker 0.0.4377622 (xcurrent) is watching for bids to buy xbar using usd

if the rate is 1:1 or better, and less than 1 USD, then taker will accept
well taker will take anytihng for now.. too easy, but will update code later

0.0.5790831

*/

// cron test
// */30 * * * * curl -s https://swap.kpay.live/m/bid/kmm/kmm_demo2.php > /dev/null 2>&1
// */5 * * * * curl -s https://swap.kpay.live/m/bid/kmm/kmm_demo2_taker.php > /dev/null 2>&1



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
$network = 'mainnet';
$parms->network = $network;
$parms->accountId = '0.0.4377622'; //xcurrent
$parms->until = 1200; //look 20 mins into the future
$querystring = http_build_query($parms);

$url = "https://hapi2.hbar.live/live/kpool/txList?$querystring";
$json = file_get_contents($url);
$obj = json_decode($json);
elog($obj);
$txns = $obj->result->tx;

foreach ($txns as $tx) {
		$txid = $tx->txid;
		if (!shallWeAccept($txid)) continue;
		
		// get tx bytes
		$url = "https://hapi2.hbar.live/live/kpool/txRead?network=$network&txid=$txid";
		$obj = json_decode(file_get_contents($url));
		elog($obj);
		$bytes = $obj->result->hex2 ?? false;

		//sign tx
		// extract((array)$parms);
		$data = ['network' => $network, 'publicKeys' => [$publicKey], 'escrowKeys' => [$escrowKey],'bytes' => $bytes, 'txid' => $txid];		
		$url = "https://hapi2.hbar.live/live/txSign";  // this also saves to kpool
		$json = sendPost($url, json_encode($data));
		echo "<PRE><HR>result of signing $txid\n$json\n";
		$obj = json_decode($json);
		elog($obj);	
}



function shallWeAccept($txid) {  
		[$payer, $starttime] = explode('@', $txid);
		[$seconds, $nanos] = explode('.', $starttime);

		//rejection rules...
		//silly example only
		if ($nanos !== '009414228') return false; 
		
		return true;
}




function generateHeaderString($headers) {
		$headerLines = [];
		foreach ($headers as $key => $value) {
				$headerLines[] = (is_int($key))
						? $value
						: "$key: $value";
		}
		return implode("\r\n", $headerLines) . "\r\n";
}

function sendPost($url, $json, $returnStatusCode = false, $extraHeader = null) {
    //v0.11 wa to papi legacy comments removed only
    //v0.1 wa
    // Default headers
    $defaultHeaders = array(
        'Content-Type' => 'application/json',
        'Accept' => 'application/json',
        // 'request-ref' => $GLOBALS['reqref'] ?? 'noreqref'  //not valid to fw - must start with capital
        // 'X-REQUEST-REF' => $GLOBALS['reqref'] ?? 'noreqref'  // legacy pre 2012
        'K-REQUEST-REF' => $GLOBALS['reqref'] ?? 'noreqref'   // custom kpay 
    );

    // If additional headers are provided, merge them with default headers
    if ($extraHeader)
        $defaultHeaders = array_merge($defaultHeaders, $extraHeader);

    // Convert headers array to a string
    $headerString = generateHeaderString($defaultHeaders);
    // elog($defaultHeaders, $headerString);

    $options = array(
        'http' => array(
            'method'  => 'POST',
            'content' => $json,
            'header'  => $headerString
        )
    );

	$context  = stream_context_create( $options );
    //elog($context, "sendPost context"); // eg Resource id #14
    
	$body = file_get_contents( $url, false, $context );
    
    if (!$returnStatusCode) return $body; //default for legacy.. return raw result
    
    // Extract the HTTP response code
    $httpStatusCode = null;
    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('#HTTP/\d+\.\d+ (\d+)#', $header, $matches)) {
            $httpStatusCode = intval($matches[1]);
            break;
        }
    }

    return (object) [
        'body' => $body,
        'httpStatusCode' => $httpStatusCode
    ];
        
}	



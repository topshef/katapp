<?php


require_once("{$_SERVER['DOCUMENT_ROOT']}/elog.php");
require_once("{$_SERVER['DOCUMENT_ROOT']}/readenv.php");


function dragonglass_v4b($parms, $cacheSeconds = 60 * 5) {
    //https://app.dragonglass.me/hedera/apiview
    
    $DG_accesskey_mainnet = $GLOBALS['env']['DG_accesskey_mainnet'] ?? false;
    if (!$DG_accesskey_mainnet) ljexit("internal, please quote HE83742", 500, "HE83742 missing env");

    $auth = "x-api-key:$DG_accesskey_mainnet"; 
    
    $baseurl = "https://api.dragonglass.me/hedera/api";
 
    $endpoint = $parms['endpoint'] ?? 'transactions';
    $endpoint = preg_replace('/[^0-9A-Za-z_\/]/', '', $endpoint);
    
    $url = "$baseurl/$endpoint";
    unset($parms['endpoint']);
    
    $parmsAllowed['transactions']  = 'query accountFrom accountTo amountFrom amountTo memo contractID consensusStartInEpoch consensusEndInEpoch payerID transactionTypes serviceTypes from size sortOn sortBy';
    $parmsAllowed['nfts/transfers'] = 'query tokenId serialNumber sender receiver transferAfter transferBefore from size sortOn sortBy';
    
    $parmsAllowed = explode(' ', $parmsAllowed[$endpoint]);
    if (!$parmsAllowed) ljexit("internal, please quote WJ73642", 500, "WJ73642 invalid endpoint $endpoint");
    
    $parmsOriginal = $parms;
    $parms = array_intersect_key($parms, array_flip($parmsAllowed));
    $removedKeys = array_diff_key($parmsOriginal, $parms);
    if ($removedKeys) elog($removedKeys, "JE87442 invalid keys removed");
    
    if (!$parms) return ljexit("please provide some parameter(s): https://app.dragonglass.me/hedera/apiview", 400);
    
    $querystring = http_build_query($parms);
    elog($parms, "query parms for DG, cacheSeconds=$cacheSeconds");
    
    $url = "$url?$querystring";
    
    // caching
    $hash = hash('SHA1', $url);
    $cachepath = "./cache/autocache.$hash.txt";    
    
    if (file_exists($cachepath)) {
        
        if ($cacheSeconds === null) return file_get_contents($cachepath); // never timeout
        
        $ageseconds = time() - filemtime($cachepath);
        if ($ageseconds < $cacheSeconds) return file_get_contents($cachepath);
    }    
    
	$curl = Curl_init(); 
	curl_setopt($curl, CURLOPT_URL, $url); 
	curl_setopt($curl, CURLOPT_HTTPHEADER,array($auth)); 
	curl_setopt($curl, CURLOPT_RETURNTRANSFER, true); 
	$curl_response = curl_exec($curl); 
	curl_close($curl); 

    $obj = json_decode($curl_response);
    $jsonOk = json_last_error() === JSON_ERROR_NONE;
    if (!$jsonOk) elog("failed to parse json from $url\n$curl_response");
    
    if ($jsonOk) { // write cache
        elog($obj, "live result of $url");
        file_put_contents($cachepath, $curl_response);
        file_put_contents("./cache/autocache.$hash.url.txt", $url);
    }
    
	return $curl_response;
    
}

?>
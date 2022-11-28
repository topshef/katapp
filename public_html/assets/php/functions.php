<?php

	function shortenText($text, $maxlength = 300) {
		if (strlen($text) > $maxlength) {
			$newtext = substr($text, 0, $maxlength);
			return "$newtext ...";
		} else return $text;
		
	}

	// and/or para
	//if (strpos($text, "\n")) 
	//	$newtext = substr($text, strpos($text, "\n")-1);


	function splitProductId($productId) { // experimental
		$v = explode(';', $productId);
		$out['network'] = $v[0];
		$out['NFT'] = $v[1];  // could be a range
		$out['seller'] = $v[2];
		
		$tokenparts = explode('-', $out['NFT']);
		$out['tokenId'] = $tokenparts[0];
		$serialpart = $tokenparts[1];
		$fromTo = explode(':', $serialpart);
		$out['serialFrom'] = $fromTo[0];
		$out['serialTo'] = $fromTo[1];
		
		/* just an idea
		if ($out['serialTo'] == null && $out['serialFrom'] != null)
			$out['productZoom'] = 'NFT';
		
		if ($out['serialTo'] != null && $out['serialFrom'] != null)
			$out['productZoom'] = 'range';
		
		if ($out['serialTo'] == null && $out['serialFrom'] == null)
			$out['productZoom'] = 'collection';
		*/

		$out['isRange'] = $out['serialTo'] != null;
		
		//error_log(print_r($out,true));
		return $out;
	}

	require_once "{$_SERVER['DOCUMENT_ROOT']}/assets/php/getCachedData.php";
	
	
	function getTokenInfo($network, $tokenId) {
		if ($network == 'mainnet') $url = "https://mainnet-public";
		else $url = "https://$network";
		$url .= ".mirrornode.hedera.com/api/v1/tokens/$tokenId";
		$json = getCacheData($url);
		return json_decode($json,true);
	}
	
?>

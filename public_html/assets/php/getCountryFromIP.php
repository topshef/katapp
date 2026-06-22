<?php

	$isDirect = (__FILE__ == $_SERVER["SCRIPT_FILENAME"]);

	if ($isDirect) { // run only if called directly (not if included)
		$out = getCountryFromIP($_GET);
		if (isset($_GET['pre'])) echo "<PRE>";
		$jsonout = json_encode($out, JSON_PRETTY_PRINT);
		echo $jsonout;
	}

	
	function getCountryFromIP($in) {

		//get geo location info from ip address
		//https://ip-api.com/docs/api:json

		if (is_array($in)) $ip = $in['IP'];
		else  $ip = $in;

		$cachepath = "{$_SERVER['DOCUMENT_ROOT']}/cache/ip_country_{$ip}.json";
		
		if (file_exists($cachepath)) return file_get_contents($cachepath);
		
		$url = "http://ip-api.com/json/$ip";
		$json = file_get_contents($url);
		$arr = json_decode($json, true);
		
		if ($arr['countryCode'] != null) file_put_contents($cachepath, $arr['countryCode']);
		return $arr['countryCode'];
		
	}
	
?>

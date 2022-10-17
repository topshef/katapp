<?php

	// only allow designated countries access to the deal

	require_once "{$_SERVER['DOCUMENT_ROOT']}/assets/php/getCountryFromIP.php";
	
	$userIP = $_SERVER['REMOTE_ADDR'];
	$userCountry = getCountryFromIP($userIP); // eg PT = Portugal
	if ($userCountry == null) exitFail("cannot find country for IP $userIP");
	
	error_log("userIP = $userIP  userCountry= $userCountry");
	
	$allowedCountries = $parameters['allowedCountries']; // comma or space separation
	$isAllowed = strpos($allowedCountries, $userCountry) !== false;

	if (!$isAllowed) {
		$url_deny = $parameters['url_deny'];
		error_log("allowCountries denied for $userIP $userCountry not in $allowedCountries");
		if ($url_deny != null) header("Location: $url_deny");
		else exitFail("deal denied but missing url_deny");
		exit;
	}
	
	error_log("allowCountries passed ok");
	//if $isAllowed then the script(s) resume and the page may load if all pass
	

?>
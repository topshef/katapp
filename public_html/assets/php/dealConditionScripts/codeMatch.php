<?php

	// require the user to provide a specific code, eg from an advertised promo

	session_start();
	
	$isAllowed = false;
		
	$userCode = $_SESSION['dealGate']['userMessage'] ?? null;
	
	if ($userCode == null) {// request code from user
		$_SESSION['dealGate']['dealURL'] = "https://{$_SERVER['SERVER_NAME']}{$_SERVER['REQUEST_URI']}";
		error_log("requesting info from user... return to {$_SESSION['dealGate']['dealURL']}");
		header("Location: https://{$_SERVER['SERVER_NAME']}/form.php");
		exit;
	}
	
	if ($parameters['code'] === $userCode) {
		error_log("codeMatch passed for code $userCode");
		$isAllowed = true;
	}
	

	if (!$isAllowed) {
		$url_deny = $parameters['url_deny'];
		error_log("codeMatch denied $user_id ");
		if ($url_deny != null) header("Location: $url_deny");
		else exitFail("deal denied but missing url_deny");
		exit;
	}
	
	//if $isAllowed then the script(s) resume and the page may load if all pass
	
		
?>
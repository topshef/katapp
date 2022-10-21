<?php
	session_start();
	
	$ip = $_SERVER['REMOTE_ADDR'];
	
	require_once __DIR__ . '/readenv.php';
	$ip_tester = $env['ip_tester'];
	$is_tester_based_on_ip = strpos($ip_tester, $ip) !== false;
	
	$ip_admin = '130.185.251.53 ';  // self, not admin 194.35.12.127
	$isAdmin = strpos($ip_admin, $ip) !== false;
	if ($isAdmin) $_SESSION['flags']['isAdmin'] = true;

	$isDev = $isAdmin && isset($_GET['dev']);


	// start with basic guest account login only
	$session_result = session_start();
	if (!$session_result) exit('fat-free cookies required'); // placeholder

	$user_id = $_SESSION['user_id'];
	if ($user_id == null) setGuestUser();

	//kinda mess - todo sort dependencies
	require_once __DIR__ . '/config.php';
	require_once __DIR__ . '/constants.php';
	require_once __DIR__ . '/content/loadcontent.php';
	
	if (!isset($_SESSION['user_profile'])) {
		$user_profile = getUserProfile($user_id, 'user');
		$user_permissions = getUserProfile($user_id, 'admin');
		$user = array_merge($user_profile, (array)$user_permissions);

		$_SESSION['user_profile'] = $user;
	}

	$isTester = $is_tester_based_on_ip || $_SESSION['user_profile']['IS_TESTER'] === 'TRUE';  //
	$shopStatus = $content['general'][1]['shop_status'];
	$isShoppingAllowed = ($isTester || $shopStatus != 'closedbeta') && $shopStatus != 'closed'; //
	$_SESSION['isShoppingAllowed'] = ($isShoppingAllowed) ? 1 : 0;
	
	function setGuestUser() { // see also pagevisit.php
		$seed = $_SERVER['REMOTE_ADDR'] . 
				//$_SERVER['REMOTE_PORT'] . 
				$_SERVER['HTTP_USER_AGENT'] . 
				$_SERVER['HTTP_ACCEPT'] . 
				$_SERVER['HTTP_ACCEPT_LANGUAGE'] .
				$_SERVER['HTTP_ACCEPT_ENCODING']
				;
		$hash = hash('sha256', $seed);
		$feed1 = strtoupper(hexToAlphaNum($hash));
		//$feed1 = strtoupper(base64_encode(preg_filter('/[^0a-z]/', '', $hash )));
		$part1 = substr(preg_filter('/[^QERTYUPDFGHJKZCVBNM]/', '', $feed1), 0, 2); // remove X which is used as a separator for baskets
		$part2 = substr(preg_filter('/[^2-9]/', '', $hash), 0, 5);
		$result = $part1 . $part2;
		//debug $result = $hash . $feed1;
		
		$_SESSION['login_method'] = 'pseudo'; // needs refactor
		$_SESSION['user_id'] = $result;
		
		return $result; // not used
	}
	
	function hexToAlphaNum($input) {
		for ($i = 0; $i <= strlen($input)/2 ; $i++) 
			$output .= base_convert(substr($input,2 * $i,2), 16, 36);
		return $output;
	}

?>
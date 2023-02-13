<?php

	// allow once only per Hedera account

	session_start();
	
	$isAllowed = true;
	
	if ($_SESSION['login_method'] != 'hashconnect_auth') $isAllowed = false;
	else {
		$user_id = $_SESSION['user_id'];
		$parts = explode(';', $user_id);
		$user_network = $parts[0];
		$user_accountId = $parts[1];
		
		$balance = getTokenBalanceForAccount($network, $token_id, $user_accountId);
		error_log($balance);
		if ($balance == 'error') $isAllowed = false;
		if ($balance != null) $isAllowed = false; // not sure if this is fail-safe
		// also someone could buy multiple really quickly before mirror node updates
		// so would need create some kind of purchase delay or cache
		if ($balance == 0) $isAllowed = true;
		
	}

	if (!$isAllowed) {
		$url_deny = $parameters['url_deny'];
		error_log("onceOnlyPerAccount denied $user_id");
		if ($url_deny != null) header("Location: $url_deny");
		else exitFail("deal denied but missing url_deny");
		exit;
	}
	
	//if $isAllowed then the script(s) resume and the page may load if all pass
	
	
	
	function getTokenBalanceForAccount($network, $tokenId, $accountId) {
		$tokenId = explode('-', $tokenId)[0];
		
		$url = 'https://gomint.me/api/query/getTokenBalance.php?';
		//https://gomint.me/api/query/getTokenBalance.php?accountId=0.0.1176332&tokenId=0.0.1034578
		$url .= "&network=$network";
		$url .= "&tokenId=$tokenId";
		$url .= "&accountId=$accountId";
		
		$balance = file_get_contents($url);

		/* mirror node version - would be too slow to update
		$url = 'https://';
		$url .= ($network == 'mainnet') ? 'mainnet-public' : $network ;
		$url .= '.mirrornode.hedera.com/api/v1/';
		$url .= "tokens/$tokenId/balances?account.id=$accountId";
		error_log($url);
		$json = file_get_contents($url);
		error_log($json);
		$arr = json_decode($json, true);
		if (key($arr) != 'timestamp') return 'error'; 
		
		$balance = $arr['balances'][0]['balance'];
		*/
		
		error_log("balance for $network token $tokenId for account $accountId is $balance");
		return $balance;
	}

		//https://mainnet-public.mirrornode.hedera.com/api/v1/tokens/0.0.643954/balances?account.id=0.0.496242	//https://mainnet-public.mirrornode.hedera.com/api/v1/tokens/0.0.643954/balances?account.id=0.0.49624
		
		//https://mainnet-public.mirrornode.hedera.com/api/v1/tokens/0.0.1396695/balances?account.id=0.0.657983
		
		//https://mainnet-public.mirrornode.hedera.com/api/v1/tokens/0.0.1396695/balances?account.id=0.0.24739
		//https://mainnet-public.mirrornode.hedera.com/api/v1/tokens/0.0.1396695/balances?account.id=0.0.1176332,
		//https://mainnet-public.mirrornode.hedera.com/api/v1/tokens/0.0.1396695/balances?account.id=0.0.1176332
		
		//https://mainnet-public.mirrornode.hedera.com/api/v1/tokens/0.0.1396695/balances?account.id=0.0.1176332
		
?>
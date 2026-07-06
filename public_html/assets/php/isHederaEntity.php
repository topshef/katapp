<?php


	function isHederaEntity($accountId) {
		//check that account id is at least a valid format
		if ($accountId == null) return false;
		$pattern = '/(?:(?:\d+)\.){2}\d+/';
		preg_match($pattern, $accountId, $matches);
		return ($matches[0] == $accountId);
	}
	
	function getHederaEntities($string) {
		// get list of hedera entities mentioned in string
		// currently only returning the first one - needs fixing
		$pattern = '/(?:(?:\d+)\.){2}\d+/';
		preg_match($pattern, $string, $matches);
		return $matches;
	}
	

?>
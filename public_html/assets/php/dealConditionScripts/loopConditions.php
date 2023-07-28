<?php

	// in prog.. conditions to be moved to saas kfund
	// then this folder to be deprecated

	//$dealConditions must be set - an array of conditions to apply
	error_log("deal conditions were found");
	
	session_start();
	//unset($_SESSION['dealGate']);  // maybe some scenarios where we need to unset 
	$_SESSION['dealGate']['status'] = 'pending';
	
	$scriptFolder = "{$_SERVER['DOCUMENT_ROOT']}/assets/php/dealConditionScripts";
	
	foreach ($dealConditions as $dealCondition) {
		$scriptName = $dealCondition['scriptName'];
		$parameters = $dealCondition['parameters'];
		if (substr($scriptName,-4,4) != '.php') $scriptName .= '.php';
		error_log("including $scriptName");
		if (!file_exists("$scriptFolder/$scriptName"))
			exitFail("missing $scriptFolder/$scriptName");
		include "$scriptFolder/$scriptName";
		$_SESSION['dealGate']['debug']['status_x_condition'][$scriptName] = 'allow'; // if a condition fails
	}

	$_SESSION['dealGate']['status'] = 'allow';  // tx_signer should read this to confirm deal ok to execute?
	
	$html_conditions = "<div id='deal_conditions'>Conditions apply</div>";

	// functions can be used by any condition in the loop...
	function exitFail($message) {
		error_log("deal condition check resulted in exitFail: $message");
		echo "<!-- $message -->"; // view source if needed
		//header("Location: https://{$_SERVER['SERVER_NAME']}"); //redirect to homepage for now
		exit($message);
	}

?>

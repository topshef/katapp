<?php

	//$dealConditions must be set - an array of conditions to apply
	error_log("deal conditions were found");
	
	
	
	$scriptFolder = "{$_SERVER['DOCUMENT_ROOT']}/assets/php/dealConditionScripts";
	
	foreach ($dealConditions as $dealCondition) {
		$scriptName = $dealCondition['scriptName'];
		$parameters = $dealCondition['parameters'];
		if (substr($scriptName,-4,4) != '.php') $scriptName .= '.php';
		error_log("including $scriptName");
		include "$scriptFolder/$scriptName";
	}

	$html_conditions = "<div id='deal_conditions'>Conditions apply</div>";

	// functions can be used by any condition in the loop...
	function exitFail($message) {
		error_log("deal condition check resulted in exitFail: $message");
		echo "<!-- $message -->"; // view source if needed
		//header("Location: https://{$_SERVER['SERVER_NAME']}"); //redirect to homepage for now
		exit($message);
	}

?>

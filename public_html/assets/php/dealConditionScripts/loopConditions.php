<?php

	//$dealConditions must be set - an array of conditions to apply
	$scriptFolder = "{$_SERVER['DOCUMENT_ROOT']}/assets/php/dealConditionScripts";
	
	foreach ($dealConditions as $dealCondition) {
		$scriptName = $dealCondition['scriptName'];
		$parameters = $dealCondition['parameters'];
		if (substr($scriptName,-4,4) != '.php') $scriptName .= '.php';
		include "$scriptFolder/$scriptName";
	}

	function exitFail($msg) {
		echo "<!-- $msg -->"; // view source if needed
		//header("Location: https://{$_SERVER['SERVER_NAME']}"); //redirect to homepage for now
		exit($msg);
	}

?>

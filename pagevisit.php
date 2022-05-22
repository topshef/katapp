<?php

// log page visit info

	$session_result = session_start();

	$month = gmdate("Y-m", time());
	$filepath = __DIR__ . "/data/pagevisit/visitors.$month.log";

	$out = array($_SERVER, $_SESSION);
	$out['self'] = $filepath;

	file_put_contents($filepath, json_encode($out) . PHP_EOL, FILE_APPEND);


?>
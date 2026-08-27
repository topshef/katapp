<?php

function logEvent($msg = null, $filepath = null, $ip = '130.185.251.53') {
  return "noop YE93848";
	
	if ($_SERVER['REMOTE_ADDR'] != $ip) return false; // only process selected IP

	$unixtime = time();
	$strDate = gmdate("Y-m-j", $unixtime);
	$datetimeUTC = gmdate("Y-m-d H:i:s", $unixtime);
	if ($filepath == null) $filepath = __DIR__ . "/logs/logEvent_{$ip}_{$strDate}.txt";
	//QUERY_STRING

	$timenow = microtime(true);
	
	if ($GLOBALS['prev_time'] == null) {
		$elapsed  = 'millisec cumul...............................';
		$GLOBALS['start_time'] = $timenow;
		if (isset($_GET['clearlog'])) unlink($filepath);
	} else {
		$elapsed = ($timenow - $GLOBALS['prev_time'])*1000;
		$elapsed = round($elapsed,3);
	}
	$GLOBALS['prev_time'] = $timenow;
	
	$cumul_time = ($timenow - $GLOBALS['start_time']) * 1000;
	$cumul_time = round($cumul_time,1);
	
	$result = file_put_contents($filepath, "$datetimeUTC\t$elapsed\t$cumul_time\t$msg\t{$_SERVER['SCRIPT_FILENAME']}?{$_SERVER['QUERY_STRING']}\n", FILE_APPEND);
	
	return true;
}

?>

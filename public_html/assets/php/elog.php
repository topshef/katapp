<?php

	// more useful error logging

	function elog($message) {
		$backtrace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 2);
		$file = $backtrace[0]['file'];
		$line = $backtrace[0]['line'];

		if (!isset($_GET['verbose'])) 
			return error_log("$file Line $line $message");

		
		$verbose_output = '';
		foreach ($backtrace as $arr) {
			extract($arr);
			$verbose_output .= "$file Line $line\n";
		}
		$verbose_output .= "$message";
		return error_log($verbose_output);
		
	}

?>

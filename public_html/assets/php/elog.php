<?php

	// more useful error logging

    $envLogPath = getenv('PHP_ERROR_LOG'); // eg cong file SetEnv PHP_ERROR_LOG "/path to log"
    if ($envLogPath !== false)
        ini_set('error_log', $envLogPath);
    
    //v2.1

	function elog($message, $isVerbose = null, $source = null) {
        if (is_array($message) || is_object($message)) //
            $message = json_encode($message, JSON_PRETTY_PRINT); //

		$backtrace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 2);
		$file = $backtrace[0]['file'];
		$line = $backtrace[0]['line'];

        $isVerbose = $isVerbose ?? isset($_GET['verbose']);
        
        $source = $source ?? $_GET['debugsource'] ?? 'no source';
        if ($source) $source = preg_replace('/[^a-z0-9]/i', '', $source);
        
        $ip = $_SERVER['REMOTE_ADDR'];
        $out = "$ip $source:";
        
        $out .= "$file Line $line $message";

		if (!$isVerbose) 
			return error_log($out);
        
        $e = new Exception();
        $stackTrace = $e->getTraceAsString();
        $out .= "\n$stackTrace\n\n";

		return error_log($out);
		
	}
?>
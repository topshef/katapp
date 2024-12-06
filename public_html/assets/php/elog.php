<?php

    //error logging v2.72 fix *** open, and escape html chars

    require_once("{$_SERVER['DOCUMENT_ROOT']}/readenv.php");

    // Check environment variable for log path, fall back to php.ini setting if not found.
    $pathlog = getenv('PHP_ERROR_LOG') ?: ini_get('error_log');

    // If no path or it's not writable, use a temp directory fallback.
    if (!$pathlog || !is_writable($pathlog)) 
        $pathlog = sys_get_temp_dir() . '/JY78764.php.fallback.log';

    // Set the error log to the determined or fallback path.
    ini_set('error_log', $pathlog);

    
    // error log then exit - legacy 2023
    function exlog($message, $label = null, $source = null) {
        elog($message, $label, $source);
        $exitMessage = $label ?? $message;
        exit($exitMessage);
    }

    //log json exit
    function ljexit($responseData, $responseCode = false, $logMessage = false) {
        
        if (!$logMessage) $logMessage = $responseData;
        if (!is_string($logMessage)) $logMessage = json_encode($logMessage);
        
        elog($responseData, $logMessage);
        
        jexit($responseData, $responseCode);
    }
    
    //json exit
    function jexit($responseData, $responseCode = false) {
        
        header('Content-Type: application/json');
        if ($responseCode) http_response_code($responseCode);
        
        $isSuccess = $responseCode == 200 ||  //faster?
                    ($responseCode >= 200 && $responseCode < 300);

        if ($isSuccess) exit(json_encode(['status' => 'success', 'data' => $responseData]));
        
        if ($responseCode && $responseCode < 400) exit(json_encode($responseData));
        
        exit(json_encode(['error' => $responseData]));
    }


	function elog($message, $label = null, $source = null) {

        $source = $source ?? $_GET['debugsource'] ?? '';
        if ($source) $source = preg_replace('/[^a-z0-9]/i', '', $source);
      
		$backtrace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 2);
        //error_log(print_r($backtrace, true));
		$file = $backtrace[0]['file'];
		$line = $backtrace[0]['line'];

        $ip = $_SERVER['REMOTE_ADDR'];
        $out = "$ip $source";
        
        
        $open = (!$label || strpos($label, '***') === false) ?  '' : ' open';  // default closed unless *    
        $label = "<I>$label</I>";
        

        if (is_array($message) || is_object($message)) {
        
            $message = json_encode($message, JSON_PRETTY_PRINT);
            $message = preg_replace_callback('/\[\s*([\d,\s]+)\s*\]/', function($matches) {
                $innerContent = preg_replace('/\s+/', '', $matches[1]);
                return "[$innerContent]";
            }, $message);

            
            $message = htmlspecialchars($message, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $message = "\n<details $open><summary>$label</summary>$message</details>";
        } else $message = "$label $message";
        
        $out .= "$file Line $line $message";
                
		return error_log($out);
		
	}
    

    
    
?>
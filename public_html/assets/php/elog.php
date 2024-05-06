<?php

    //error logging v2.4
    
    require_once("{$_SERVER['DOCUMENT_ROOT']}/readenv.php");

    $envLogPath = getenv('PHP_ERROR_LOG'); // eg cong file SetEnv PHP_ERROR_LOG "/path to log"
    if ($envLogPath !== false)
        ini_set('error_log', $envLogPath);

    
    if (isset($env['LOG_LEVEL']) && $env['LOG_LEVEL'] == 'DEBUG') {
        $GLOBALS['isVerbose'] = true; 
        elog("note: global isVerbose was set by env LOG_LEVEL=DEBUG");
    }

    // error log then exit
    function exlog($message, $label = null, $source = null) {
        elog($message, $label, $source);
        $exitMessage = $label ?? $message;
        exit($exitMessage);
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
        
        $label = "<I>$label</I>";
 
        $isVerbose = $GLOBALS['isVerbose'] ?? false; 
        
        if ($isVerbose) {
            $codeLine = getLineFromFile($file, $line);
            //$out = "$ip $source $file Line $line $label";
            $variableName = extractVariableName($codeLine);
            if ($variableName) $label .= " \${$variableName} = ";
        }

        if (is_array($message) || is_object($message)) {//
            $message = json_encode($message, JSON_PRETTY_PRINT); //
            $open = ($isVerbose) ? ' open' : '';
            $message = "\n<details$open><summary>$label</summary>$message</details>";
        } else $message = "$label $message";
        
        
        $out .= "$file Line $line $message";
                
		return error_log($out);
		
	}
    
    function getLineFromFile($fileName, $lineNumber) {
        $line = '';
        $file = new SplFileObject($fileName);
        try {
            $file->seek($lineNumber - 1); // Seek to the line (zero-based index)
            $line = $file->current(); // Read the line
        } catch (Exception $e) {
            // Handle potential error, e.g., line number out of range
            error_log("Error accessing line $lineNumber in $fileName: " . $e->getMessage());
        }
        return $line;
    }

    function extractVariableName($codeLine) {
        //error_log($codeLine);
        //$pattern = '/elog\(\$(\w+)\)/';
        $pattern = '/elog\(\$(\w+)[,\)]/';
        preg_match($pattern, $codeLine, $matches);
        return $matches[1] ?? null; // Return the variable name, if found
    }

    
?>
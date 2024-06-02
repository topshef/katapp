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
            //$message = compressObjectForLog($message);
            //$cloneMessage = $message; // disable if any issues
            $cloneMessage = compressObjectForLog(json_decode(json_encode($message)));
            $message = json_encode($cloneMessage, JSON_PRETTY_PRINT); //
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





    // for debug via elog
    function compressObjectForLog($obj) {
        if (!$obj) return $obj;
        if (is_string($obj)) return $obj;
        if (is_array($obj)) return array_map('compressObjectForLog', $obj);
        //if (is_array($obj)) $obj = json_decode(json_encode($obj));
        //$obj = json_decode(json_encode($obj));
        try {
            foreach ($obj as $key => $value) {
                $obj->$key = is_object($value) 
                    ? (isset($value->type, $value->data) && $value->type === 'Buffer' && is_array($value->data) 
                        ? (object) array_merge((array) $value, [
                            'type' => 'Buffer (debug mode compressed WQ98233)',
                            //'data' => implode(',', str_replace(array("\r", "\n"), '', $value->data)),
                            'data' => implode(',', $value->data),
                            'hex' => toHexString_TY76341($value->data)
                          ]) 
                        : compressObjectForLog($value))
                    : (is_array($value) 
                        ? array_map('compressObjectForLog', $value) 
                        : $value);
            }
        } catch (Throwable $e) { // if error i just want to return the $obj as it is
            elog($e, "warning YR77212 compressObjectForLog failed");
            throw new Exception("Error in compressObjectForLog: " . $e->getMessage(), 0, $e);    
            //return $obj;  // unreachable return
        }
        return $obj;
    }
    
    function toHexString_TY76341($bytes) {
        return implode('', array_map(function($byte) { 
            return sprintf('%02x', $byte); 
        }, $bytes));
    }
    
    
?>
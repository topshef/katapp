<?php

    //v2.83 truncate before deep copy
    //v2.81 handle edge case uncountable object, and simplify
    //v2.80 truncate json if too long
    //v2.79 set reqref from header or default
    // see papi 2.78a
    //v2.78 wa fix path eiaio says old mcdaimolda
    //v2.77 re-instate readenv here .. why was it commmented out? todo rationalise env
    //v2.76 dont escape slashes in urls
    //v2.75 global reqref RR1234567 request ref for debugging 
    //v2.74 copied from atrixapp to papi
    //v2.73 try finally to avoid stuck profress
    //v2.72 global DEBUG to pool and collapse repetitive debug notes
    //error logging v2.71 for cron
    $docroot = $_SERVER['DOCUMENT_ROOT'] ?: implode(DIRECTORY_SEPARATOR, array_slice(explode(DIRECTORY_SEPARATOR, __DIR__), 0, 5));

   
    require_once("$docroot/readenv.php");

    // Check environment variable for log path, fall back to php.ini setting if not found.
    $pathlog = getenv('PHP_ERROR_LOG') ?: ini_get('error_log');

    // If no path or it's not writable, use a temp directory fallback.
    // if (!$pathlog || !is_writable($pathlog)) 
        // $pathlog = sys_get_temp_dir() . '/JY78764.php.fallback.log';

    if (!$pathlog || !is_writable(dirname($pathlog)))
         $pathlog = realpath("$docroot/../logs") . '/php_error_log.txt';

    // Set the error log to the determined or fallback path.
    ini_set('error_log', $pathlog);

    setReqRef();

    function setReqRef() {
        
        if (isset($GLOBALS['reqref'])) return;
        
        $reqref = $_SERVER['HTTP_K_REQUEST_REF'] ?? false;
        if ($reqref) return $GLOBALS['reqref'] = $reqref;
        
        
        $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
        $seed = $ip . ($_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true));
        $num  = crc32($seed);                  // returns unsigned 32-bit int

        // Emoji based on IP (stable for same user)ss
        $emojiUsers = explode(' ', '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵');
        $emojiUser = $emojiUsers[crc32($ip) % count($emojiUsers)];

        // Emoji based on request (adds variety)
        $emojiRequests = explode(' ', '🍎 🍌 🍊 🍇 🍉 🍓 🍒 🍍 🥝 🥥 🍑 🍈 🍐 🍋 🍏 🍠 🍅');
        $emojiRequest = $emojiRequests[$num % count($emojiRequests)];

        return $GLOBALS['reqref'] = "{$emojiUser}{$emojiRequest}RR" . substr((string)$num, 0, 7);        
    }


    $DEBUG = []; // general purpose array to collect debug info
    function dbug($obj) { // debug named for more unique search
        $GLOBALS['DEBUG'][] = $obj;
    }
    
    function flushDbug() { // empty and return the debug log
       $data = $GLOBALS['DEBUG'];
       if (!$data) return 'DONTSHOW';
       $GLOBALS['DEBUG'] = []; // reset
       return $data; 
    }    
    
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
        static $inProgress = false;
        if ($inProgress) return;
        $inProgress = true;

        try {
            if ($message === 'DONTSHOW') return;

            $source = $source ?? $_GET['debugsource'] ?? '';
            if ($source) $source = preg_replace('/[^a-z0-9]/i', '', $source);

            $backtrace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS, 2);
            $file = $backtrace[0]['file'];
            $line = $backtrace[0]['line'];

            $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
            $out = "$ip $source";
            
            if (is_string($message)) $message = "<I>$label</I> $message";
            else {
                if (!$label) $label = 'x';
                if (substr($label, 0, 1) == 'x')
                    $label = count((array)$message) . $label;

                $approxSize = strlen(serialize($message));
                $maxBytes = 100000; // ~0.1 MB
                if ($approxSize > $maxBytes) 
                    $message = "TF73664 elog message too long";
                else {
                    $message = json_encode($message, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
                    if ($message === false)
                        $message = "[elog] json_encode failed: " . json_last_error_msg();
                }
                
                $message = preg_replace_callback('/\[\s*([\d,\s]+)\s*\]/', function($matches) {
                    $innerContent = preg_replace('/\s+/', '', $matches[1]);
                    return "[$innerContent]";
                }, $message);

                $isDetailOpen = strpos($label, '***') === false;
                $open = ($isDetailOpen) ?  '' : ' open';
                $message = "\n<details $open><summary>$label</summary>$message</details>";
            }
                

            $out .= "$file Line $line {$GLOBALS['reqref']} $message"; //PHP Fatal error: Allowed memory size of 134217728 bytes exhausted

            return error_log($out);
        } finally {
            $inProgress = false;  // always reset
        }
    }
    

    
    
?>
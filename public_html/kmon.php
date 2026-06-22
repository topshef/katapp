<?php

    $path = "{$_SERVER['DOCUMENT_ROOT']}/assets/php/helpers/sendPost.php";
    if (!file_exists($path))
      $path = "{$_SERVER['DOCUMENT_ROOT']}/assets/php/sendPost.php";
      
    require_once $path;

		$GLOBALS['repo'] = getRepoName(); 

		function getRepoName() { //see also build.php
			$repo = trim(shell_exec('git config --get remote.origin.url'));
			if ($repo) $repoName = basename(parse_url(str_replace(':', '/', $repo), PHP_URL_PATH), '.git');
			return $repoName;
		}

    function kmon($test_id, $status, $notesOrDetails) {
        //v0.12 auto inject $_SERVER info and repo
        //v0.11 copied from pistmanAlert v0.11 wa papi
        $url = "https://kpay.uk/devtools/monitor/api.php";
        
				$test_id = injectServerInfo($test_id);
				$notesOrDetails = injectServerInfo($notesOrDetails);
				
        $details = $notesOrDetails; // fudging for upstream.. wip
        $notes = '';
        
        if (is_string($details)) {$notes = $details; $details = [];}
        else if (!is_array($details))
            $details = ['legacy details GY87764' => $details];  //remove this upstream
        
        // reqref to link multiple alerts from same request
        $reqref = $GLOBALS['reqref'] ?? false;
        $rr = preg_match('/RR\d{7}/', $reqref, $m) ? $m[0] : '';
                    
        $details['reqref'] = $reqref;
        $details['rr'] = $rr;
        $domain = $_SERVER['SERVER_NAME'];
        $details['log'] = "https://$domain/log.php?query=$rr";
        
        //$test_id, $result, $detail)
        $data = compact('test_id', 'status', 'notes', 'details');
                // $test_id,
                // $status,
                // $response_time,
                // $details
      
                
        $res = sendPost($url, json_encode($data));
        elog($data, "result $res of $url");
        return $res;
    }
			
		
		function injectServerInfo($text) {
				if (!is_string($text)) return $text;
				if (strpos($text, '{') === false) return $text;
				
			  $vars = $_SERVER;
				$vars['repo'] = $GLOBALS['repo'];

				return preg_replace_callback('/\{([^}]+)\}/', function ($m) use ($vars) {
						return array_key_exists($m[1], $vars) ? $vars[$m[1]] : $m[0];
				}, $text);
		}

		
?>
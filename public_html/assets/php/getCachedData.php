<?php

    session_start();

	//v0.34 getCacheDataSimple pass headers via global
	//v0.33 getCacheDataSimple cache handling
	//v0.32 flexible elog location
	//v0.31 copied from xproof v0.3 22 jan 2025
	//v0.3 getCacheDataSimple cli 22 jan 2025

	// check versions at https://kpay.uk/dirkies.php?pattern=*getCache*
    
	$path_elog = __DIR__ . "/elog.php";
	if (!file_exists($path_elog))
		$path_elog = "{$_SERVER['DOCUMENT_ROOT']}/elog.php";
	
	require_once($path_elog);
	

    function getCacheDataSimple($path, $cacheSeconds = 60, $cachePath = null, $cacheNoResponse = false) {
        //minimal version. instead of refactoring the messy fucker below
        $isCLI = php_sapi_name() === 'cli';
		
		if (is_dir($cachePath)) {
			rtrim($cachePath, '/');
			$cachePath = "$cachePath/autocache.$hash.txt";
		}
		
        if (!$cachePath) {
            $hash = hash('SHA1', $path);
			$basefolder = ($isCLI) ? __DIR__ : $_SERVER['DOCUMENT_ROOT'];
			// ENRICH-COLDPATH1: see getCacheData below — a missing dir makes every
			// cache write fail silently, so the cache is simply never populated.
			if (!is_dir("$basefolder/cache")) @mkdir("$basefolder/cache", 0775, true);
            $cachePath = "$basefolder/cache/autocache.$hash.txt";
        }
		
        elog($cachePath);
		// elog(file_exists($cachePath));
		
        if ($cacheSeconds === false) // ONLY use cache - will return nothing if missing
            return @file_get_contents($cachePath) ?: false; 
        
        if ($cacheSeconds === null && file_exists($cachePath)) // return cache only if it exists ie never refresh
            return file_get_contents($cachePath); 
        
        if ($cacheSeconds !== 0 && file_exists($cachePath)) {  //zero = don't use cache
			$ageSeconds = time() - filemtime($cachePath);
			if ($ageSeconds < $cacheSeconds)
				return file_get_contents($cachePath);
		}
        
        $data = file_get_contents($path);
		//only write if there's a response
        if ($data || $cacheNoResponse)
			$cacheBytes = file_put_contents($cachePath, $data);
        elog($http_response_header);
				
		$statusCode = null;
		
		$statusLine = $http_response_header[0] ?? null;
		$GLOBALS['last_http_status_line'] = $statusLine;

		if ($statusLine && preg_match('#HTTP/\d\.\d\s+(\d+)#', $statusLine, $m));
		  $statusCode = (int)$m[1];
		$isError = ($statusCode === null || $statusCode >= 400);
		if ($isError) $GLOBALS['last_http_status'] = $statusCode;
		
        elog(compact('statusCode', 'cachePath', 'cacheBytes', 'data'), "live call getCacheDataSimple($path, $cacheSeconds, $cachePath)");
        
        return $data;
    }
    
    
    // older functions from kfund etc...
    
// ok just noticed filename and function are slightly different names... confusing
	//so alias in passing
	function getCachedData($url, $timeoutseconds = null, $cacheOnly = false, $cachefolder = null) {
		return 	getCacheData($url, $timeoutseconds, $cacheOnly, $cachefolder = null);
	}

	function getCacheData($url, $timeoutseconds = null, $cacheOnly = false, $cachefolder = null) {
		/* get a file from cache or download it
		$timeoutseconds = 0      don't use cache
		$timeoutseconds = null   default, never timeout
		*/
		//$isDebug = $_SERVER['REMOTE_ADDR'] == '130.185.251.53';
		
		$startTime = time(); // for debug only, see header below
		
        $flags = $_SESSION['flags'] ?? false;
		if (is_array($flags)) extract($flags);
		
		//if ($timeoutseconds === null) $timeoutseconds = 60 * 60 * 24; // default 1 day
		
		$url = str_replace('&nocache','',$url);
		$url = str_replace('?nocache','?',$url);
		$url = str_replace('nocache','',$url);
		
		$hash = hash('SHA1', $url);
		
		//exit("$hash<BR>$url $timeoutseconds");
		//if ($cachefolder == null) $cachefolder = __DIR__ . "/cache";
		if ($cachefolder == null) $cachefolder = "{$_SERVER['DOCUMENT_ROOT']}/cache";
		// ENRICH-COLDPATH1: never let a missing cache dir silently swallow every
		// write (file_put_contents just warns and returns false, so the site keeps
		// "working" at full upstream cost with no cache, invisibly).
		if (!is_dir($cachefolder)) @mkdir($cachefolder, 0775, true);
		elog($cachefolder);
        
		$cachefile = "autocache.$hash.txt";
		$cachepath = "$cachefolder/$cachefile";
		
		if (file_exists("$cachepath.loading")) {  // cache is loading from another process
			$durationloading = time() - filemtime("$cachepath.loading");
			if ($durationloading < 60) 
				return "error KR994 cache loading locked, please retry";
			else {
				elog("another cache call seems stuck reading $url \n deleting $cachepath.loading");
				unlink("$cachepath.loading");
			}
		}
		

		if (file_exists($cachepath)) {
			if ($timeoutseconds === null) return file_get_contents($cachepath); // never timeout
			$ageseconds = time() - filemtime($cachepath);
			if ($ageseconds < $timeoutseconds) {
				$data = file_get_contents($cachepath);
				$isDataValid = ($data != null && $data != "\t");
				if ($isDataValid) return $data;
				else elog("warning: cache data was empty $cachepath");
			}
		}
		
		if ($cacheOnly) {
			elog("cacheOnly=true but could not find cache for $url $hash");
			$cachepath = "$cachefolder/autocache.$hash.missing";
			file_put_contents($cachepath, $url);
			return false;
		}
		
		// otherwise read from url
		file_put_contents("$cachepath.loading", "loading from $url"); // to prevent circular calls
		
        if (strpos(strtolower($url), 'ipfs') !== false) $data = downloadIPFS($url);
		else $data = file_get_contents($url);
		if ($data) {
			$bytes = strlen($data);
			//file_put_contents("$cachefolder/dir.txt", time() . "\t$hash\t$bytes\t$url\n", FILE_APPEND); // i think we can delete this now

			file_put_contents($cachepath, $data);

			// write a header file for debug, and management
			$cachepath_header = str_replace('.txt','.header.txt', $cachepath);
			$callDuration = time() - $startTime;
			$header = compact('url','hash', 'cachefolder', 'cachefile', 'timeoutseconds', 'cacheOnly', 'callDuration', 'bytes');
			$result = file_put_contents($cachepath_header, json_encode($header, JSON_PRETTY_PRINT));

			elog("result $result writing cache for $url to $cachepath");
		}

		// KDIAG-CACHELOCK1: this used to unlink() only inside the if($data) branch
		// above, so a failed/empty origin fetch (file_get_contents returning false)
		// left the .loading lock in place — every caller hitting the same $url
		// (same hash) got the literal string "error KR994 cache loading locked,
		// please retry" instead of real data or a clean failure, for up to 60s.
		// Reproduced live 2026-07-11: an errored kpool call left this file stuck.
		// Release the lock regardless of outcome.
		if (file_exists("$cachepath.loading")) unlink("$cachepath.loading");

		return $data;

	}
  
    function downloadIPFS($url) {
        elog("attempt download $url");
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true); // Follow redirects, important for some IPFS gateways
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36');

        $data = curl_exec($ch);

        if (curl_errno($ch)) {
            curl_close($ch);
            return ['error' => 'cURL Error: ' . curl_error($ch)];
        }
        
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE); // Get MIME type from response

        curl_close($ch);
        
        return $data; // just the data for now
         
        // later if needed
        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $detectedMimeType = $finfo->buffer($data); 

        return [
            'mime_type' => $contentType, // or 'mime_type' => $detectedMimeType if using the detected MIME type
            'data' => $data
        ];
    
    }
  
  
	function updateMissingCache($limit=10) {
		// eg use for cron job update missing cache data
		$pattern = glob("$cachefolder/autocache.*.missing");
		$files = glob($pattern);
		foreach ($files as $filepath) {
			$url = file_get_contents($filepath);
			$result = getCacheData($url, null, $cacheOnly = false);
			if ($result)
				$newpath = str_replace('.missing', '.txt', $filepath);
			else 
				$newpath = str_replace('.missing', '.failed', $filepath);
			rename($filepath, $newpath);
		}
	}
  
?>
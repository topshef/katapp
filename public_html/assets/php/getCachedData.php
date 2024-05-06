<?php

// ok just noticed filename and function are slightly different names... confusing
	//so alias in passing
	function getCachedData($url, $timeoutseconds = null, $cacheOnly = false) {
		return 	getCacheData($url, $timeoutseconds, $cacheOnly);
	}

	function getCacheData($url, $timeoutseconds = null, $cacheOnly = false, $cachefolder = null) {
		/* get a file from cache or download it
		$timeoutseconds = 0      don't use cache
		$timeoutseconds = null   default, never timeout
		*/
		//error_log("calling getCacheData timeoutseconds=$timeoutseconds cacheOnly=$cacheOnly for for url=$url");
		$startTime = time(); // for debug only, see header below
		
		if ($_SESSION['flags']) extract($_SESSION['flags']);
		
		//$isDebugMode = $GLOBALS['isDebugMode'];
		
		//if ($timeoutseconds === null) $timeoutseconds = 60 * 60 * 24; // default 1 day
		
		$url = str_replace('&nocache','',$url);
		$url = str_replace('?nocache','?',$url);
		$url = str_replace('nocache','',$url);
		
		$hash = hash('SHA1', $url);
		
		//exit("$hash<BR>$url $timeoutseconds");
		//if ($cachefolder == null) $cachefolder = __DIR__ . "/cache";
		if ($cachefolder == null) $cachefolder = "{$_SERVER['DOCUMENT_ROOT']}/cache";
		
		$cachefile = "autocache.$hash.txt";
		$cachepath = "$cachefolder/$cachefile";
		if ($isDebugMode) error_log("cachepath = $cachepath");

		if (file_exists($cachepath)) {
			if ($timeoutseconds === null) {
				//error_log("return from getCacheData cachepath=$cachepath ");
				return file_get_contents($cachepath); // never timeout
			}
			
			$ageseconds = time() - filemtime($cachepath);
			//if ($ageseconds < $timeoutseconds) exit("use cache, ageseconds = $ageseconds, timeoutseconds = $timeoutseconds");
			if ($ageseconds < $timeoutseconds) {
				if ($isDebugMode) error_log("getting cache data from <a href='$cachepath'>$cachepath</a>");
				$data = file_get_contents($cachepath);
				//error_log("X{$data}X");
				$isDataValid = ($data != null && $data != "\t");
				if ($isDataValid) return $data;
				else error_log("warning: cache data was empty $cachepath");
				
			}
		}
		
		if ($cacheOnly) {
			error_log("cacheOnly=true but could not find cache for $url $hash");
			$cachepath = "$cachefolder/autocache.$hash.missing";
			file_put_contents($cachepath, $url);
			return false;
		}
		
		// otherwise read from url
		error_log("getting data from $url");
		$data = file_get_contents($url);
		if ($data) {
			file_put_contents("$cachefolder/dir.txt", time() . "\t$hash\t$url\n", FILE_APPEND);
			file_put_contents($cachepath, $data);
			
			// write a header file for debug, and management
			$cachepath_header = str_replace('.txt','.header.txt', $cachepath);
			$callDuration = time() - $startTime;
			$header = compact('url','hash', 'cachefolder', 'cachefile', 'timeoutseconds', 'cacheOnly', 'callDuration');
			$result = file_put_contents($cachepath_header, json_encode($header, JSON_PRETTY_PRINT));
			
            error_log("result $result writing cache for $url to $cachepath");
		}
		return $data;

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
 
<?php

// ok just noticed filename and function are slightly different names... confusing
	//so alias in passing
	function getCachedData($url, $timeoutseconds = null, $cacheOnly = false) {
		return 	getCacheData($url, $timeoutseconds, $cacheOnly);
	}

	function getCacheData($url, $timeoutseconds = null, $cacheOnly = false, $cacheFolder = null) {
		/* get a file from cache or download it
		$timeoutseconds = 0      don't use cache
		$timeoutseconds = null   default, never timeout
		*/
		
		$startTime = time(); // for debug only, see header below
		
		extract($_SESSION['flags']);
		
		//$isDebugMode = $GLOBALS['isDebugMode'];
		
		//if ($timeoutseconds === null) $timeoutseconds = 60 * 60 * 24; // default 1 day
		
		$url = str_replace('&nocache','',$url);
		$url = str_replace('?nocache','?',$url);
		$url = str_replace('nocache','',$url);
		
		$hash = hash('SHA1', $url);
		
		//exit("$hash<BR>$url $timeoutseconds");
		//if ($cacheFolder == null) $cacheFolder = __DIR__ . "/cache";
		if ($cacheFolder == null) $cacheFolder = "{$_SERVER['DOCUMENT_ROOT']}/cache";
		
		$cachepath = "$cacheFolder/autocache.$hash.txt";
		if ($isDebugMode) error_log("cachepath = $cachepath");

		if (file_exists($cachepath)) {
			if ($timeoutseconds === null) return file_get_contents($cachepath); // never timeout
			
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
			$cachepath = "$cacheFolder/autocache.$hash.missing";
			file_put_contents($cachepath, $url);
			return false;
		}
		
		// otherwise read from url
		error_log("getting data from $url");
		$data = file_get_contents($url);
		if ($data) {
			file_put_contents("$cacheFolder/dir.txt", time() . "\t$hash\t$url\n", FILE_APPEND);
			file_put_contents($cachepath, $data);
			
			// write a header file for debug
			$cachepath_header = str_replace('.txt','.header.txt', $cachepath);
			$callDuration = time() - $startTime;
			$header = compact('url','timeoutseconds', 'cacheOnly', 'cacheFolder', 'callDuration');
			file_put_contents($cachepath_header, json_encode($header, JSON_PRETTY_PRINT));
			
			error_log("wrote data $cachepath");
		}
		return $data;

	}
  
	function updateMissingCache($limit=10) {
		// eg use for cron job update missing cache data
		$pattern = glob("$cacheFolder/autocache.*.missing");
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
 
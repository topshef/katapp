<?php
// get path of environment variables
	// 20201213 allow comments
	// 20201214 .envpath optional - default to local .env [later maybe to first match]
	// 20210201 only split once per line (allows multiple =)
	// 20210202 cycle thru all env files
	// 20210421 define constants if constant 'SET_ENV_CONSTANT' is set

// get list of env files
$files_env     = glob(__DIR__ . '/.env');        // this is at most 1 file
$files_envpath = glob(__DIR__ . '/.envpath*');   // this can be many files
//elog($files_envpath);

array_multisort($files_envpath, SORT_ASC, $files_envpath); //sort alphabetical, i think
$files = array_merge($files_envpath, $files_env);

//elog($files);	
    
foreach($files as $filepath) {
	//echo $filepath . "<BR>";
	$filename = basename($filepath);
	if (substr($filename, 0, 8) == '.envpath') $envpath = preg_replace( "/\r|\n/", "", file($filepath)[0]);  //read 1st line only
		else $envpath = $filepath;

    if ($envpath[0] !== '/')
        $envpath = realpath(__DIR__ . "/" . $envpath);
    
    if (!file_exists($envpath)) {
        elog("RW83774 failed to find env file $envpath");
        continue;
    }

	// read environment variables 
	$envdata = file($envpath);

	foreach ($envdata as $line) {
		if (substr($line,0,1)=='#') continue;
		if (strpos($line, '=') == 0) continue;
		$line = str_replace("\n","",$line);
		$line = str_replace("\r","",$line);
		$kv = explode('=', $line, 2);  // max 2 elements, ie only split once per line
		if ($kv[0]=='') continue;
		if (defined('SET_ENV_CONSTANT')) define($kv[0], $kv[1]);  //into php constants
		$env[$kv[0]] = $kv[1];   //and/or an array
	}
	
} // end of foreach files


// seems overkill
// function is_absolute_path($path) {
    // return ($path[0] === '/' || $path[0] === '\\' || (strlen($path) > 1 && $path[1] === ':'));
// }

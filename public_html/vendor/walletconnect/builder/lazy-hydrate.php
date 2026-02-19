<?php
/**
 * -lazyhydrate.php
 *
 * Generic pull-through cache hydrator.
 *
 * When a requested file does not exist locally, Apache rewrites
 * the request to this script. This script:
 *
 * 1. Validates the requested path.
 * 2. Attempts to fetch the same relative path from one of the
 *    configured origin servers.
 * 3. If successful, writes the file locally (atomic write).
 * 4. Redirects the client back to the original URL.
 *
 * This enables lazy hydration of public artifacts without cron,
 * SSH, or push-based deployment.
 *
 * IMPORTANT:
 * - This script only works for publicly accessible origin files.
 * - Ensure this directory is writable by PHP.
 * - Adjust path validation rules carefully.
 */

// -------------------------------
// Configuration
// -------------------------------
require_once "{$_SERVER['DOCUMENT_ROOT']}/assets/php/elog.php";

$appName    = $_SERVER['REDIRECT_appName'] ?? false;
$fileName   = $_SERVER['REDIRECT_fileName'] ?? null;
$appVersion = $_SERVER['REDIRECT_appVersion'] ?? false;
$gitCommit  = $_SERVER['REDIRECT_gitCommit'] ?? false;

elog([$_GET, $_SERVER, $_ENV, getenv()]);


if ($appVersion) $basepath = "releases/$appVersion/$fileName";
if ($gitCommit)  $basepath = "snapshots/$gitCommit/$fileName";
// elog(__DIR__); // where we are

if (!$appVersion && !$gitCommit) {
    javascript_exit('error UJ39848 invalid hydrate context');
}


//note this currently wont work for latest.js etc, but coudl be adapted to lookup remote latest.json and inspect

$localDir = __DIR__;

// List of origin base URLs (no trailing slash)
$origins = [
    'https://swap.kpay.live/public_html/vendor/walletconnect/builder',
    // 'https://backup.example.com/builder'
];

// echo "<PRE>GH82738 basepath = $basepath";

$isSuccess = false;
$debug = [];

foreach ($origins as $origin) {
	foreach (['js', 'js.map', 'md', 'json'] as $ext) {
		$remotePath = "$origin/$basepath.$ext";
		$localPath = "$localDir/$basepath.$ext";
		// if (file_exists($localPath)) continue;  // 
		if (file_exists($localPath)) javascript_exit('unexpected error UJ83744 server local file already exists');
		
		// echo "pull: $localPath <= $remotePath\n";
		$context = stream_context_create(['http' => ['ignore_errors' => true]]);
		$raw = file_get_contents($remotePath, false, $context);
		$headers = $http_response_header ?? [];
		$status = get_final_status($headers);
		// elog($headers, "status = $status from $remotePath");
		
		$isOk = $status >= 200 && $status < 300 && strlen($raw) > 0;
		if (!$isOk ) elog($headers, "\nYH83744 status=$status failed to fetch $remotePath");
		else elog("\nok fetch $remotePath");

		//fatal if js missing. others optional
		if (!$isOk  && $ext == 'js') {
			$debug[] = "error DW39244 failed to hydrate artifact $appName $appVersion $gitCommit $remotePath";
			break; // try next origin
		}
		// elog($raw);
		if (!$isOk) continue;
		
		// $resput = file_put_contents($localPath, $raw);
		if (!atomic_write($localPath, $raw) && $ext == 'js')
			javascript_exit("error RH23744 failed to save valid artifact $appName $appVersion $gitCommit");
		
		// elog("resput=$resput writing $localPath");
		// if (!$resput && $ext == 'js') javascript_exit("error RH23744 failed to save valid artifact $appName $appVersion $gitCommit");
		
		if ($ext == 'js') $isSuccess = true; // we're done, we have the artifact
	}
	
	if ($isSuccess) break;
} //end foreach origins
elog($debug, "x debug entries HJ87374");

if (!$isSuccess) javascript_exit(json_encode($debug));

// serve js script "$localDir/$basepath.js"
$jsPath = "$localDir/$basepath.js";

if (!file_exists($jsPath))
    javascript_exit("error JS94833 hydrated js missing after success");

$size = filesize($jsPath);
if (!$size)
    javascript_exit("error JS94834 hydrated js empty after write");

header('Content-Type: application/javascript');
header('Content-Length: ' . $size);
header('Cache-Control: public, max-age=31536000, immutable');
if ($gitCommit && $gitCommit !== 'latest' && $gitCommit !== 'hottest') {
    header('Cache-Control: public, max-age=31536000, immutable');
} else {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
}

readfile($jsPath);
exit;


//helpers

function javascript_exit($msg) {
	header('Content-Type: application/javascript');	
	exit("console.log('$msg')");
}

function get_final_status(array $headers) {
    $status = null;

    foreach ($headers as $line) {
        if (strpos($line, 'HTTP/') === 0) {
            preg_match('#HTTP/\d+\.\d+\s+(\d+)#', $line, $m);
            $status = isset($m[1]) ? (int)$m[1] : null;
        }
    }

    return $status;
}

function atomic_write($path, $data) {
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0755, true))
        return false;

    $tmp = $path . '.tmp.' . uniqid('', true);

    if (file_put_contents($tmp, $data, LOCK_EX) === false) {
        @unlink($tmp);
        return false;
    }

    if (!rename($tmp, $path)) {
        @unlink($tmp);
        return false;
    }

    return true;
}




//  we coudl fetch a tar.gz or cycle thru artifacts.. maybe best fetch tar.gz and extract
// and or do it from shell 
// $cmd = sprintf(
    // 'tar -xzf %s -C %s',
    // escapeshellarg($archive),
    // escapeshellarg($targetDir)
// );

// exec($cmd, $output, $status);

// if ($status !== 0) {
    // throw new Exception("Extraction failed");
// }




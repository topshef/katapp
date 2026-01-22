<?php



$isAllowed = false;
$ip = $_SERVER['REMOTE_ADDR'];
//84.66.252.172 is sobo remove later
$ipAllowed = explode(' ', '84.66.252.172 130.185.251.53 176.126.78.48 130.185.251.77 130.185.249.180 194.35.13.212 82.118.227.86 194.35.12.127');
if (in_array($ip, $ipAllowed)) $isAllowed = true;

if (!$isAllowed) exit("UY83774 denied");

require_once "{$_SERVER['DOCUMENT_ROOT']}/assets/php/elog.php";

header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Content-Type: application/json");

$GLOBALS['gitroot'] = getGitRoot();

$buildId = trim(exec('git rev-parse --short HEAD'));

$patchHash = trim(exec('git diff | git hash-object --stdin'));
$patchHash = substr($patchHash, 0, 8);

$dirtyFiles = getDirtyFiles($_GET['detail'] ?? true);

$workingHash = calcWorkingHash([$buildId, $dirtyFiles, $patchHash]);


$comments = [];
$comments[] = "buildId: the current git commit hash";
$comments[] = "workingHash: composite hash reflecting any change (build, dirty files, patch)";


$repo = getRepoOrigin();

$out = compact('repo', 'buildId', 'patchHash', 'workingHash', 'dirtyFiles', 'comments');

// optionally enrich with files hashes and timestamps


echo json_encode($out);

// buildId:        d4fba06
// workingState:  clean | dirty
// patchHash:     null | 8f1a9c3


function calcWorkingHash(array $parts) {
  $chunks = [];

  foreach ($parts as $part)
    $chunks[] = is_array($part) || is_object($part)
      ? json_encode($part, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
      : (string)$part;

  return substr(sha1(implode("\n", $chunks)), 0, 8);
}


function getGitRoot() {
  $out = [];
  exec('git rev-parse --show-toplevel 2>/dev/null', $out);
  return $out[0] ?? null;
}

function getDirtyFiles($detail = false) {

	$lines = [];
	exec('git status --porcelain', $lines);
	
	$dirtyFiles = [];
	foreach($lines as $line) {
		$status = trim(substr($line,0,3));
		$path = substr($line,3);
  	$dirtyFiles[$path] = $status;
  	// $dirtyFiles[$path] = compact('status');
	}

	ksort($dirtyFiles);
	if (!$detail) return $dirtyFiles;

	//optionally enrich
	$gitroot = $GLOBALS['gitroot'];
	foreach ($dirtyFiles as $path => $status) {
			$fullpath = "$gitroot/$path";
			$rec = (object)[];		
		  $rec->status = $status;
			// $rec->fullpath = $fullpath;
			
			if (is_file($fullpath)) {
				$rec->mtime = filemtime($fullpath);
				$rec->mtimeReadable = gmdate('Y-m-d H:i:s', $rec->mtime);

				$rec->sha1 = substr(sha1($fullpath),0,8);
			}
			$dirtyFiles[$path] = $rec;
		
	}
	
	return $dirtyFiles;
	
}


/* 
git status=
' ' = unmodified
M   = modified
A   = added
D   = deleted
R   = renamed
C   = copied
U   = unmerged (conflict)
??  = untracked
!!  = ignored

*/

// $GLOBALS['repo'] = getRepoName();

function getRepoOrigin() {
	$out = (object)[];
	$repo = trim(shell_exec('git config --get remote.origin.url'));
	if (!$repo) return 'GH84754 no repo found';

	$repo = preg_replace('/\.git$/', '', $repo);
	
	[$ssh_user_host, $gitUserRepo] = explode(':', $repo);
	
  // $repoName = basename(parse_url(str_replace(':', '/', $repo), PHP_URL_PATH), '.git');
	// return [$repo, $ssh_user_host, $gitUserRepo];
	return $gitUserRepo;
}


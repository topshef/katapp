<?php

require_once "{$_SERVER['DOCUMENT_ROOT']}/assets/php/elog.php";

header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Content-Type: application/json");

$gitRootPath = getGitRoot();

function getGitRoot() {
  $out = [];
  exec('git rev-parse --show-toplevel 2>/dev/null', $out);
  return $out[0] ?? null;
}


$buildId = trim(exec('git rev-parse --short HEAD'));
$dirtyFiles = [];
exec('git status --porcelain', $dirtyFiles);

$patchHash = trim(exec('git diff | git hash-object --stdin'));
$patchHash = substr($patchHash, 0, 8);

$workingHash = calcWorkingHash([$buildId, $dirtyFiles, $patchHash]);

$comment = "workingHash: composite hash reflecting any change (build, dirty files, patch)";


echo json_encode(compact('buildId', 'dirtyFiles', 'patchHash', 'workingHash'));

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



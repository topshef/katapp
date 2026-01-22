<?php
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Content-Type: application/json");

$out = (object)[];
$out->buildId = trim(exec('git rev-parse --short HEAD'));
$out->dirtyFiles = [];
exec('git status --porcelain', $out->dirtyFiles);


$out->patchHash = trim(exec('git diff | git hash-object --stdin'));
$out->patchHash = substr($out->patchHash, 0, 8);

$out->workingHash = workingTreeHash($out->dirtyFiles);

$out->comment = "workingHash: content-based hash of all dirty files representing the current runtime state";


echo json_encode($out);

// buildId:        d4fba06
// workingState:  clean | dirty
// patchHash:     null | 8f1a9c3

function workingTreeHash(array $dirty)
{
  $entries = [];

  foreach ($dirty as $line) {
    // Strip porcelain prefix: "XY "
    $path = substr($line, 3);

    if (is_file($path))
      $entries[] = $path . "\0" . hash_file('sha1', $path);
    else // File missing, deleted, or race condition
      $entries[] = $path . "\0" . 'missing';
  }

  // Canonical ordering so hash is stable
  sort($entries, SORT_STRING);

  // Root hash (Merkle-ish)
  return substr(sha1(implode("\n", $entries)), 0, 8);
}

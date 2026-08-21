<?php
require_once "{$_SERVER['DOCUMENT_ROOT']}/elog.php";


elog($_SERVER);
// exit("JF39944");
$action = $_GET['action'] ?? 'create';


require_once "{$_SERVER['DOCUMENT_ROOT']}/hapi_base.php";
$hapi_base = get_hapi_base();

$target = "https://$hapi_base/katomia/$action";

// Forward remaining query params (everything except action) — GET endpoints like
// /katomia/bindings?network=…&accountId=… need them (BIND-PAGE1, 2026-08-03).
$qs = $_GET;
unset($qs['action']);
if($qs) $target .= (strpos($action, '?') === false ? '?' : '&') . http_build_query($qs);

$ch = curl_init($target);

$headers = [];
foreach(getallheaders() as $name => $value){
  // accept-encoding stripped + CURLOPT_ENCODING '' — same double-gzip fix as
  // hapi-proxy.php (2026-08-21): forwarding it re-compressed an already-gzipped
  // body via this host's mod_deflate and garbled large responses.
  if(!in_array(strtolower($name), ["host", "accept-encoding"], true)){
    $headers[] = "$name: $value";
  }
}
// page host forwarded so backend-built permalinks (kfeedback view links etc.)
// point at THIS origin, not the backend: express takes split(',')[0] of
// x-forwarded-host, and the backend's own Apache appends after ours.
$headers[] = 'X-Forwarded-Host: ' . ($_SERVER['HTTP_HOST'] ?? '');

curl_setopt_array($ch, [
  CURLOPT_CUSTOMREQUEST => $_SERVER['REQUEST_METHOD'],
  CURLOPT_HTTPHEADER => $headers,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_ENCODING => '',
  CURLOPT_POSTFIELDS => file_get_contents("php://input")
]);

$response = curl_exec($ch);

$httpcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

curl_close($ch);

if($contentType)
  header("Content-Type: $contentType");

http_response_code($httpcode);

echo $response;


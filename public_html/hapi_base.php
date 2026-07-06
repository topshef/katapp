<?php



function get_hapi_base($network = null, $multiNode = false) {
  require_once "{$_SERVER['DOCUMENT_ROOT']}/elog.php";
  require_once "{$_SERVER['DOCUMENT_ROOT']}/kmon.php";

  $envPath = dirname($_SERVER['DOCUMENT_ROOT']) . '/.env_hapi';
  $env = is_readable($envPath) ? parse_ini_file($envPath) : [];

  elog($env);

  $base = trim($env['HAPI_BASE'] ?? '');

  if (!$base) {
    $base = 'hapi4.hbar.live';
    kmon("{$_SERVER['SERVER_NAME']} phpjabbers hapi HAPI_BASE fallback PJ87553", 'fail', $_SERVER);
  }

  $nodes = array_map(function($node) {
    $node = trim($node);

    if (strpos($node, 'https://') === 0) $node = substr($node, 8);
    elseif (strpos($node, 'http://') === 0) $node = substr($node, 7);

    return rtrim($node, '/');
  }, explode(',', $base));

  $nodes = array_values(array_filter($nodes));

  if ($multiNode) return $nodes;

  return $nodes[0] ?? 'hapi4.hbar.live';
}


// graveyard
function zzget_hapi_base($network = null) {  // not using network input yet
  require_once "{$_SERVER['DOCUMENT_ROOT']}/elog.php";
  require_once "{$_SERVER['DOCUMENT_ROOT']}/kmon.php";

  $envPath = dirname($_SERVER['DOCUMENT_ROOT']) . '/.env_hapi';
  $env = is_readable($envPath) ? parse_ini_file($envPath) : [];

  elog($env);

  $base = $env['HAPI_BASE'] ?? '';

  // strip protocol (simple + readable)
  if (strpos($base, 'https://') === 0) $base = substr($base, 8);
  elseif (strpos($base, 'http://') === 0) $base = substr($base, 7);

  if (!$base) {
    $base = 'hapi4.hbar.live';
    kmon("{$_SERVER['SERVER_NAME']} phpjabbers hapi HAPI_BASE fallback PJ87553", 'fail', $_SERVER);
  }

  return $base;
}
<?php

function get_hapi_base($network = null) {  // not using network input yet
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


<?php



// admin-only override via ?hapi_base= — see kpool.php for the IP gate
const HAPI_BASE_ALLOWED_OVERRIDES = [
  'hapi4.hbar.live',
  'hapi2.hbar.live/live',
  'api.gomint.me/live',
  'alpha.katlab.kpay.live',
  'bravo.katlab.kpay.live',
  'charlie.katlab.kpay.live',
];

// Shared reader for .env_hapi. Exists because a MALFORMED env file is otherwise
// silent and catastrophic: parse_ini_file() returns FALSE, every lookup below yields
// '', HAPI_BASE falls back to the hard-coded hapi4.hbar.live, and because that host is
// unreachable the page's synchronous widget <script> tag HANGS the browser — a total
// outage presenting as "the site is slow". Lived through on pat 2026-08-21.
//
// THE TRAP: '#' is NOT a comment character in PHP ini files (support was dropped in
// PHP 7) — only ';' is. A '#' line is parsed as a key/value, so one containing a
// reserved character such as '(' is a hard syntax error that voids the WHOLE file.
// Several .env_hapi files across the estate still carry '#' comments that happen to
// parse; treat them as landmines and write ';' when you edit one.
function read_hapi_env() {
  $envPath = dirname($_SERVER['DOCUMENT_ROOT']) . '/.env_hapi';
  if (!is_readable($envPath)) return [];

  $env = @parse_ini_file($envPath);
  if ($env === false) {
    // Loud, not silent: this is a config outage, not a missing optional value.
    if (function_exists('kmon'))
      kmon("{$_SERVER['SERVER_NAME']} .env_hapi UNPARSEABLE (ini syntax; '#' is not a comment, use ';') PJ87554", 'fail', $_SERVER);
    error_log("hapi_base: .env_hapi at $envPath failed to parse — falling back, expect a dead backend host");
    return [];
  }
  return $env;
}

// OPS-GCE1 option A (2026-08-21): the origin the SERVER uses to reach the backend,
// returned as a full "scheme://host[:port]" prefix. Defaults to https://<HAPI_BASE>,
// which is exactly what every server-side caller used to build by hand.
//
// WHY IT EXISTS. On the GCE box the frontend and backend share a machine, but
// HAPI_BASE is the backend's PUBLIC hostname — so hapi.php's curl left the box, went
// out to the internet and came back in to our own external IP. The moment the origin
// firewall narrows to Cloudflare ranges that hairpin is refused and every server-side
// API call breaks. Set HAPI_INTERNAL in .env_hapi (e.g. http://127.0.0.1:8030) and the
// call never leaves the box, so the firewall simply cannot affect it.
//
// DELIBERATELY SEPARATE FROM HAPI_BASE, not a replacement for it: HAPI_BASE is the
// value the BROWSER may be handed (config.php), and a loopback address there would
// break every client on the internet. HAPI_INTERNAL is read only here and is never
// emitted to a page.
//
// Scheme rule: honour an explicit http:// or https://; otherwise assume http, because
// the only sane reason to set this is a loopback/private target that has no
// certificate matching its address — https to 127.0.0.1 would fail verification,
// which is the whole reason the plain get_hapi_base() path could not be reused.
function get_hapi_origin() {
  require_once "{$_SERVER['DOCUMENT_ROOT']}/kmon.php";
  $internal = trim(read_hapi_env()['HAPI_INTERNAL'] ?? '');

  if ($internal !== '') {
    if (!preg_match('~^https?://~i', $internal)) $internal = 'http://' . $internal;
    return rtrim($internal, '/');
  }

  return 'https://' . get_hapi_base();
}

function get_hapi_base($network = null, $multiNode = false, $override = null) {
  require_once "{$_SERVER['DOCUMENT_ROOT']}/elog.php";
  require_once "{$_SERVER['DOCUMENT_ROOT']}/kmon.php";

  $override = trim($override ?? '');

  if ($override && in_array($override, HAPI_BASE_ALLOWED_OVERRIDES, true)) {
    $base = $override;
  } else {
    $env = read_hapi_env();

    elog($env);

    $base = trim($env['HAPI_BASE'] ?? '');
  }

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
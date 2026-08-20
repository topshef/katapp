<?php

header('Content-Type: application/javascript; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Content-Type-Options: nosniff');

require_once "{$_SERVER['DOCUMENT_ROOT']}/hapi_base.php";
$hapi_base = get_hapi_base();

// KAT-SAMEORIGIN-FE1: this module is the widget's OWN config and was bypassing the
// same-origin switch in m/katomia/config.php — with KAT_SAMEORIGIN=1 the page hid
// the backend origin but the widget's tx socket still learned it here. Same rule:
// empty HAPI_BASE = same-origin (consumers fall back to <page host>/hapi). Known
// edge: the ?hapi_base= admin override lives on the PAGE url, not this module
// request, so cross-origin override + widget signing stays on the page's inline
// CONFIG only — acceptable for an admin-only dev path.
$kat_env_path = dirname($_SERVER['DOCUMENT_ROOT']) . '/.env_hapi';
$kat_env = is_readable($kat_env_path) ? parse_ini_file($kat_env_path) : [];
if(!empty($kat_env['KAT_SAMEORIGIN'])) $hapi_base = '';

?>
export const CONFIG = {
  HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
}
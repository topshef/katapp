<?php

header('Content-Type: application/javascript; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Expires: 0');
header('X-Content-Type-Options: nosniff');

require_once "{$_SERVER['DOCUMENT_ROOT']}/hapi_base.php";
$hapi_base = get_hapi_base();

?>
export const CONFIG = {
  HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
}
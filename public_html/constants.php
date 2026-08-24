<?php

//require_once "{$_SERVER['DOCUMENT_ROOT']}/readenv.php";
require_once 'readenv.php';

//$api_endpoint = "https://gomint.me/saas/v2poc";
$api_endpoint = $env['url_api_gomint_NFT_shop'];  // needed if readying user profile. also note IP ACL

//$api_endpoint_NFT_explore = "https://labs.gomint.me/explore/NFT";
//$api_endpoint_NFT_explore = "https://gomint.me/explore/NFT";
// GMKFUND-LOCAL1 (2026-08-24): NFT/token metadata now comes from OUR backend
// (/katomia/enrich), not the dead kfund host. No new configuration: the origin comes from
// the frontend<->backend tether that already exists (.env_hapi via get_hapi_origin), the
// same one hapi.php uses — so every host follows its own pairing automatically.
// The callers append "?json&productId=..."; the backend ignores the stray `json` param.
// Falls back to the env upstream only when there is no tether (e.g. CLI/cron with no
// DOCUMENT_ROOT), so nothing that used to work stops working.
$api_endpoint_NFT_explore = $env['url_api_gomint_NFT_explore'];
if (!empty($_SERVER['DOCUMENT_ROOT']) && is_readable("{$_SERVER['DOCUMENT_ROOT']}/hapi_base.php")) {
    require_once "{$_SERVER['DOCUMENT_ROOT']}/hapi_base.php";
    if (function_exists('get_hapi_origin')) {
        $origin = get_hapi_origin();
        if ($origin) $api_endpoint_NFT_explore = rtrim($origin, '/') . '/katomia/enrich';
    }
}

//echo "<PRE>" . print_r($env, true); exit;

$isPocMode = $env['POCMODE'] === 'yes'; // probably we'll delete the poc code but leave it for now and use this flag to disable it

?>

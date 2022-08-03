<?php

//require_once "{$_SERVER['DOCUMENT_ROOT']}/readenv.php";
require_once 'readenv.php';

//$api_endpoint = "https://gomint.me/saas/v2poc";
$api_endpoint = $env['url_api_gomint_NFT_shop'];

//$api_endpoint_NFT_explore = "https://labs.gomint.me/explore/NFT";
//$api_endpoint_NFT_explore = "https://gomint.me/explore/NFT";
$api_endpoint_NFT_explore = $env['url_api_gomint_NFT_explore'];

//echo "<PRE>" . print_r($env, true); exit;

$isPocMode = $env['POCMODE'] === 'yes'; // probably we'll delete the poc code but leave it for now and use this flag to disable it

?>

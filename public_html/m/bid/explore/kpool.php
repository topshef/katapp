<?php

//placeholder minimal kpool call

$url = "https://hapi2.hbar.live/live/kpool/txList?network=mainnet";

$json = file_get_contents($url);

header('Content-type: application/json');

echo $json;

?>
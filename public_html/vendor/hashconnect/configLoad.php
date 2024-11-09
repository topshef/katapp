<?php

// load js config info to php session

//quick n scrappy needs review. done to maintain clean urls for users

session_start();

require_once("{$_SERVER['DOCUMENT_ROOT']}/elog.php");

// if (isset($_GET['autoexec'])) getConfig();
// getConfig();

// $config = getConfig();
// $config_network = $config->network ?? null;


// ┌─┐┌─┐┌┬┐  ╔╗╔┌─┐┌┬┐┬ ┬┌─┐┬─┐┬┌─
// │ ┬├┤  │   ║║║├┤  │ ││││ │├┬┘├┴┐
// └─┘└─┘ ┴   ╝╚╝└─┘ ┴ └┴┘└─┘┴└─┴ ┴
// get Network
// allowing user to override
function getNetwork() {

    $config_network = getConfig();
    
    $user_network = $_GET['network'] ?? '';
    $user_network = in_array($user_network, ['testnet', 'mainnet']) ? $user_network : false;

    $_SESSION['network_notes']['network set by url'] = $user_network;

    $_SESSION['network_override'] = ($user_network !== $config_network);

    $network = $user_network ?: $config_network ?: 'testnet';

    $_SESSION['network'] = $network;    
    return $network;
}


// ┌─┐┌─┐┌┬┐  ╔═╗┌─┐┌┐┌┌─┐┬┌─┐
// │ ┬├┤  │   ║  │ ││││├┤ ││ ┬
// └─┘└─┘ ┴   ╚═╝└─┘┘└┘└  ┴└─┘
// get Config
function getConfig($reload = true) {
    
    if (!$reload && $_SESSION['hashconnect_config']) return $_SESSION['hashconnect_config'];
    
    $pathConfig = "{$_SERVER['DOCUMENT_ROOT']}/vendor/hashconnect/config.json";
    if (!file_exists($pathConfig)) 
        return elog("warning: JH92734 failed to find config file $pathConfig") && false;
    
    $jsonConfig = file_get_contents($pathConfig);
    if ($jsonConfig === false)
        return elog("warning: LP92834 cannot read $pathConfig") && false;
    
    if (!$jsonConfig)
        return elog("warning: GW92873 empty or falsy content in file $pathConfig") && false;
    
    
    $config = json_decode($jsonConfig);
    $isJsonOk = json_last_error() === JSON_ERROR_NONE;
    
    if (!$isJsonOk)
        return elog("warning: QR65253 error reading json from $pathConfig") && false;
    
    $_SESSION['hashconnect_config'] = $config;
    
    return $config;
}


?>
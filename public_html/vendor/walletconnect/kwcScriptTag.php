<?php

//this is kinda for dev as we'd probabkly hardcode usually

if (!function_exists('elog')) {function elog(...$args) {}}
  
$kwc = getKwc($_GET);

elog($kwc, "loading script type $kwc->script_type from $kwc->url");


function getKwc($in) {

  $kwc_root = $in['kwc_root'] ?? '/vendor/walletconnect';
  // ⚠ LAB1 TEST POINTER (WC-NETSWITCH1 + WC-SESSIONDISPOSE1, 2026-07-08): 17f774f is built
  // LOCALLY in this worktree's builder/snapshots/ (network-switch double-modal fix +
  // old-relay dispose). It does NOT exist on main — DO NOT promote this pointer to kswap
  // until that snapshot is built/deployed on main, or WC will 404→hydrate-miss there.
  // Revert to 4f74b48 to promote the rest without the local bundle. (superseded 4c7696e)
  $kwc_version = $in['kwc_version'] ?? '17f774f';  //prev 4c7696e / 4f74b48 / 53216ab / 70c2c9b — override via ?kwc_version=… for A/B comparison

  if (preg_match('/^[0-9a-fA-F]+$/', $kwc_version)) { // hex.. it's a commit snapshot
    $commit = $kwc_version;
    $kwc_file =  "snapshots/$commit/kwc.iife.js";
  } else $kwc_file = $in['kwc_file'] ?? "releases/$kwc_version/kwc.iife.js";

  if (substr($kwc_version,0,3) == 'hot') $kwc_file =  "snapshots/hottest/kwc.iife.js"; // but kinda redundant if in dev mode 
      
  $out = (object)[];
  $out->url = "$kwc_root/$kwc_file";
  $out->script_type = 'text/javascript';

  if ($kwc_version == 'dev') {
    $out->script_type = 'module';
    $out->url = '/vendor/walletconnect/dev.js';
  }
  
  $isHeadless = true;
  // if ($in['headless'] == false) $isHeadless = false;
  
  $out->mode = ($isHeadless) ? 'headless' : 'UI/YH84753';
  
  return $out;
  
}

?>
<script type="<?=$kwc->script_type?>" data-mode="<?=$kwc->mode?>" src="<?=$kwc->url?>" data-config="/vendor/walletconnect/config.json"></script>


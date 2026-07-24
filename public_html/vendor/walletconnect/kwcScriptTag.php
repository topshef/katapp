<?php

//this is kinda for dev as we'd probabkly hardcode usually

if (!function_exists('elog')) {function elog(...$args) {}}
  
$kwc = getKwc($_GET);

elog($kwc, "loading script type $kwc->script_type from $kwc->url");


function getKwc($in) {

  $kwc_root = $in['kwc_root'] ?? '/vendor/walletconnect';
  // GM-SSEFLAG1 (promoted 2026-07-24): de29cb6 = server-side-execution flag,
  // signer.signTransaction() signature-capture fix, /future save routing,
  // in-page KPaySign modal, recent-tx toasts. Snapshot URLs are served
  // Cache-Control: immutable (see kwc.iife.js response headers) — MUST bump
  // this to a genuinely new value on every change, never hand-patch an
  // already-served snapshot in place again (incident 2026-07-24: mobile
  // clients cached a mid-session copy of aa0fdbc under its immutable header
  // and could never see later fixes, no server-side remedy existed once
  // cached — a new URL was the only fix). Roll back to aa0fdbc if ever
  // needed (= GM-TOASTBREAK1 success-toast line break, pre-SSEFLAG1).
  $kwc_version = $in['kwc_version'] ?? 'de29cb6';  //prev aa0fdbc / 64c41ba / 17f774f / 4c7696e / 4f74b48 / 53216ab — override via ?kwc_version=… for A/B comparison

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


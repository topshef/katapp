<?php

//this is kinda for dev as we'd probabkly hardcode usually

if (!function_exists('elog')) {function elog(...$args) {}}
  
$kwc = getKwc($_GET);

elog($kwc, "loading script type $kwc->script_type from $kwc->url");


function getKwc($in) {

  $kwc_root = $in['kwc_root'] ?? '/vendor/walletconnect';
  // GM-SSEAUTO1 (2026-07-24): 30c3fd9 = first PROPER vite build since the hand-patch
  // era (built from src @ commit 30c3fd9, published to the shared store). Adds the
  // three-state submitServerSide (absent = auto) + the pre-HashPack signature-
  // completeness guard (ref GM-SIG1) that blocks fee-burning incomplete txs, and
  // fixes submitServerSide=0 being read as server-side. Carries everything de29cb6
  // had (GM-SSEFLAG1: sig-capture fix, /future save routing, KPaySign modal, toasts).
  // Snapshot URLs are served Cache-Control: immutable — MUST bump this to a genuinely
  // new value on every change, never hand-patch an already-served snapshot in place
  // (incident 2026-07-24: mobile cached a mid-session copy of aa0fdbc forever).
  // Roll back to de29cb6 (= hand-patched pre-guard state) if ever needed.
  $kwc_version = $in['kwc_version'] ?? 'a99a66e';  //prev 30c3fd9 / de29cb6 / aa0fdbc / 64c41ba / 17f774f / 4c7696e / 4f74b48 / 53216ab — override via ?kwc_version=… for A/B comparison. a99a66e = WC-RELAYHEALTH1 (relay watch, session-ping preflight, in-flight guard; built via build:lite/esbuild — vite OOM-blocked, see builder/build-lite.mjs header)

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


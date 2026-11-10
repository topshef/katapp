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
  // a38c577 = WC-DEAFSOCKET1 F1 (katapp, 2026-11-09): 4a3351b's source plus deaf-link recovery (a relay socket
  //   that stays open but receives nothing: restart it, ping again, resend once if the wallet answers; never on a
  //   hidden page). Built clean from katapp a38c577 with the same lockfile; unminified, the only difference from
  //   4a3351b is that code, WC.qaRelayer() and the build stamp. kwc.iife.js SHA256 f67fd6c91f7be993a93bcb708424e000a11adb07b1de0b621f2275c2e3cf9d0b.
  //   lab1 (katapp) only; labs (phpjabbers) stays on 4a3351b as the benchmark.
  // 925d5d2 = F1-MOBILE1 (katapp, 2026-11-10): a38c577 plus "never resend on a phone" (during order auto-sign a
  //   phone's page stays visible, and the resend left a duplicate approval in HashPack). Built clean from katapp
  //   925d5d2, same lockfile. kwc.iife.js SHA256 ecb4820d7d49415b2a28475eb893b2b81c870bd11b7156f0e41089872a18ca4f.
  $kwc_version = $in['kwc_version'] ?? '925d5d2';  //4a3351b = KWC-CLEANBUILD1 (2026-08-28): first clean off-estate rebuild — built from verified source (this repo @4a3351b) with lockfile-pinned deps on a clean host, NOT the compromised Lincoln estate. kwc.iife.js SHA256 9a153df26c35f4027ad59d5090b935891fab84885b382c6fc446f4c281eb38dc. kpos.uk deal egress neutralised in source (GoMint only; katomia unaffected). Supersedes the Lincoln-built snapshots below for trust. prev 33993b7 / 8e6255c / dd98ee1 / 3c7e7c3 / 2bae073 / e31d3b7 / a99a66e / 30c3fd9 / de29cb6 / aa0fdbc / 64c41ba / 17f774f / 4c7696e / 4f74b48 / 53216ab — override via ?kwc_version=… for A/B comparison.
  // 8e6255c = WC-DOUBLEINIT1 (lab2, 2026-08-07): ONE connector per page. ensureNetwork() had no
  //   in-flight guard — its dappConnector check ran before the await — so two concurrent callers
  //   (katomia-auth.js page init + kpool signer-walletconnect.js) each built a DAppConnector.
  //   Two SignClients sharing one store deleted each other's records: "No matching key. proposal:",
  //   "Pending session not found for topic", "session_ping without any listeners", "User disconnected."
  //   mid-sign. Recovery cost a re-pair (20-40s) > the 40s tx validity window, so signatures landed
  //   after expiry and the txs never reached consensus (three mainnet txs verified absent from mirror).
  // dd98ee1 = WC-RELAYHEALTH1 R2c (adds: resetWalletLink now clears the REAL store — IndexedDB, not localStorage, where it had been a silent no-op). R2b, built with VITE (full build; the box had ~3.9GB free, no OOM — the build:lite/esbuild fallback is no longer forced).
  //   Signer liveness now comes from the SDK's own session store (topic present in session.keys + not past expiry), never from a wallet ping:
  //   dead signers are reaped on every getSigner(), duplicate accountIds resolve to the freshest LIVE session instead of signers[0], and a
  //   "no matching key"/"record was recently deleted" rejection re-signs once on a live session before giving up (KWC-GONE).
  // DO NOT roll back past 2bae073 for mobile:
  //   e31d3b7 = R2 — fixed R1's gate but let a failed ping cut the in-flight cap to 30s, which killed any sign the user took >30s to approve.
  //   a99a66e = R1 — hard session-ping preflight; failed 31/32 mobile signs because wallets stop answering pings once backgrounded.

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
<!-- WC-ANDROIDLINK3 (2026-11-07): on Android, sends each request's "bring the wallet forward" link
     to HashPack's own app link; see the header of /assets/js/kwc-deeplink.js. Baseline (revert target): katapp 7b041f7. -->
<script src="/assets/js/kwc-deeplink.js"></script>


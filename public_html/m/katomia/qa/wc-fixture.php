<?php
// wc-fixture.php — a bare surface for testing the KWC bundle (WC-RELAYHEALTH1).
//
// The path-grid harnesses need to drive window.WC directly. Running them against a
// real game page does not work: the board owns the network. m-order is a MAINNET
// game, so its own ensureNetwork('mainnet') races the harness's ensureNetwork(net)
// and the connector flips underneath the test — which is exactly what made
// a5-ghost-recovery report "Connected wallet is on testnet, but this transaction is
// mainnet" and then time out re-pairing (2026-08-06). That was the fixture's fault,
// not the bundle's, and it is the kind of false red that makes a suite worthless.
//
// This page loads the pinned bundle and NOTHING else that touches WalletConnect: no
// board, no auto-connect, no network opinion of its own. ?network= picks the chain
// once, on demand. Same pin as production via kwcScriptTag.php, so what is tested is
// what ships.
// NB: kwcScriptTag.php is not a function — including it PRINTS the <script> tag. So
// it is required down in the body where the tag belongs, not up here.
$network = preg_match('/^(mainnet|testnet|previewnet)$/', $_GET['network'] ?? '') ? $_GET['network'] : 'testnet';
?><!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KWC test fixture — <?= htmlspecialchars($network) ?></title>
<style>
 body{font:14px/1.5 ui-monospace,monospace;margin:0;padding:18px;background:#14141a;color:#e6e6e2}
 h1{font-size:15px;margin:0 0 12px;color:#8aa2ff}
 #log{white-space:pre-wrap;background:#1d1d24;border:1px solid #2c2c34;border-radius:8px;
      padding:12px;min-height:180px;max-height:60vh;overflow:auto;font-size:12px}
 .row{margin-bottom:10px} button{font:12px ui-monospace,monospace;padding:6px 10px;margin-right:6px;
      background:#2a2a34;color:#e6e6e2;border:1px solid #3a3a46;border-radius:6px}
</style></head><body>
<h1>KWC test fixture · network=<?= htmlspecialchars($network) ?> · no game logic</h1>
<div class="row">
  <button onclick="go('ensureNetwork')">ensureNetwork</button>
  <button onclick="go('connect')">connect</button>
  <button onclick="go('getAccounts')">getAccounts</button>
  <button onclick="go('disconnect')">disconnect</button>
  <button onclick="go('resetWalletLink')">resetWalletLink</button>
</div>
<div id="log">loading bundle…</div>

<?php require_once($_SERVER['DOCUMENT_ROOT'] . "/vendor/walletconnect/kwcScriptTag.php"); ?>
<script>
window.KWC_FIXTURE_NETWORK = <?= json_encode($network) ?>;
const logEl = document.getElementById('log');
const out = (m) => { logEl.textContent += "\n" + m; logEl.scrollTop = logEl.scrollHeight; };

// Give the harness the bundle's own diagnostics. On a game page window.kdiag comes
// from katomia-modals.js; here nothing else defines it, so collect into an array the
// harness can read back with page.evaluate(() => window.KWC_EVENTS).
window.KWC_EVENTS = [];
window.kdiag = (msg, data) => {
  window.KWC_EVENTS.push({ t: Date.now(), msg, data });
  out("kdiag " + msg + " " + JSON.stringify(data ?? {}));
};

async function go(fn){
  try {
    const r = fn === 'ensureNetwork' ? await window.WC.ensureNetwork(window.KWC_FIXTURE_NETWORK)
                                     : await window.WC[fn]();
    out(fn + " → " + JSON.stringify(r));
  } catch(e){ out(fn + " ✗ " + (e && e.message || e)); }
}

(function ready(n){
  if (window.WC) { logEl.textContent = "bundle " + window.WC.version + " (" + (window.WC.buildMeta?.builder||"?") + ") ready"; return; }
  if (n > 80) { logEl.textContent = "window.WC never appeared"; return; }
  setTimeout(() => ready(n + 1), 250);
})(0);
</script>
</body></html>

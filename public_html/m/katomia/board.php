<?php require_once __DIR__ . '/kasset.php'; ?>
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="<?= kasset('katomia.css') ?>" />
  <link rel="stylesheet" href="<?= kasset('katomia-board.css') ?>" />
  <title>katomia — board</title>
</head>

<body class="board-page">

<!-- BOARD-UI1: standalone full-screen board view of PROPOSAL mode. Deliberately a
     separate page from game.php (user 2026-07-09): the legacy page stays untouched
     as the stable reference while board skins are kicked around here. Same data,
     same socket join, same chips — only render() is replaced (katomia-board.js
     loads after katomia-render.js, so its render() declaration wins).
     URL: board.php?game=<id>&skin=<table|market>   ·   ?demo=1 = local fixture,
     no socket — a sandbox for skin work and screenshots. -->

<div id="notifications"></div>

<div class="board-chrome">
  <select id="boardSkinSelect" title="Board skin">
    <option value="ring16">⭕ Ring v16 — in-app sign, focus play (default)</option>
    <option value="ring15">✍ Ring v15 — signing layer</option>
    <option value="ring14">🚩 Ring v14 — quarter flag, ghost-wash lock</option>
    <option value="ring13">🃏 Ring v13 — pennant flag, toast deck</option>
    <option value="ring12">💡 Ring v12 — strip-light party, clean hub</option>
    <option value="ring11">🛒 Ring v11 — pick, party glow</option>
    <option value="ring10">💿 Ring v10 — hub ring, spotlight</option>
    <option value="ring9">🧿 Ring v9 — party filter, netting v2</option>
    <option value="susan5">🎠 Lazy Susan v5 — mine as cards, drag halo</option>
    <option value="susan4">🎪 Lazy Susan v4 — two-tone strips (frozen)</option>
    <option value="susan3">🎡 Lazy Susan v3 — pick, sized (frozen)</option>
    <option value="susan2">🎪 Lazy Susan v2 — ring-echo (frozen)</option>
    <option value="susan">🎡 Lazy Susan v1 (frozen)</option>
    <option value="ring8">🧷 Ring v8 — snags + footer rework</option>
    <option value="ring7">🔦 Ring v7 — spotlight, lock dims store</option>
    <option value="ring6">🧪 Ring v6 — no oval, dark basket</option>
    <option value="ring5">🔵 Ring v5 — OG sleeves, lock arcs</option>
    <option value="ring4">🎗 Ring v4 — sleeves, etched boundary</option>
    <option value="ring2">🎲 Ring v2 — etched boundary, tinted faces</option>
    <option value="ring3">🎯 Ring v3 — etched centroid, tinted faces</option>
    <option value="ring">📇 Ring v1 (label rows)</option>
    <option value="table">🎲 Round table (ref)</option>
    <option value="market">🏪 Market square (ref)</option>
  </select>
  <a class="board-exit" href="/m/katomia/" title="Exit to games">✕</a>
</div>

<div id="boardRoot"></div>

<!-- hover trade-line host: drawTradeLine() draws its dotted pair line into
     #game (legacy layer) — here it's a fixed passthrough over the board -->
<div id="game" class="board-linelayer"></div>

<!-- Same asset modal as game.php — openAssetModal() (helpers) is the tap-to-offer
     path for chips; board taps reuse it verbatim. -->
<div id="assetModal" class="asset-modal hidden">
  <div class="asset-modal-card">
    <div id="assetModalClose" class="asset-modal-close">✕</div>
    <div id="assetModalPreview" class="asset-modal-preview"></div>
    <div id="assetModalName" class="asset-modal-name"></div>
    <div class="asset-modal-amount-row">
      <span class="asset-modal-input">
        <label>Send amount</label>
        <input id="assetModalAmount" type="number" value="1" min="1">
      </span>
    </div>
    <br>
    <div>Choose a basket 🧺🛒</div>
    <div id="assetModalTargets" class="asset-modal-targets"></div>
  </div>
</div>

<script><?php require_once('config.php'); ?>
  window.CONFIG = {
    HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
  }
</script>

<script src="/m/bid/localbase.min.js"></script>
<script type="module" data-global src="/m/tools/glog/latest/glog.js"></script>
<script type="module" src="/m/bid/localCacheDB.js"></script>
<script src="/m/bid/localCacheIFPS.js"></script>
<script src="/m/bid/localCacheArweave.js"></script>

<!-- ring16 (corrected review 17): the WC bundle is here for DIRECT signing —
     ✍ Sign calls the headless WC.signTx (the modal's Sign action, no modal;
     board IS the signing surface). The kpay-embed stays loaded only as the
     hash deep-link path (#sign=…) — effectively hidden; the widget modal
     remains reachable via the tx list outside the ring, and the hub tap
     opens the external all-wallets page for comparison. -->
<?php require_once($_SERVER['DOCUMENT_ROOT'] . "/vendor/walletconnect/kwcScriptTag.php"); ?>
<script>window.KPAY_SIGN_HASH = true</script>
<script src="/vendor/kpay/kpool_widget/kpay-embed.js" defer></script>
<script src="/vendor/kpay/kpool_widget/qrcode.min.js"></script>

<script type="module" src="<?= kasset('katomia-init.js') ?>"></script>
<script src="<?= kasset('katomia-core.js') ?>"></script>
<script src="<?= kasset('katomia-localdb.js') ?>"></script>
<script src="<?= kasset('kemoji.js') ?>"></script>
<script src="<?= kasset('katomia-helpers.js') ?>"></script>
<script src="<?= kasset('katomia-enrich.js') ?>"></script>
<script src="<?= kasset('katomia-network.js') ?>"></script>
<!-- KDIAG-BOARDBLIND1: board.php never loaded this, so katomiaDiagSend()
     (the self-contained /diag sender — the create-order-modal comment in this
     file explains window.kdiag from the kpool widget is lazy and NOT reliably
     present here) didn't exist on the board page at all: no katomia:build, no
     wc:version, and boardDirectSign()'s window.kdiag?.() calls were silent
     no-ops. Ring16 direct-sign attempts left zero trace in kdiag. -->
<script src="<?= kasset('katomia-modals.js') ?>"></script>
<script src="<?= kasset('katomia-render.js') ?>"></script>
<script src="<?= kasset('katomia-board.js') ?>"></script>

<script>
window.addEventListener("load", () => {
  const params = new URLSearchParams(location.search)
  if(params.get("demo")){
    boardDemoInit()
    return
  }
  if(typeof connect === "function") connect()
})
</script>

</body>
</html>

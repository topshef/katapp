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
    <option value="ring8">⭕ Ring v8 — snags + footer rework (default)</option>
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

<script type="module" src="<?= kasset('katomia-init.js') ?>"></script>
<script src="<?= kasset('katomia-core.js') ?>"></script>
<script src="<?= kasset('katomia-localdb.js') ?>"></script>
<script src="<?= kasset('kemoji.js') ?>"></script>
<script src="<?= kasset('katomia-helpers.js') ?>"></script>
<script src="<?= kasset('katomia-enrich.js') ?>"></script>
<script src="<?= kasset('katomia-network.js') ?>"></script>
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

<?php
require_once __DIR__ . '/kasset.php';
?>
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
     URL: /m/katomia/board/<id>?skin=<ring16|susan5>  (also reachable directly as
     board.php?game=<id>&skin=…)   ·   ?demo=1 = local fixture, no socket — a
     sandbox for skin work and screenshots. -->

<?php
  // BOARD-HEADERINT1: board.php now shares header.php + profile-modal.php
  // with game.php, replacing the standalone chrome it built in its BOARD-UI1
  // sandbox days (skin <select> + ✕ close — both now live inside the profile
  // modal's new board-only Preferences section; the hamburger's Markets link
  // replaces ✕). KATOMIA_BOARD_CONTEXT gates that section on — see
  // profile-modal.php.
  define('KATOMIA_BOARD_CONTEXT', true);
  require __DIR__ . '/header.php';
  require __DIR__ . '/profile-modal.php';
  // user 2026-07-14: the footer's ➕ Add account now opens the same composer
  // modal as the legacy page (WC-connected / connect / manual) instead of the
  // bare prompt() stopgap.
  require __DIR__ . '/addaccount-modal.php';
?>

<div id="boardRoot"></div>

<!-- hover trade-line host: drawTradeLine() draws its dotted pair line into
     #game (legacy layer) — here it's a fixed passthrough over the board -->
<div id="game" class="board-linelayer"></div>

<!-- BOARD-CHAT1 (user 2026-07-30): chat surfaces live OUTSIDE #boardRoot on purpose.
     renderRingBoard does root.replaceChildren() on every paint, so anything parked
     inside the board root is wiped the moment a new message triggers a re-render —
     which is exactly when a bubble needs to appear. Same reasoning as the
     #game.board-linelayer passthrough above; both are fixed overlays over the board. -->
<!-- DEMO-SPECTATE1: shown only when the backend says this socket is a spectator
     (body.spectating, set in katomia-network.js from the game_state payload). -->
<div id="boardSpectatorRibbon" class="kspec-ribbon">
  <span>👀 <b>You're watching.</b></span>
  <span class="kspec-why" id="boardSpectatorWhy"></span>
</div>
<!-- DEMO-WATCHERS1 (user 2026-07-30): live audience counter. Server-counted from open
     sockets, split playing vs watching. -->
<div id="boardAudience" class="kaud" hidden></div>
<div id="boardChatLayer" class="kchat-layer"></div>
<div id="boardChatPanel" class="kchat-panel"></div>

<!-- BOARD-CHAT1 R2: mobile transcript, opened from ☰ (the floating panel is
     desktop-only — on a phone it covered the board controls). Full screen because
     there is no room for board + transcript on a phone; two devices side by side is
     the intended way to watch both. -->
<div id="boardChatFull" class="kchat-full" role="dialog" aria-modal="true" aria-label="Messages">
  <div class="kchat-full-head">
    <b>💬 Messages<span class="sub" id="boardChatFullSub"></span></b>
    <button type="button" class="kchat-full-close" id="boardChatFullClose">Close</button>
  </div>
  <div class="kchat-full-list"><div class="kchat-panel-list" id="boardChatFullList"></div></div>
</div>

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

<script><?php require_once('config.php');
  // KFLOW1: frontend commit stamp for checkpoints — same worktree-safe
  // derivation as game.php (.git may be a "gitdir:" pointer; refs in commondir)
  $kg = dirname($_SERVER['DOCUMENT_ROOT']) . '/.git';
  if (is_file($kg) && preg_match('/^gitdir:\s*(.+)$/m', (string)@file_get_contents($kg), $km)) $kg = trim($km[1]);
  $khead = trim((string)@file_get_contents("$kg/HEAD"));
  if (preg_match('#^ref:\s*(.+)#', $khead, $km)) {
      $kcommon = trim((string)@file_get_contents("$kg/commondir"));
      $kroot = $kcommon ? ($kcommon[0] === '/' ? $kcommon : "$kg/$kcommon") : $kg;
      $khead = trim((string)@file_get_contents($kroot . '/' . trim($km[1])));
  }
  $kflowCommit = preg_match('/^[0-9a-f]{40}$/', $khead) ? substr($khead, 0, 7) : '';
?>
  window.CONFIG = {
    HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
  }
  window.KFLOW_COMMIT = "<?= htmlspecialchars($kflowCommit, ENT_QUOTES, 'UTF-8') ?>"
</script>
<!-- KFLOW1: flow-fingerprint checkpoints — first, so every later script can call window.kflow -->
<script src="<?= kasset('kflow.js') ?>"></script>
<!-- KAT-FEEDBACK1 + FEEDBACK-COMMENTARY1: long-press feedback, now WITH
     session mode (start → REC pill top-left → stop → paste transcript/debrief
     → send & close through the normal signed /kfeedback route). Activated on
     the board (user 2026-07-16) — this page is where the QA narration happens. -->
<!-- KPAD-SELFFEED1: served from the backend (its canonical home) — no local copy -->
<script src="https://<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>/feedback-widget.js"
        data-product="katomia-board"></script>

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
<!-- BOARD-CHAT1 (user 2026-07-30): renders state.chat — speech bubbles on the
     speaker's wedge + a glassy transcript. Must load AFTER katomia-board.js,
     which owns the _boardChatAnchors this reads. -->
<script src="<?= kasset('katomia-chat.js') ?>"></script>

<!-- BOARD-HEADERINT1 follow-up (2026-07-14): board.php gained header.php +
     profile-modal.php but these two were missed — profile-modal.php's own
     top comment lists them as required, and without katomia-profile.js the
     [data-menu-profile] click listener never gets attached, so Profile
     silently no-ops (same failure shape as KDIAG-BOARDBLIND1 above: a page
     missing a script it now depends on, with nothing to say why).
     katomia-addaccount.js joined later the same day: the footer's ➕ Add
     account now opens the shared composer modal (addaccount-modal.php)
     instead of the prompt() stopgap. -->
<script src="<?= kasset('katomia-profile.js') ?>"></script>
<script src="<?= kasset('katomia-auth.js') ?>"></script>
<script src="<?= kasset('katomia-addaccount.js') ?>"></script>

<script>
window.addEventListener("load", () => {
  const params = new URLSearchParams(location.search)
  if(params.get("demo")){
    boardDemoInit()
    return
  }
  if(typeof connect === "function") connect()

  // ENTRY-CREATEBASIC1: fresh arrival from the basic create form (?created=1) —
  // toast the share hint WITH the link visible in it (the address bar has it too,
  // but showing it makes "share this" concrete). Param is stripped so a reload or
  // a copied URL doesn't re-toast for the next person.
  if(params.get("created")){
    params.delete("created")
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params.toString() : ""))
    const link = location.origin + location.pathname
    // R2 (user 2026-08-03): the link is CLICKABLE (notify's link element) and rides as
    // detail so it wraps cleanly. Folding this into the message stream as the circle's
    // first entry is part of BOARD-CHATLAYOUT1 (toasts-into-chat).
    notify?.(`New game created — share this link for others to join`, "success",
      { timeout: 15000, detail: link, link: { href: link, text: "Open ↗" } })
  }
})
</script>

</body>
</html>

<?php
require_once __DIR__ . '/kasset.php';
require_once __DIR__ . '/site-config.php';
$siteConfig = katomiaSiteConfig();
$landing = $siteConfig['landing'] ?? [];
$title = $landing['title'] ?? 'Katomia';
$tagline = $landing['tagline'] ?? '';
$curatedGames = $landing['curatedGames'] ?? [];
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="<?= kasset('katomia.css') ?>">
<title><?= htmlspecialchars($title, ENT_QUOTES, 'UTF-8') ?></title>
<style>
  /* KATOMIA-LANDING1: intentionally tiny — a hand-picked jumping-off point,
     not a second games list (that's contents.php's job, reachable from here
     via the "See all markets" link). No grid/table chrome to inherit. */
  .landing-wrap{ max-width: 480px; margin: 32px auto; padding: 0 16px; }
  .landing-tagline{ color: #666; margin: 0 0 24px; }
  .landing-list{ display: flex; flex-direction: column; gap: 10px; }
  .landing-card{
    display: block; padding: 16px; border-radius: 10px;
    background: #fff; border: 1px solid #e5e0d4; text-decoration: none;
    color: inherit; box-shadow: 0 1px 3px rgba(0,0,0,.05);
  }
  .landing-card:hover{ border-color: #c9c2b3; }
  .landing-card-label{ font-weight: 600; }
  .landing-card-net{ font-size: 12px; color: #888; margin-top: 2px; }
  /* ENTRY-WELCOME1: See-all demoted to small + muted (user 2026-07-29) — the curated
     cards + create button are the happy path; the full list is a power-user door. */
  .landing-more{ margin-top: 28px; font-size: 12px; }
  .landing-more a{ color: #999; }
  .landing-empty{ color: #888; font-style: italic; }
  .landing-create{
    display: inline-block; margin-top: 16px; padding: 12px 18px; border-radius: 10px;
    background: #28a745; color: #fff; text-decoration: none; font-weight: 600;
  }
  .landing-create:hover{ background: #218838; }
  /* ENTRY-WELCOME1: connect-from-welcome card. Convenience, not a gate — you can walk
     into any game without it; connecting here just means you're ready to trade the
     moment you join (and later feeds the auto-add-accounts-on-join idea,
     ENTRY-AUTOADD1). */
  .landing-connect{
    margin-top: 28px; padding: 16px; border-radius: 10px;
    background: #fff; border: 1px solid #e5e0d4; box-shadow: 0 1px 3px rgba(0,0,0,.05);
  }
  .landing-connect h3{ margin: 0 0 6px; font-size: 15px; }
  .landing-connect .subtle{ font-size: 13px; color: #777; margin: 0 0 12px; }
  .landing-connect-row{ display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .landing-connect-row select{ padding: 8px; border-radius: 6px; border: 1px solid #ccc; }
  .landing-connect-btn{
    padding: 9px 14px; border: none; border-radius: 6px; cursor: pointer;
    background: #2f6fed; color: #fff; font-weight: 600;
  }
  .landing-connect-btn:hover{ background: #265cc7; }
  .landing-connected{ margin-top: 10px; font-size: 13px; color: #2e7d32; }
  .landing-connected:empty{ display: none; }
</style>
</head>
<body>
<?php
  require __DIR__ . '/header.php';
  require __DIR__ . '/profile-modal.php';
?>

<div class="landing-wrap">
  <?php if ($tagline): ?><p class="landing-tagline"><?= htmlspecialchars($tagline, ENT_QUOTES, 'UTF-8') ?></p><?php endif; ?>

  <div class="landing-list">
    <?php if (!$curatedGames): ?>
      <p class="landing-empty">No curated games configured yet — see site-config.json.</p>
    <?php endif; ?>
    <?php foreach ($curatedGames as $g):
      $id = $g['id'] ?? '';
      if (!$id) continue;
      $label = $g['label'] ?? $id;
      $network = $g['network'] ?? '';
    ?>
      <a class="landing-card" href="/m/katomia/board/<?= rawurlencode($id) ?>">
        <div class="landing-card-label"><?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?></div>
        <?php if ($network): ?><div class="landing-card-net"><?= htmlspecialchars($network, ENT_QUOTES, 'UTF-8') ?></div><?php endif; ?>
      </a>
    <?php endforeach; ?>
  </div>

  <!-- ENTRY-WELCOME1/ENTRY-CREATEBASIC1: one button, straight to the trimmed-down
       create form (name + network + visibility only) — the full form stays at /create. -->
  <a class="landing-create" href="/m/katomia/create?skin=basic">➕ Create your own game</a>

  <!-- ENTRY-WELCOME1 (user 2026-07-29): connect directly from the welcome page — a
       convenience flow, NOT a gate. Deliberately connect-only: no signing at the door
       (authentication/bindings stay in the profile + the authenticate modal; the
       "check-in signs a statement" idea was considered and parked — too much load at
       first entry). Site-wide access levers / group gating: ENTRY-GATING1. -->
  <div class="landing-connect">
    <h3>🔗 Connect your wallet</h3>
    <p class="subtle">Optional — connect now and you're ready to trade the moment you join a game. You can always do it later from the profile menu.</p>
    <div class="landing-connect-row">
      <select id="landingNet" title="Which Hedera network to connect on">
        <option value="mainnet">🟣 Hedera mainnet</option>
        <option value="testnet">🟠 Hedera testnet</option>
      </select>
      <button id="landingConnectBtn" class="landing-connect-btn" type="button">Connect wallet</button>
    </div>
    <div id="landingConnected" class="landing-connected"></div>
  </div>

  <p class="landing-more"><a href="/m/katomia/">See all markets →</a></p>
</div>

<script>
// ENTRY-WELCOME1: welcome-page connect widget. Thin glue over the shared WC connector
// + katomia-auth.js helpers (kauthWCAccounts). Passive on load (never rebuilds the
// connector just to peek); explicit on click (ensureNetwork + connect).
async function landingRenderConnected(accounts){
  const el = document.getElementById("landingConnected")
  if(!el) return
  el.textContent = accounts.length
    ? `✓ Connected: ${accounts.join(", ")} — you're ready to trade in any game.`
    : ""
}
async function landingRefreshAccounts(ensure){
  try { landingRenderConnected(await kauthWCAccounts(document.getElementById("landingNet").value, ensure)) }
  catch(e){ console.warn("[landing] account list failed", e) }
}
document.getElementById("landingConnectBtn").onclick = async () => {
  const btn = document.getElementById("landingConnectBtn")
  const network = document.getElementById("landingNet").value
  if(!window.WC){ notify?.("WalletConnect still loading — try again in a moment", "info", { timeout: 3000 }); return }
  btn.disabled = true; btn.textContent = "Connecting…"
  try {
    document.documentElement.style.setProperty("--wcm-z-index", "2147483000")
    if(window.WC.ensureNetwork) await window.WC.ensureNetwork(network)
    window.kauthPruneWcModals?.()
    await window.WC.connect?.()
  } catch(e){ console.warn("[landing] connect failed", e) }
  btn.disabled = false; btn.textContent = "Connect wallet"
  landingRefreshAccounts(true)
}
document.getElementById("landingNet").onchange = () => landingRefreshAccounts(true)
window.addEventListener("load", () => landingRefreshAccounts(false))
</script>

<script><?php require_once('config.php'); ?>
  window.CONFIG = {
    HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
  }
</script>

<script src="/vendor/kpay/kpool_widget/qrcode.min.js"></script>
<script src="<?= kasset('katomia-core.js') ?>"></script>
<script src="<?= kasset('katomia-helpers.js') ?>"></script>
<script src="<?= kasset('kemoji.js') ?>"></script>
<script src="<?= kasset('katomia-profile.js') ?>"></script>
<script src="<?= kasset('katomia-auth.js') ?>"></script>
<?php require_once($_SERVER['DOCUMENT_ROOT'] . "/vendor/walletconnect/kwcScriptTag.php"); ?>
</body>
</html>

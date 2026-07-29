<?php
require_once __DIR__ . '/kasset.php';
require_once __DIR__ . '/site-config.php';
$siteConfig = katomiaSiteConfig();
$landing = $siteConfig['landing'] ?? [];
$title = $landing['title'] ?? 'Katomia';
$tagline = $landing['tagline'] ?? '';
$curatedGames = $landing['curatedGames'] ?? [];
// ENTRY-SKINS1 (user 2026-07-29): URL-switchable CSS skins for this page — design
// exploration surface. ?skin=liquid|clay|bubble; default 'paper' is the plain look.
// A picker appears in NERD MODE only (deliberate: nerd mode as the UI-branching
// playground for design-curious testers — user call, same day as ENTRY-KEANERD1).
$landingSkins = ['paper', 'liquid', 'clay', 'bubble'];
$landingSkin = in_array($_GET['skin'] ?? '', $landingSkins, true) ? $_GET['skin'] : 'paper';
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
  /* ENTRY-KBTN1: buttons now ride the shared .kbtn glassy library (katomia.css) —
     these rules keep only layout. The old solid green/blue fills are gone (user
     2026-07-29: subtler, glassy, thin edge — match the order-modal buttons). */
  .landing-create{ margin-top: 16px; }
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
  .landing-connect-btn{ padding: 9px 16px; font-size: 14px; }
  .landing-connected{ margin-top: 10px; font-size: 13px; color: #2e7d32; }
  .landing-connected:empty{ display: none; }
  /* ═══ ENTRY-SKINS1 — landing skins (design exploration; page-scoped, the shared
     banner is deliberately untouched for now). 'paper' = the defaults above. ═══ */

  /* — liquid: dark glass, drifting iridescent blobs; the torus/pitch-deck world — */
  body.lskin-liquid{ background:#0b0e1a; color:#e8ecf5; }
  body.lskin-liquid::before, body.lskin-liquid::after{
    content:""; position:fixed; width:62vmax; height:62vmax; border-radius:50%;
    filter:blur(90px); opacity:.38; z-index:-1; pointer-events:none;
  }
  body.lskin-liquid::before{ background:radial-gradient(circle,#2f6fed,transparent 62%);
    top:-22vmax; right:-16vmax; animation:lqFloatA 19s ease-in-out infinite alternate; }
  body.lskin-liquid::after{ background:radial-gradient(circle,#8b3bd8,transparent 62%);
    bottom:-26vmax; left:-16vmax; animation:lqFloatB 23s ease-in-out infinite alternate; }
  @keyframes lqFloatA{ to{ transform:translate(-9vmax,7vmax) scale(1.12); } }
  @keyframes lqFloatB{ to{ transform:translate(8vmax,-6vmax) scale(.92); } }
  body.lskin-liquid .landing-tagline{ color:#9aa6c0; }
  body.lskin-liquid .landing-card,
  body.lskin-liquid .landing-connect{
    background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.14); color:#e8ecf5;
    backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
    border-radius:18px; box-shadow:0 8px 30px rgba(0,0,0,.35);
  }
  body.lskin-liquid .landing-card:hover{ border-color:rgba(140,190,255,.5); }
  body.lskin-liquid .landing-card-net{ color:#8f9bb5; }
  body.lskin-liquid .landing-connect .subtle{ color:#93a0ba; }
  body.lskin-liquid .landing-create{ background:linear-gradient(120deg,#31c48d,#2f6fed); border-radius:999px; }
  body.lskin-liquid .landing-create:hover{ filter:brightness(1.1); }
  body.lskin-liquid .landing-connect-btn{ background:linear-gradient(120deg,#2f6fed,#8b3bd8); border-radius:999px; }
  body.lskin-liquid .landing-connected{ color:#5fd39a; }
  body.lskin-liquid .landing-more a{ color:#6e7a95; }

  /* — clay: warm, soft, no hard edges anywhere; squishy neumorphic mass — */
  body.lskin-clay{ background:#efe9e1; }
  body.lskin-clay .landing-tagline{ color:#8a7f72; }
  body.lskin-clay .landing-card,
  body.lskin-clay .landing-connect{
    background:#f3ede5; border:none; border-radius:26px;
    box-shadow:8px 8px 18px rgba(178,160,138,.4), -8px -8px 18px rgba(255,255,255,.95);
    transition:transform .18s ease, box-shadow .18s ease;
  }
  body.lskin-clay .landing-card:hover{ transform:translateY(-3px);
    box-shadow:10px 12px 22px rgba(178,160,138,.45), -8px -8px 18px rgba(255,255,255,.95); }
  body.lskin-clay .landing-create{ background:#e8735a; border-radius:999px;
    box-shadow:6px 6px 14px rgba(178,160,138,.5), -4px -4px 10px rgba(255,255,255,.8); }
  body.lskin-clay .landing-create:hover{ transform:translateY(-2px) scale(1.02); background:#e8735a; }
  body.lskin-clay .landing-connect-btn{ background:#5a8fe8; border-radius:999px;
    box-shadow:4px 4px 10px rgba(178,160,138,.5), -3px -3px 8px rgba(255,255,255,.8); }
  body.lskin-clay .landing-more a{ color:#a89b8c; }

  /* — bubble: minimal light base; kbubble.js draws living borders (ENTRY-BUBBLE1).
       .kbubble-on = the effect attached OK, so the CSS border steps aside; without
       it (reduced-motion / no canvas) the paper borders simply remain. — */
  body.lskin-bubble{ background:#f7f9fc; }
  body.lskin-bubble .landing-card,
  body.lskin-bubble .landing-connect{ border-radius:14px; }
  body.lskin-bubble .kbubble-on{ border-color:transparent !important; box-shadow:none !important; }
  body.lskin-bubble .landing-create{ background:#fff; color:#1d8a44; }
  body.lskin-bubble .landing-connect-btn{ background:#fff; color:#2f6fed; }
  body.lskin-bubble .landing-create.kbubble-on:hover{ background:#fff; transform:none; }

  /* — nerd-mode skin picker (ENTRY-SKINS1): visible only with body.nerd — */
  .landing-skin-picker{ display:none; margin-top:22px; font-size:13px; color:#888;
    gap:8px; align-items:center; }
  body.nerd .landing-skin-picker{ display:flex; }
  .landing-skin-picker select{ padding:5px 8px; border-radius:6px; border:1px solid #ccc; }
</style>
</head>
<body class="lskin-<?= htmlspecialchars($landingSkin, ENT_QUOTES, 'UTF-8') ?>">
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
  <a class="landing-create kbtn kbtn-green" href="/m/katomia/create?skin=basic">➕ Create your own game</a>

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
      <button id="landingConnectBtn" class="landing-connect-btn kbtn kbtn-blue" type="button">Connect wallet</button>
    </div>
    <div id="landingConnected" class="landing-connected"></div>
  </div>

  <p class="landing-more"><a href="/m/katomia/markets">See all markets →</a></p>

  <!-- ENTRY-SKINS1: nerd-mode-only skin picker — reloads with ?skin= so each variant
       initialises cleanly (the bubble skin attaches canvases at load). -->
  <div class="landing-skin-picker" title="Design exploration (nerd mode): try this page in different skins. The URL carries the choice — share it.">
    🎨 Page skin
    <select id="landingSkinSel">
      <option value="paper">📄 Paper (default)</option>
      <option value="liquid">🫧 Liquid glass</option>
      <option value="clay">🏺 Soft clay</option>
      <option value="bubble">💠 Bubble borders</option>
    </select>
    <!-- ENTRY-DARKMODE1: same DarkReader toggle as the menu item, surfaced here so
         skin × dark/light combinations can be flipped in one place. -->
    <button type="button" id="landingDarkBtn" title="Toggle DarkReader dark mode on this skin" onclick="window.kdarkToggle?.()">🌗</button>
  </div>
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

// ENTRY-SKINS1: picker → reload with the chosen skin in the URL.
{
  const sel = document.getElementById("landingSkinSel")
  sel.value = "<?= $landingSkin ?>"
  sel.onchange = () => {
    const p = new URLSearchParams(location.search)
    if(sel.value === "paper") p.delete("skin"); else p.set("skin", sel.value)
    location.search = p.toString()
  }
}
</script>

<?php if ($landingSkin === 'bubble'): ?>
<!-- ENTRY-BUBBLE1: the living-border demo skin. kbubble degrades to the CSS border
     (no .kbubble-on class) under reduced-motion / no canvas. -->
<script src="<?= kasset('kbubble.js') ?>"></script>
<script>
window.addEventListener("load", () => {
  if(!window.kbubble) return
  document.querySelectorAll(".landing-card").forEach(el =>
    kbubble.attach(el, { style: "iridescent", width: 1.8 }))
  const create = document.querySelector(".landing-create")
  if(create) kbubble.attach(create, { style: "glow", color: "rgba(29,138,68,.85)", width: 2 })
  const btn = document.getElementById("landingConnectBtn")
  if(btn) kbubble.attach(btn, { style: "glow", color: "rgba(47,111,237,.85)", width: 2 })
  const card = document.querySelector(".landing-connect")
  if(card) kbubble.attach(card, { style: "ink", width: 1.4, ambient: 0.25 })
})
</script>
<?php endif; ?>

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

<?php require_once __DIR__ . '/kasset.php'; ?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
<link rel="stylesheet" href="<?= kasset('katomia.css') ?>">


<title>Katomia markets 🍎🥬🥕</title>

<style>
* {
  -webkit-tap-highlight-color: transparent;
}


/* see above imported css todo organiase*/
body{
  zzfont-family:sans-serif;
  background:#f5f5f5;
  color:#333;
}

h2{
  margin-top:0;
  margin-bottom:16px;
}

.grid{
  display:grid;
  grid-template-columns:repeat(8,1fr);
  background:white;
  border-radius:8px;
  overflow:hidden;
}

.grid-header{
  font-weight:600;
  font-size:14px;
  padding:10px 12px;
  background:#fafafa;
  border-bottom:1px solid #e5e5e5;
}

.row{
  display:contents;
  color:inherit;
  text-decoration:none;
  cursor:pointer;
}

.cell{
  padding:10px 12px;
  border-bottom:1px solid #eee;
  font-size:14px;
}

.row:hover .cell{
  background:#fafafa;
}


.create-market{
  display:inline-block;
  margin-top:18px;
  padding:10px 16px;
  background:#28a745;
  color:white;
  text-decoration:none;
  font-weight:600;
  border-radius:6px;
  transition:all .15s ease;
}

.create-market:hover{
  background:#218838;
}


.row-header,
.row-chips{
  display:contents;
}

/* GAME-JOINRULE1: hint shown while the caller has no commitment — gated markets
   exist but are hidden until a commitment is raised from the profile. */
.gated-hint{
  margin-top:14px;
  font-size:13px;
  color:#777;
}
.gated-hint a{ cursor:pointer; text-decoration:underline; }


/* MOBILE */
@media (max-width:700px){

  .grid{ display:block; background:transparent; }
  .grid-header{ display:none; }

  .row{
    display:block;
    background:#fff;
    margin-bottom:10px;
    padding:10px;
    border-radius:8px;
  }

  .row-header{
    display:flex;
    align-items:center;
    gap:8px;
    margin-bottom:7px;
  }

  .row-chips{
    display:flex;
    flex-wrap:wrap;
    gap:6px;
  }

  .cell{
    display:inline-flex;
    align-items:center;
    width:auto;
    padding:4px 10px 4px 8px;
    border:none;
    background:#f3f3f3;
    border-radius:999px;
    font-size:12px;
  }

  .cell::before{ display:none; }

  .cell.gamename{
    order:1;
    flex:1;
    padding:0;
    background:none;
    font-size:16px;
    font-weight:600;
  }

  .cell.id{
    order:2;
    padding:0;
    background:none;
    font-size:12px;
    color:#666;
  }
}

@media (min-width:701px){

  .cell.gamename{
    min-width:24ch;
    max-width:48ch;
  }

}

</style>
</head>

<body>

<?php
  // HEADER-UNIFY + PROFILE-INDEX1: shared banner/hamburger + the profile modal —
  // the binding isn't game-scoped, so commitments can be raised from here, BEFORE
  // entering any game (which is what unlocks gated markets below).
  require __DIR__ . '/header.php';
  require __DIR__ . '/profile-modal.php';
?>

<div id="games" class="grid"></div>

<!-- ENTRY-GATING1 (user brainstorm 2026-07-29, NOT coded yet): site-wide PAGE access
     levers, distinct from per-game joinRule below. The intent: a unix-style
     groups→routes permission map (likely a site-config.json "access" block) so pages
     like this index can be tightened (require authentication, group membership, or
     tokens-held-across-ALL-connected-accounts) or loosened per launch phase — demand
     throttling / positive friction, not security. Soft launch ships everything open;
     the levers come later. Global position = aggregate over all connected accounts. -->
<div class="gated-hint" id="gatedHint" hidden>
  🔐 Some markets are members-only. <a data-menu-profile>Connect a wallet &amp; raise a commitment</a> to see the ones your accounts unlock.
</div>

<div>
  <a class="create-market" href="./create">
    <i class="fa-solid fa-plus"></i> Create your own market
  </a>
</div>

<script>

const API_URL = "/m/katomia/hapi/games"
//const API_URL = "https://hapi2.hbar.live/live/katomia/games"

const displayLookup = {
  tradingMode: {
    proposal: "💡 Proposal",
    orderBook: "📊 Order Book",
    debug: "🛠️ debug"
  },

  network: {
    playnet: "🧸 Playnet",
    testnet: "🟠 Testnet",
    mainnet: "🟣 Mainnet"
  },

  visibility: {
    public:   "🌍 Public",
    unlisted: "🔗 Unlisted",
    private:  "🔒 Private"
  },

  lockRule: {
    cluster: "☆ cluster",
    active:  "☆☆ active",
    all:     "🌍 all"
  },

  joinRule: {
    '*': "🙌 anyone",
  },
}

function displayValue(group, value){
  return displayLookup[group]?.[value] || value || ""
}


function formatJoinRule(rule){

  if(typeof rule === "string") return displayValue("joinRule", rule)

  // allowlist array or {rule,params} object → members-only chip (GAME-JOINRULE1)
  if(Array.isArray(rule)) return "🔐 listed accounts"

  if(rule && rule.rule){
    const params = rule.params || []
    // GAME-JOINUI1: readable summaries for the known rule engines
    // (katomiaHelpers.js joinRules) — raw "rule(params)" stays as the
    // fallback for any rule type not covered here.
    if(rule.rule === "accountGroup") return "🔐 " + (params[0] || "group") + " group"
    if(rule.rule === "accountIdRange") return "🔐 account " + (params[0] ?? "0") + "–" + (params[1] ?? "∞")
    return "🔐 " + rule.rule + (params.length ? "(" + params.join(",") + ")" : "")
  }

  return ""
}

const columns = [

  {
    key:"id",
    label:"ID",
    render:g => g.id
  },

  {
    key:"gamename",
    label:"Name",
    render:g => g.profile?.name || ""
  },

  {
    key:"network",
    label:"Network",
    render:g => displayValue("network", g.config?.network || g.network)
  },

  {
    key:"visibility",
    label:"Visibility",
    render:g => displayValue("visibility", g.config?.visibility || g.visibility)
  },

  {
    key:"join",
    label:"Join rule",
    render:g => formatJoinRule(g.config?.joinRule ?? g?.joinRule)
  },

  {
    key:"trading",
    label:"Trading mode",
    render:g => displayValue("tradingMode", g.config?.tradingMode)
  },

  {
    key:"lock",
    label:"Lock rule",
    render:g => displayValue("lockRule", g.config?.lockRule || g.lockRule)
  },

  {
    key:"strike",
    label:"Strike delay",
    render:g => formatStrike(g.config?.txDelaySeconds)
  }

]

function formatStrike(seconds){
  seconds = Number(seconds) || 0

  if(seconds === 0) return "⚡ Instant"

  const h = Math.floor(seconds / 3600)
  const m = Math.floor(seconds % 3600 / 60)
  const s = seconds % 60

  if(h > 0 && m === 0 && s === 0) return `⌛ ${h}h`
  if(m > 0 && s === 0 && h === 0) return `⌛ ${m}m`

  if(h > 0) return `⌛ ${h}h ${m}m ${s}s`
  if(m > 0) return `⌛ ${m}m ${s}s`

  return `⌛ ${s}s`
}

async function loadGames(){

  // GAME-JOINRULE1: send the player token so the backend can include the gated
  // markets this player's commitments unlock (same header as /authenticate).
  const res = await fetch(API_URL, {
    headers: { "x-player-token": getOrCreatePlayerToken() }
  })
  const data = await res.json()

  if(!data.ok) return

  const container = document.getElementById("games")

  container.innerHTML = ""   // re-entrant: reloaded after a commitment is published

  container.style.gridTemplateColumns = `repeat(${columns.length},1fr)`

  container.insertAdjacentHTML(
    "beforeend",
    columns
      .map(c => `<div class="grid-header">${c.label}</div>`)
      .join("")
  )

  Object.values(data.games).forEach(g => {

    const idCol = columns.find(c => c.key === "id")
    const nameCol = columns.find(c => c.key === "gamename")
    const chipCols = columns.filter(c => !["id","gamename"].includes(c.key))

    container.insertAdjacentHTML(
      "beforeend",
      `
       <a class="row" href="./game/${g.id}" target="${g.id}">
        <div class="row-header">
          <div class="cell id" data-label="${idCol.label}">
            ${idCol.render(g)}
          </div>
          <div class="cell gamename" data-label="${nameCol.label}">
            ${nameCol.render(g)}
          </div>
        </div>

        <div class="row-chips">
          ${
            chipCols
              .map(c=>`
                <div class="cell ${c.key}" data-label="${c.label}">
                  ${c.render(g)}
                </div>
              `)
              .join("")
          }
        </div>
      </a>
      `
    )

  })

  // Hint only while no gated market is visible (i.e. probably no commitment yet).
  const anyGated = Object.values(data.games).some(g => g.joinRule && g.joinRule !== "*")
  document.getElementById("gatedHint").hidden = anyGated

}

// Fresh commitment published from the profile modal → the backend may now list
// more markets for this player token; refresh in place.
window.onKatomiaBindingPublished = () => loadGames()

</script>

<script><?php require_once('config.php');?>
  window.CONFIG = {
    HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
  }
</script>

<!-- Profile modal stack (PROFILE-INDEX1) — the same modal as in-game, minus the
     game-only scripts. katomia-core is load-safe here (game controls guarded). -->
<?php require_once($_SERVER['DOCUMENT_ROOT'] . "/vendor/walletconnect/kwcScriptTag.php"); ?>
<script src="/vendor/kpay/kpool_widget/qrcode.min.js"></script>
<script src="<?= kasset('katomia-core.js') ?>"></script>
<script src="<?= kasset('katomia-helpers.js') ?>"></script>
<script src="<?= kasset('kemoji.js') ?>"></script>
<script>
  // katomia-modals.js (the diag sender) isn't loaded on this page — shim so the
  // profile/auth scripts' katomiaDiagSend?.() calls resolve instead of ReferenceError.
  window.katomiaDiagSend = window.katomiaDiagSend || function(){}
</script>
<script src="<?= kasset('katomia-profile.js') ?>"></script>
<script src="<?= kasset('katomia-auth.js') ?>"></script>

<script>
// loadGames needs getOrCreatePlayerToken (katomia-core.js above), so it runs here
// rather than at definition time.
loadGames()
</script>

<script>
fetch("./footer.html")
  .then(r => r.text())
  .then(html => {
    document.body.insertAdjacentHTML("beforeend",html)
  })
</script>

<!-- KAT-FEEDBACK1-ENTRYPOINT1: widget on the welcome/games-list page too — long-press
     works here and the header menu's Send feedback opens in place instead of falling
     back to /m/feedback (backend-served canonical copy, KPAD-SELFFEED1) -->
<script src="https://<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>/feedback-widget.js"
        data-product="katomia-home"></script>

</body>
</html>

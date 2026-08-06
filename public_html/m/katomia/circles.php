<?php
require_once __DIR__ . '/kasset.php';
require_once __DIR__ . '/site-config.php';
// ENTRY-CIRCLES1 (user 2026-07-30): the normal-mode index — a SEPARATE page from the
// markets grid (contents.php), deliberately.
//
// Why a new page rather than a mode on the old one: the user wants room to play with
// the proposal-mode framing — naming, card treatment, what's revealed at launch —
// "without impacting the original full list of games". contents.php stays exactly as
// it is behind the nerd-only "See all markets" link: every game, every trading mode,
// full column grid. This page shows proposal-mode games only, as bubble cards.
//
// The word is a parameter (site-config.json terms.space) — "circle" today, possibly
// "game"/"market"/"boardroom" per audience. Internally these are still proposal games;
// nothing here renames the data model. See site-config.php.
$T = katomiaTerms();
$siteConfig = katomiaSiteConfig();
$pageTitle = ($siteConfig['landing']['title'] ?? 'Katomia') . ' ' . $T['Many'];
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- ENTRY-FADES1: in <head> — arms the fade-in before first paint. -->
<script src="<?= kasset('kfade.js') ?>"></script>
<link rel="stylesheet" href="<?= kasset('katomia.css') ?>">
<title><?= htmlspecialchars($pageTitle, ENT_QUOTES, 'UTF-8') ?></title>
<style>
  *{ -webkit-tap-highlight-color: transparent; }
  body{ background:#f7f9fc; color:#333; }

  .circles-wrap{ max-width: 760px; margin: 28px auto; padding: 0 16px; }
  .circles-head{ margin: 0 0 4px; font-size: 22px; }
  .circles-sub{ color:#777; font-size:13.5px; margin: 0 0 22px; }

  /* Card view everywhere — the user's call: "I think we could just show it in kind of
     card view. The same view you would get in mobile." No desktop grid variant, so
     there is no breakpoint switch here at all. */
  .circles-list{ display:flex; flex-direction:column; gap:12px; }
  .circle-card{
    display:block; padding:14px 16px; border-radius:12px;
    background:#fff; border:1px solid #e3e7ee; text-decoration:none; color:inherit;
    box-shadow:0 1px 3px rgba(0,0,0,.05);
  }
  .circle-card:hover{ border-color:#c9d2e0; }
  /* kbubble takes the border over when it attaches (ENTRY-BUBBLE1 convention). */
  .circle-card.kbubble-on{ border-color:transparent !important; box-shadow:none !important; }
  .circle-card.kbubble-filled{ background:transparent !important; }

  .circle-top{ display:flex; align-items:baseline; gap:9px; margin-bottom:9px; flex-wrap:wrap; }
  .circle-name{ font-size:16.5px; font-weight:600; }
  .circle-id{ font-size:12px; color:#8b93a0; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }

  /* Every chip the markets grid shows is shown here too (user: "we can still show all
     the chips because that indicates how there are future possibilities to change
     those") — even though the simple create form only lets you set network and
     visibility. The rest are read-only signals of what the format can do. */
  .circle-chips{ display:flex; flex-wrap:wrap; gap:6px; }
  .circle-chip{
    display:inline-flex; align-items:center; padding:4px 10px;
    background:#f1f4f8; border-radius:999px; font-size:12px; color:#4a5462;
  }
  .circle-chip.net-testnet{ background:#fdf0e2; color:#8a5a12; }
  .circle-chip.net-mainnet{ background:#f2ecfb; color:#5a3a91; }

  /* ── CIRCLES-FILTER1 (user 2026-08-06) ─────────────────────────────────────
     "The list is getting too long, especially the cron ones… at very least we
     should have testnet, mainnet filter." Two rows of chips, client-side over
     the list already fetched — no API change, nothing to keep in sync.
     Rows only render when they'd actually cut something (one network in the
     list = no network row), so a small estate never sees the chrome. */
  .circles-filters{ display:flex; flex-direction:column; gap:8px; margin: 0 0 16px; }
  .circles-filterrow{ display:flex; flex-wrap:wrap; gap:6px; align-items:center; }
  .circles-filterlabel{ font-size:12px; color:#98a0ad; margin-right:2px; }
  .circles-filter{
    border:1px solid #e3e7ee; background:#fff; border-radius:999px;
    padding:5px 12px; font-size:12.5px; color:#4a5462; cursor:pointer;
  }
  .circles-filter:hover{ border-color:#c9d2e0; }
  .circles-filter--on{ background:#2f6fed; border-color:#2f6fed; color:#fff; font-weight:600; }
  .circles-filtercount{ opacity:.65; margin-left:5px; font-size:11px; }

  .circles-empty, .circles-error{ color:#888; font-style:italic; padding:8px 0; }
  .circles-error{ color:#b4690e; font-style:normal; }

  .circles-actions{ margin-top:22px; display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
  .circles-morelink{ font-size:13px; color:#7a8595; text-decoration:none; display:none; }
  body.nerd .circles-morelink{ display:inline; }
  .circles-morelink:hover{ color:#2f6fed; text-decoration:underline; }

  /* GAME-JOINRULE1: same hint as the markets grid — gated games exist but stay hidden
     until this player token carries a commitment. */
  .gated-hint{ margin-top:16px; font-size:13px; color:#777; }
  .gated-hint a{ cursor:pointer; text-decoration:underline; }
</style>
</head>
<body>
<?php
  require __DIR__ . '/header.php';
  require __DIR__ . '/profile-modal.php';
?>

<div class="circles-wrap">
  <h2 class="circles-head"><?= htmlspecialchars($T['Many'], ENT_QUOTES, 'UTF-8') ?></h2>
  <p class="circles-sub">Open <?= htmlspecialchars($T['many'], ENT_QUOTES, 'UTF-8') ?> you can join. Tap one to step inside.</p>

  <div id="circlesFilters" class="circles-filters"></div>
  <div id="circlesList" class="circles-list"></div>

  <div class="gated-hint" id="gatedHint" hidden>
    🔐 Some <?= htmlspecialchars($T['many'], ENT_QUOTES, 'UTF-8') ?> are members-only.
    <a data-menu-profile>Connect a wallet &amp; raise a commitment</a> to see the ones your accounts unlock.
  </div>

  <div class="circles-actions">
    <a class="kbtn kbtn-green" href="<?= $katomiaBase ?>/create?skin=basic">➕ Create your own <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?></a>
    <!-- Nerd-only escape hatch to the unfiltered grid, mirroring the welcome page. -->
    <a class="circles-morelink" href="<?= $katomiaBase ?>/markets">See all markets →</a>
  </div>
</div>

<script>
window.KTERMS = <?= json_encode($T, JSON_UNESCAPED_UNICODE) ?>;

// ENTRY-CIRCLES1: same API and the same display vocabulary as contents.php. Kept as a
// local copy rather than shared: this page is an explicit playground for renaming and
// re-presenting, and the user does NOT want that experimentation reaching the markets
// grid. If the two ever settle on the same presentation, factor it out then.
const API_URL = "<?= $katomiaBase ?>/hapi/games"

const displayLookup = {
  tradingMode: { proposal: "💡 Proposal", orderBook: "📊 Order Book", debug: "🛠️ debug" },
  network:     { playnet: "🧸 Playnet", testnet: "🟠 Testnet", mainnet: "🟣 Mainnet" },
  visibility:  { public: "🌍 Public", unlisted: "🔗 Unlisted", private: "🔒 Private" },
  lockRule:    { cluster: "☆ cluster", active: "☆☆ active", all: "🌍 all" },
  joinRule:    { '*': "🙌 anyone" },
}
const displayValue = (group, value) => displayLookup[group]?.[value] || value || ""

function formatJoinRule(rule){
  if(typeof rule === "string") return displayValue("joinRule", rule)
  if(Array.isArray(rule)) return "🔐 listed accounts"
  if(rule && rule.rule){
    const params = rule.params || []
    if(rule.rule === "accountGroup") return "🔐 " + (params[0] || "group") + " group"
    if(rule.rule === "accountIdRange") return "🔐 account " + (params[0] ?? "0") + "–" + (params[1] ?? "∞")
    return "🔐 " + rule.rule + (params.length ? "(" + params.join(",") + ")" : "")
  }
  return ""
}

function formatStrike(seconds){
  seconds = Number(seconds) || 0
  if(seconds === 0) return "⚡ Instant"
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60), s = seconds % 60
  if(h > 0 && m === 0 && s === 0) return `⌛ ${h}h`
  if(m > 0 && s === 0 && h === 0) return `⌛ ${m}m`
  if(h > 0) return `⌛ ${h}h ${m}m ${s}s`
  if(m > 0) return `⌛ ${m}m ${s}s`
  return `⌛ ${s}s`
}

const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]))

async function loadCircles(){
  const list = document.getElementById("circlesList")
  let data
  try {
    // GAME-JOINRULE1: the player token lets the backend include gated games this
    // player's commitments unlock.
    const res = await fetch(API_URL, { headers: { "x-player-token": getOrCreatePlayerToken() } })
    data = await res.json()
  } catch(e){
    console.warn("[circles] load failed", e)
    list.innerHTML = `<p class="circles-error">Couldn't load ${esc(KTERMS.many)} — check your connection and reload.</p>`
    return
  }
  if(!data?.ok){
    list.innerHTML = `<p class="circles-error">Couldn't load ${esc(KTERMS.many)} right now.</p>`
    return
  }

  const all = Object.values(data.games || {})
  // THE filter that makes this page different from the markets grid: proposal mode only.
  _circles = all.filter(g => (g.config?.tradingMode || g.tradingMode) === "proposal")
  _circlesGated = all.some(g => g.joinRule && g.joinRule !== "*")
  renderCircles()
}

// ── CIRCLES-FILTER1 (user 2026-08-06) ───────────────────────────────────────
// Network is a REAL field, so that row is trustworthy. "Kind" is not: the user
// asked for house-vs-public and demo-vs-live too, and was right about why we
// can't have them properly — "I don't think those are actual tags that's wired
// in, I think that's just the naming that's being used". So this row classifies
// by NAMING CONVENTION and says so, as an explicit stopgap that stops the QA
// cron rows drowning the list today. The real fix is a first-class field on the
// game config (origin: house|public, kind: demo|live|qa) — raised as a task, and
// when it lands this function reads it instead and the heuristic goes away.
let _circles = [], _circlesGated = false
const _circlesFilter = { network: "all", kind: "all" }

function circleKind(g){
  const id = String(g.id || "")
  const name = String(g.profile?.name || "")
  if(/^(kqa-|q-)/i.test(id) || /\bQA\b|cron|automated|canary/i.test(name)) return "qa"
  if(/demo|view.?only|watch.?only/i.test(name)) return "demo"
  return "open"
}

function renderCircles(){
  const list = document.getElementById("circlesList")
  const bar = document.getElementById("circlesFilters")
  const netOf = g => g.config?.network || g.network || ""

  const rows = [
    { key: "network", label: "Network", of: netOf,
      order: ["mainnet", "testnet", "playnet"],
      text: v => displayValue("network", v) },
    { key: "kind", label: "Type", of: circleKind,
      order: ["open", "demo", "qa"],
      text: v => ({ open: "⭕ Open", demo: "📺 Demos", qa: "🧪 QA / cron" }[v] || v) },
  ]

  bar.innerHTML = ""
  rows.forEach(row => {
    // count against the OTHER row's active filter, so each chip's number is what
    // you would actually get by pressing it
    const pool = _circles.filter(g => rows.every(r =>
      r.key === row.key || _circlesFilter[r.key] === "all" || r.of(g) === _circlesFilter[r.key]))
    const values = row.order.filter(v => pool.some(g => row.of(g) === v))
    if(values.length < 2) return                    // nothing to choose between
    const el = document.createElement("div")
    el.className = "circles-filterrow"
    const lab = document.createElement("span")
    lab.className = "circles-filterlabel"
    lab.textContent = row.label
    el.appendChild(lab)
    ;[["all", "All"], ...values.map(v => [v, row.text(v)])].forEach(([v, text]) => {
      const b = document.createElement("button")
      b.type = "button"
      b.className = "circles-filter" + (_circlesFilter[row.key] === v ? " circles-filter--on" : "")
      const n = v === "all" ? pool.length : pool.filter(g => row.of(g) === v).length
      b.innerHTML = esc(text) + `<span class="circles-filtercount">${n}</span>`
      b.onclick = () => { _circlesFilter[row.key] = v; renderCircles() }
      el.appendChild(b)
    })
    bar.appendChild(el)
  })

  const games = _circles.filter(g =>
    (_circlesFilter.network === "all" || netOf(g) === _circlesFilter.network) &&
    (_circlesFilter.kind === "all" || circleKind(g) === _circlesFilter.kind))

  list.innerHTML = ""
  if(!games.length){
    list.innerHTML = `<p class="circles-empty">No open ${esc(KTERMS.many)} match that filter.</p>`
  }

  games.forEach(g => {
    const net = g.config?.network || g.network || ""
    const chips = [
      { cls: "net-" + net, text: displayValue("network", net) },
      { text: displayValue("visibility", g.config?.visibility || g.visibility) },
      { text: formatJoinRule(g.config?.joinRule ?? g.joinRule) },
      { text: displayValue("tradingMode", g.config?.tradingMode) },
      { text: displayValue("lockRule", g.config?.lockRule || g.lockRule) },
      { text: formatStrike(g.config?.txDelaySeconds) },
    ].filter(c => c.text)

    list.insertAdjacentHTML("beforeend", `
      <a class="circle-card" data-kbubble-open href="<?= $katomiaBase ?>/board/${encodeURIComponent(g.id)}">
        <div class="circle-top">
          <span class="circle-name">${esc(g.profile?.name || g.id)}</span>
          <span class="circle-id">${esc(g.id)}</span>
        </div>
        <div class="circle-chips">
          ${chips.map(c => `<span class="circle-chip ${c.cls || ""}">${esc(c.text)}</span>`).join("")}
        </div>
      </a>`)
  })

  document.getElementById("gatedHint").hidden = !_circlesGated

  dressCards()
}

// Fresh commitment published from the profile modal → more games may be visible now.
window.onKatomiaBindingPublished = () => loadCircles()
</script>

<!-- ENTRY-CIRCLES1: cards ARE bubbles here (user: "That cards view should be basically
     bubble view... which if you click on they open up into that game, into the circle").
     Same tuning + the same 800ms entry transition as the welcome page. -->
<script src="<?= kasset('kbubble.js') ?>"></script>
<script src="<?= kasset('kbubbleopen.js') ?>"></script>
<script>
// The LIST tuning is deliberately calmer than the welcome page's two cards, by the
// user's own reasoning: the welcome pair could be "more bubbly ... since it's now
// focussed on the circles options only not all buttons" — restraint was a crowding
// tax. On this page the crowding is back (24 live proposal games today), so the tax
// applies again. Two concrete differences from landing.php's KB_CIRCLE:
//   · fill:null — an iridescent AUTO fill on two cards is a signature; on twenty-four
//     it is a rainbow wall that drowns the names and chips you came here to read.
//     Border only, white card, content stays legible.
//   · ambient .25 vs .9 — twenty-four idling loops should breathe, not shimmer.
// The ENTRY gesture is unchanged: clicking still runs the full 800ms bubble, so the
// page is calm to read and loud to leave.
const KB_LIST = { spread: 0.75, iters: 8, smooth: 0.3, tension: 25, spring: 28,
                  damp: 6, puff: 9, ambient: 0.25, width: 1.1, blur: 4, fill: null }
// Matches landing.php's KBO_CIRCLE — entering a {one} feels identical from either page.
const KBO_CIRCLE = { ms: 800, style: "iridescent", width: 1.6, coverage: 1.22,
                     fill: "auto", fillAlpha: 0.22, backdrop: "auto" }

// kbubble runs an unconditional requestAnimationFrame loop per attached element and has
// no idle/visibility throttle of its own, so attaching to every card would leave 24
// animation loops burning forever — most of them scrolled out of sight, on a page that
// is very likely to be opened on a phone. Attach only what's on screen and destroy on
// the way out; destroy() removes the canvas and the .kbubble-on class, so the plain CSS
// border comes straight back and the card looks correct either way.
// kbubbleOpen.bind() is bound once and left alone — it's only event listeners, no loop.
const seen = new WeakMap()
const io = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
  entries.forEach(e => {
    const el = e.target
    if(e.isIntersecting){
      if(!seen.get(el) && window.kbubble)
        seen.set(el, kbubble.attach(el, Object.assign({ style: "iridescent" }, KB_LIST)))
    } else {
      const h = seen.get(el)
      if(h){ h.destroy(); seen.delete(el) }
    }
  })
}, { rootMargin: "200px 0px" }) : null      // start a little before it scrolls in

function dressCards(){
  document.querySelectorAll(".circle-card").forEach(el => {
    if(el.dataset.kbDressed) return          // loadCircles() is re-entrant
    el.dataset.kbDressed = "1"
    window.kbubbleOpen?.bind(el, Object.assign({}, KBO_CIRCLE, { target: el.getAttribute("href") }))
    if(io) io.observe(el)
    else window.kbubble?.attach(el, Object.assign({ style: "iridescent" }, KB_LIST))
  })
}

window.addEventListener("load", loadCircles)
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

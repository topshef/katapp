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
<?= kicon() ?>
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
  /* CIRCLE-HOSTPAGE1 R2 (user 2026-08-08): "it would be okay to put an emoji onto the
     games that you own ... perhaps on the right hand edge of the button to indicate
     that you are the host". A CUE ONLY — this page stays pure navigation, the user was
     explicit that admin actions live on the host page and nowhere else. margin-left:auto
     pushes it to the far edge of the flex row. */
  .circle-host{ margin-left:auto; font-size:14px; line-height:1; }

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
  .circle-chip--mine{ background:#e8f0fe; color:#1a56c4; font-weight:600; }
  .circle-chip--aud .katomia-aud{ display:inline-flex; gap:7px; }
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

  /* Connect widget REMOVED (user 2026-08-17, KATUI3 feedback pass): "we can declutter
     the circles page and get rid of the connect your wallet from there as well…
     consolidate to the profile modal as the place to do that." The gated-hint below
     (which opens the profile modal) is the one remaining connect route here. */
</style>
</head>
<body>
<?php
  define('KATOMIA_PAGE', 'circles');   // MENU-SPEC1: header.php shapes the ☰ by page
  require __DIR__ . '/header.php';
  require __DIR__ . '/profile-modal.php';
?>

<div class="circles-wrap">
  <h2 class="circles-head"><?= htmlspecialchars($T['Many'], ENT_QUOTES, 'UTF-8') ?></h2>
  <p class="circles-sub">Open <?= htmlspecialchars($T['many'], ENT_QUOTES, 'UTF-8') ?> you can join. Tap one to step inside.</p>
  <?php if ($katomiaIsAdmin): ?>
  <!-- ADMIN-VIEW disclosure (user 2026-08-19, "why is Edge showing QA?"): from an admin
       IP (VPN) the BACKEND's /games returns every game raw — unlisted, QA fixtures, the
       lot (katomiaApi.js ADMIN_IPS) — so two browsers routing differently through the
       VPN genuinely see different lists. Say so on the page instead of leaving the
       difference to be puzzled over. Server-side per request, same as the 🛠 menu item. -->
  <p class="circles-sub" style="color:#b4690e">🛠 Admin IP view — this list may include raw/unlisted/QA <?= htmlspecialchars($T['many'], ENT_QUOTES, 'UTF-8') ?> other visitors never see. Off the VPN it looks different.</p>
  <?php endif; ?>

  <div id="circlesFilters" class="circles-filters"></div>
  <div id="circlesList" class="circles-list"></div>

  <!-- Copy change (user 2026-08-17, KATUI3 feedback pass): "authenticate" replaces
       "raise a commitment" — authenticating is enough to prove who you are for
       access; the commitment is a reputation bonus, not the entry ticket. Still
       opens the profile modal ([data-menu-profile]). -->
  <div class="gated-hint" id="gatedHint" hidden>
    🔐 Some <?= htmlspecialchars($T['many'], ENT_QUOTES, 'UTF-8') ?> are members-only.
    <a data-menu-profile>Connect a wallet and authenticate</a> to see the ones your accounts unlock.
  </div>

  <div class="circles-actions">
    <a class="kbtn kbtn-green" href="<?= $katomiaBase ?>/create?skin=basic">➕ Create your own <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?></a>
    <!-- Nerd-only escape hatch to the unfiltered grid, mirroring the welcome page. -->
    <a class="circles-morelink" href="<?= $katomiaBase ?>/markets">See all markets →</a>
  </div>

  <!-- The 2026-08-13 connect widget was REMOVED on 2026-08-17 (KATUI3 feedback pass):
       one place to connect — the profile modal, reached via the gated-hint above. -->
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
}
const displayValue = (group, value) => displayLookup[group]?.[value] || value || ""

// WATCH vs PLAY (user 2026-08-19): "public doesn't mean anyone can join … it's the
// visibility that's public". Two different rights, two chips — the visibility chip
// (🌍/🔗/🔒) says who can SEE the circle, this one says who can TAKE PART; the pairing
// is spelled out in each chip's tooltip. "listed accounts" retired: since
// GAME-JOINRULE2a an allowlist entry can be a TOKEN (hold ≥1 to get in), so the
// honest umbrella word is "members".
function formatJoinRule(rule){
  if(!rule || rule === "*") return "🙌 anyone plays"
  if(typeof rule === "string" || Array.isArray(rule) || rule.rule) return "🎟 members"
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
  // MENU-SPEC1 (owner 2026-10-09, carried from lab2 KMAP3): side circles (<parent>~<n>,
  // KAT-BREAKOUT1) are settlement rooms you are moved into from their parent — never listed.
  _circles = all.filter(g => (g.config?.tradingMode || g.tradingMode) === "proposal" && !/~\d+$/.test(String(g.id)))
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
//
// R2 (user 2026-08-17, KATUI3 feedback pass):
//  · Type is MULTI-SELECT toggles now — single-select made "open + demos without
//    the QA cron noise" impossible, and the QA rows are "not really meant for
//    customer consumption". DEFAULT hides qa; All / None both reachable.
//  · Every selection mirrors into the URL (?network=…&type=…, replaceState) so a
//    filtered view deep-links — e.g. /circles?type=demos sends someone straight
//    to the demos list. Absent params = the defaults, so plain /circles is clean.
let _circles = [], _circlesGated = false
const CIRCLE_KINDS = ["open", "demo", "qa"]
const KIND_URL = { open: "open", demo: "demos", qa: "qa" }   // "demo" reads as "demos" in URLs
const KIND_FROM_URL = { open: "open", demo: "demo", demos: "demo", qa: "qa" }
const KIND_DEFAULT = ["open", "demo"]
// MENU-NET1 (owner 2026-10-09): the network is a MODE, not a filter picked here.
// MENU-NET2 (same day): the switch is in THIS page's ☰ too — the same control and the same
// setting as Home's, so the two can never disagree — and the chip row is gone, developer
// mode included (the raw markets grid stays the unfiltered developer view). A ?network= deep
// link SETS the mode (it is the same setting), then drops out of the URL.
// LIST-MINE1 (same day): a "Mine" row — circles where you have accounts on the board (the
// games list's `you`, sent for this browser's player token) and the rest; multi-select,
// both on by default, shown only when you are in at least one. ?mine=in|out deep-links.
const _circlesMode = () => (window.katomiaNet ? katomiaNet.get() : "all")
const _circlesFilter = { network: _circlesMode(), kinds: new Set(KIND_DEFAULT), mine: new Set(["in", "out"]) }
const _circlesDev = () => { try { return localStorage.getItem("katomia.nerd.v1") === "1" } catch { return false } }

function circlesReadUrl(){
  const p = new URLSearchParams(location.search)
  const net = p.get("network")
  if(["mainnet", "testnet", "playnet"].includes(net)){ window.katomiaNet?.set(net); _circlesFilter.network = _circlesMode() }
  const mine = (p.get("mine") || "").toLowerCase()
  if(mine === "in" || mine === "out") _circlesFilter.mine = new Set([mine])
  const t = (p.get("type") || "").toLowerCase()
  if(t === "all") _circlesFilter.kinds = new Set(CIRCLE_KINDS)
  else if(t === "none") _circlesFilter.kinds = new Set()
  else if(t){
    const ks = t.split(",").map(s => KIND_FROM_URL[s.trim()]).filter(Boolean)
    if(ks.length) _circlesFilter.kinds = new Set(ks)
  }
}

function circlesWriteUrl(){
  const p = new URLSearchParams(location.search)
  p.delete("network")   // MENU-NET2: the ☰ holds it
  _circlesFilter.mine.size === 1 ? p.set("mine", [..._circlesFilter.mine][0]) : p.delete("mine")
  const sel = CIRCLE_KINDS.filter(k => _circlesFilter.kinds.has(k))
  const isDefault = sel.length === KIND_DEFAULT.length && KIND_DEFAULT.every(k => _circlesFilter.kinds.has(k))
  if(isDefault) p.delete("type")
  else if(sel.length === CIRCLE_KINDS.length) p.set("type", "all")
  else if(!sel.length) p.set("type", "none")
  else p.set("type", sel.map(k => KIND_URL[k]).join(","))
  history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p.toString() : "") + location.hash)
}

function circleKind(g){
  const id = String(g.id || "")
  const name = String(g.profile?.name || "")
  if(/^(kqa-|q-)/i.test(id) || /\bQA\b|cron|automated|canary/i.test(name)) return "qa"
  if(/demo|view.?only|watch.?only/i.test(name)) return "demo"
  return "open"
}

function renderCircles(){
  // read once per render, not per card — it parses JSON out of localStorage
  const MY_KEY = typeof katomiaMyIntentKeyHex === "function" ? katomiaMyIntentKeyHex() : ""
  const list = document.getElementById("circlesList")
  const bar = document.getElementById("circlesFilters")
  const netOf = g => g.config?.network || g.network || ""

  const kindText = v => ({ open: "⭕ Open", demo: "📺 Demos", qa: "🧪 QA / cron" }[v] || v)
  // With only one kind on the estate there's no Type row to change the selection
  // with, so the kind filter must not silently hide the whole list — bypass it.
  const kindsPresent = CIRCLE_KINDS.filter(v => _circles.some(g => circleKind(g) === v))
  // MENU-NET1 (lab2 KMAP1): play-money demos show under either real network
  const netOk = g => _circlesFilter.network === "all" || netOf(g) === _circlesFilter.network
    || (netOf(g) === "playnet" && _circlesFilter.network !== "playnet" && !_circlesDev())
  const kindOk = g => kindsPresent.length < 2 || _circlesFilter.kinds.has(circleKind(g))

  bar.innerHTML = ""
  const makeRow = label => {
    const el = document.createElement("div")
    el.className = "circles-filterrow"
    const lab = document.createElement("span")
    lab.className = "circles-filterlabel"
    lab.textContent = label
    el.appendChild(lab)
    return el
  }
  const makeChip = (row, text, on, n, onclick) => {
    const b = document.createElement("button")
    b.type = "button"
    b.className = "circles-filter" + (on ? " circles-filter--on" : "")
    b.innerHTML = esc(text) + `<span class="circles-filtercount">${n}</span>`
    b.onclick = () => { onclick(); circlesWriteUrl(); renderCircles() }
    row.appendChild(b)
  }

  // (MENU-NET2: no Network row — the ☰ is the switch, on this page as on Home)
  const isMine = g => (g.you?.accounts || 0) > 0
  const mineOk = g => _circlesFilter.mine.has(isMine(g) ? "in" : "out")

  // Type row — multi-select toggles (R2), counts against the live Network selection
  {
    const pool = _circles.filter(netOk)
    const values = CIRCLE_KINDS.filter(v => pool.some(g => circleKind(g) === v))
    if(values.length >= 2){
      const row = makeRow("Type")
      const allOn = values.every(v => _circlesFilter.kinds.has(v))
      makeChip(row, "All", allOn, pool.length, () => {
        // All ⇄ None: pressing All again clears the selection (the "all and none" pair)
        _circlesFilter.kinds = allOn ? new Set() : new Set(CIRCLE_KINDS)
      })
      values.forEach(v => makeChip(row, kindText(v), _circlesFilter.kinds.has(v),
        pool.filter(g => circleKind(g) === v).length, () => {
          _circlesFilter.kinds.has(v) ? _circlesFilter.kinds.delete(v) : _circlesFilter.kinds.add(v)
        }))
      bar.appendChild(row)
    }
  }

  // Mine row (LIST-MINE1) — only when you are in at least one listed circle on this network
  {
    const pool = _circles.filter(g => netOk(g) && kindOk(g))
    const n = pool.filter(isMine).length
    if(n){
      const row = makeRow("Mine")
      const chip = (v, text, count) => makeChip(row, text, _circlesFilter.mine.has(v), count, () => {
        const m = _circlesFilter.mine
        m.has(v) && m.size > 1 ? m.delete(v) : m.add(v)
      })
      chip("in", "I'm in", n)
      chip("out", "Others", pool.length - n)
      bar.appendChild(row)
    }
  }

  const games = _circles.filter(g => netOk(g) && kindOk(g) && mineOk(g))

  list.innerHTML = ""
  if(!games.length){
    list.innerHTML = `<p class="circles-empty">No open ${esc(KTERMS.many)} match that filter.</p>`
  }

  games.forEach(g => {
    const net = g.config?.network || g.network || ""
    const joinRule = g.config?.joinRule ?? g.joinRule
    const gatedJoin = joinRule && joinRule !== "*"
    const chips = [
      { cls: "net-" + net, text: displayValue("network", net) },
      { text: displayValue("visibility", g.config?.visibility || g.visibility),
        title: "Visibility — who can find and watch this " + KTERMS.one },
      { text: formatJoinRule(joinRule),
        title: gatedJoin
          ? "Participation — members only: you need a listed account, or to hold a qualifying token, to play (watching may still be open)"
          : "Participation — anyone can play, no membership needed" },
      { text: displayValue("tradingMode", g.config?.tradingMode) },
      { text: displayValue("lockRule", g.config?.lockRule || g.lockRule) },
      { text: formatStrike(g.config?.txDelaySeconds) },
    ].filter(c => c.text)

    list.insertAdjacentHTML("beforeend", `
      <a class="circle-card" data-kbubble-open href="<?= $katomiaBase ?>/board/${encodeURIComponent(g.id)}">
        <div class="circle-top">
          <span class="circle-name">${esc(g.profile?.name || g.id)}</span>
          <span class="circle-id">${esc(g.id)}</span>
          ${katomiaIsHostOf(g, MY_KEY) ? `<span class="circle-host" title="You host this ${esc(KTERMS.one)}">🎪</span>` : ""}
        </div>
        <div class="circle-chips">
          ${isMine(g) ? `<span class="circle-chip circle-chip--mine" title="You have ${g.you.accounts} account${g.you.accounts > 1 ? "s" : ""} on this board">you're in</span>` : ""}
          ${chips.map(c => `<span class="circle-chip ${c.cls || ""}"${c.title ? ` title="${esc(c.title)}"` : ""}>${esc(c.text)}</span>`).join("")}
          ${window.katomiaAudienceHtml ? (h => h ? `<span class="circle-chip circle-chip--aud">${h}</span>` : "")(katomiaAudienceHtml(g.activity)) : ""}
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
// BUBBLE-LINKS1 (owner 2026-10-09): the list's hover bubble (CIRCLES-BUBBLECOST1 / HOLD1 —
// a plain card at rest, ONE living outline under the pointer, the 800ms entry on click) moved
// to katomia-places.js so Home's rows wear the very same effect. History and tuning live there.
function dressCards(){ window.katomiaDressCircleLinks?.(document.querySelectorAll(".circle-card")) }

window.addEventListener("load", () => { circlesReadUrl(); loadCircles() })
// MENU-NET2: the ☰ on this page switches the network — the list follows at once
document.addEventListener("katomia:network", e => { _circlesFilter.network = e.detail.network; circlesWriteUrl(); renderCircles() })

// (the page's connect widget and its glue were removed 2026-08-17 — KATUI3 feedback
// pass; wallet connection is consolidated into the profile modal)
</script>

<script><?php require_once('config.php'); ?>
  window.CONFIG = {
    HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
  }
</script>

<script src="/vendor/kpay/kpool_widget/qrcode.min.js"></script>
<script src="<?= kasset('katomia-core.js') ?>"></script>
<script src="<?= kasset('katomia-helpers.js') ?>"></script>
<script src="<?= kasset('katomia-places.js') ?>"></script>   <!-- RECENT-VISITS1 + AUDIENCE-WWP1 -->
<script src="<?= kasset('kemoji.js') ?>"></script>
<script src="<?= kasset('katomia-profile.js') ?>"></script>
<script src="<?= kasset('katomia-auth.js') ?>"></script>
<?php require_once($_SERVER['DOCUMENT_ROOT'] . "/vendor/walletconnect/kwcScriptTag.php"); ?>
<!-- GCP feedback 2026-08-13 ("mobile after feedback flow breaks"): this page had no
     widget, so the header menu's Send feedback NAVIGATED to /m/feedback — and coming
     back later restored that page from bfcache as a dead, already-used form. Load the
     widget here (KPAD-SELFFEED1 canonical backend copy) so the modal opens in place,
     same as contents.php. data-screenshot off per KAT-FEEDSHOT-BROKEN1. -->
<script src="<?= htmlspecialchars($hapi_widget_src, ENT_QUOTES, 'UTF-8') ?>"
        data-product="katomia-circles"
        data-screenshot="0"></script>
</body>
</html>

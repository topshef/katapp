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
const _circlesFilter = { network: "all", kinds: new Set(KIND_DEFAULT) }

function circlesReadUrl(){
  const p = new URLSearchParams(location.search)
  const net = p.get("network")
  if(["mainnet", "testnet", "playnet"].includes(net)) _circlesFilter.network = net
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
  _circlesFilter.network === "all" ? p.delete("network") : p.set("network", _circlesFilter.network)
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
  const netOk = g => _circlesFilter.network === "all" || netOf(g) === _circlesFilter.network
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

  // Network row — single-select, counts taken against the live Type selection so
  // each chip's number is what you'd actually get by pressing it
  {
    const pool = _circles.filter(kindOk)
    const values = ["mainnet", "testnet", "playnet"].filter(v => pool.some(g => netOf(g) === v))
    if(values.length >= 2){
      const row = makeRow("Network")
      makeChip(row, "All", _circlesFilter.network === "all", pool.length,
        () => { _circlesFilter.network = "all" })
      values.forEach(v => makeChip(row, displayValue("network", v), _circlesFilter.network === v,
        pool.filter(g => netOf(g) === v).length, () => { _circlesFilter.network = v }))
      bar.appendChild(row)
    }
  }

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

  const games = _circles.filter(g => netOk(g) && kindOk(g))

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
          ${chips.map(c => `<span class="circle-chip ${c.cls || ""}"${c.title ? ` title="${esc(c.title)}"` : ""}>${esc(c.text)}</span>`).join("")}
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

// ── CIRCLES-BUBBLECOST1 (user 2026-08-06) ──────────────────────────────────
// "I can hear my laptop fan spinning now, and I'm wondering if that page is
// generating too much noise due to the processing needed for the bubble effect."
// It was: kbubble runs an unconditional rAF loop PER attached element, and the
// previous IntersectionObserver policy kept one running for every card on screen
// — a dozen idling simulations, forever, on a page you mostly sit and read.
//
// New policy, which is the user's own proposal: "there's a way to optimize the
// animation to prevent it doing anything until you actually hover on it… so they
// don't really oscillate until you get a hover, and then only that particular one
// has the animation, and then once it settles down, if you hover away it finishes
// its bounce and then it switches back to being static again."
//   · resting state = the plain CSS rounded-rect border. Zero JS, zero rAF.
//   · hover/focus = attach ONE bubble, puff it, let it live while the pointer is
//     there. At most one loop on the page, and only while you are pointing at it.
//   · leaving = a settle delay, then destroy — the bounce finishes, then the card
//     goes back to being a static rectangle.
//   · touch (no hover at all) = never ambient. The click still runs kbubbleOpen's
//     full 800ms entry gesture, untouched — the loud bit was never the problem.
// The user also floated keeping a bubble or two "in memory" to avoid attach cost;
// not needed — with one live at a time, attach is a canvas + a point loop, and it
// happens under the pointer where a few ms is invisible.
//
// And because only one runs at a time we can afford a much finer outline: the
// corners looked "slightly Jaggedy" because kbubble distributes its points evenly
// by perimeter LENGTH, so on a long, wide card the short corner arcs got barely
// one sample each. points: 320 (default 140) puts real samples on the corners.
const KB_HOVER = Object.assign({}, KB_LIST, { style: "iridescent", points: 320, ambient: 0.5 })
const SETTLE_MS = 900

// ── CIRCLES-BUBBLEHOLD1 (user 2026-08-07) ──────────────────────────────────
// "when you hover on a circle it does the animation thing, but if you keep
// hovering on it the animation disappears — it just times out. If the mouse is
// still over the button area that animation should persist. It should keep
// going until you exit, and then it fades away."
// Not a timeout — nothing was cancelling it. kbubble's ONLY sustained forcing is
// the `ambient` term (0.5 · 0.05 · sin), which against damp:6 settles to a
// sub-pixel shimmer, so the entry puff visibly decays to a still outline in
// about a second. Movement hid it: kbubble impulses on pointermove, so the
// border only died when you held the mouse still — exactly the "keep hovering"
// case being reported.
// Fix is a STIR: while the pointer is on the card, keep feeding the same gentle
// impulses the pointer would. Strength and interval are jittered so it reads as
// a living border rather than a metronome. Costs nothing extra — the rAF loop is
// already running (that IS the hover state, per CIRCLES-BUBBLECOST1); we are
// only stopping it from converging. On leave the stir stops first, so the last
// wave still gets its full SETTLE_MS bounce before the FADE_MS dissolve — the
// "keep going until you exit, then fade away" shape, unchanged.
const STIR_MIN_MS = 420, STIR_MAX_MS = 760
function stirOn(el, h){
  stirOff(el)
  const tick = () => {
    if(!live.get(el)) return
    try { h.puff?.(KB_HOVER.puff * (0.22 + Math.random() * 0.26)) } catch(e){}
    el.__kbStir = setTimeout(tick, STIR_MIN_MS + Math.random() * (STIR_MAX_MS - STIR_MIN_MS))
  }
  el.__kbStir = setTimeout(tick, STIR_MIN_MS)
}
function stirOff(el){ clearTimeout(el.__kbStir); el.__kbStir = null }

const live = new WeakMap()
function bubbleOn(el){
  if(!window.kbubble) return
  clearTimeout(el.__kbOff)
  const existing = live.get(el)
  if(existing){                                  // re-entered during the settle/fade: revive, don't re-attach
    const cv = el.querySelector("canvas")
    if(cv){ cv.style.transition = ""; cv.style.opacity = "" }   // undo a fade already in flight
    el.classList.add("kbubble-on")
    stirOn(el, existing)
    return
  }
  const h = kbubble.attach(el, KB_HOVER)
  if(!h) return                    // prefers-reduced-motion: kbubble opts out
  live.set(el, h)
  try { h.puff?.() } catch(e){}
  stirOn(el, h)
}
// R2 (user 2026-08-06): "if you leave it and let them fade out, they suddenly pop
// away — I think we should have them fade out." The bubble still gets its full
// settle (the bounce finishes, as before); what changed is the END: the canvas
// dissolves instead of vanishing, and the card's own CSS border is restored at
// the START of that dissolve so the two cross-fade — there is never a frame with
// no border at all, which is what the pop actually was.
// (The user's preferred alternative — a resting border that IS the bubble's
// iridescent colouring, just not moving — is logged on CIRCLES-BUBBLECOST1: it
// needs kbubble's palette expressed as a CSS gradient, and guessing at it would
// land somewhere between "close" and "wrong".)
const FADE_MS = 420
function bubbleOff(el){
  stirOff(el)                        // stop feeding it; the last wave still gets its full settle
  clearTimeout(el.__kbOff)
  el.__kbOff = setTimeout(() => {
    const h = live.get(el)
    if(!h) return
    const cv = el.querySelector("canvas")
    if(!cv){ h.destroy(); live.delete(el); return }
    el.classList.remove("kbubble-on", "kbubble-filled")   // CSS border back, under the fading canvas
    cv.style.transition = `opacity ${FADE_MS}ms ease`
    cv.style.opacity = "0"
    el.__kbOff = setTimeout(() => { h.destroy(); live.delete(el) }, FADE_MS)
  }, SETTLE_MS)
}

function dressCards(){
  document.querySelectorAll(".circle-card").forEach(el => {
    if(el.dataset.kbDressed) return          // loadCircles() is re-entrant
    el.dataset.kbDressed = "1"
    window.kbubbleOpen?.bind(el, Object.assign({}, KBO_CIRCLE, { target: el.getAttribute("href") }))
    el.addEventListener("mouseenter", () => bubbleOn(el))
    el.addEventListener("mouseleave", () => bubbleOff(el))
    el.addEventListener("focus", () => bubbleOn(el))       // keyboard parity
    el.addEventListener("blur", () => bubbleOff(el))
  })
}

window.addEventListener("load", () => { circlesReadUrl(); loadCircles() })

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

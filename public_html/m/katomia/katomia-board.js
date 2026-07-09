// katomia-board.js — BOARD-UI1 prototype: board-game skins for proposal mode.
// Loaded ONLY by board.php, AFTER katomia-render.js — the render() declaration
// below therefore replaces the grid renderer (later classic-script function
// declarations win), while everything else (socket, enrichment, makeAssetEl,
// setupDropTarget, openAssetModal, lock-progress) is reused untouched.
//
// Two skins share one layout engine (they differ only in where baskets show):
//   table  — "round table" god view: every player is a wedge; each seat card
//            shows their AVAILABLE (outer band) and their BASKET (inner band);
//            you are the dock at the bottom; center oval = shared table with
//            the lock ring.
//   market — "market square" ego view: seats are STALLS showing only their
//            available; YOUR basket is the center table (trays coloured by
//            giver); your store stays in the dock.
// Reserved is never a column here: a reserved asset stays in its owner's
// available band GHOSTED (the established dashed/faded language).

/* ── skin state ─────────────────────────────────────────────────────────── */

const BOARD_SKINS = ["ring", "ring2", "ring3", "ring4", "ring5", "ring6", "ring7", "ring8", "ring9", "susan", "table", "market"]

// ring2/ring3 = the 2026-07-09 review-pass treatment (board-game feel): account
// ids etched into the felt instead of label rows, oval faded+thickened (future
// tap-to-lock arc), footer control bar. ring2 etches along the most-horizontal
// segment boundary, ring3 at the segment centroid, and both tint chip FACES by
// owner. ring4 = the feedback pass on ring2 (2026-07-09 #2, now the default):
// boundary etching won (centroid ids get buried under assets), but face tint
// lost — an NFT's own artwork colour must never read as ownership, so EVERY
// chip instead wears the v1 basket treatment: the owner's thick left sleeve,
// clean face. Chips a smidge bigger everywhere. One frozen variant per
// iteration, on purpose — new feedback = new skin, so oddities stay comparable.
// ring5 (feedback pass 3, default): sleeve drawn as the OG SOLID BAR (square
// left corners, not a rounded border), per-account LOCK ARCS on the oval
// (tap your own arc to lock — stage 2 arrives), hub becomes the cluster
// progress ring, footer gains ▶ (animate transfers ghost→basket).
// ring6 (experiment): ring5 with the oval line REMOVED — the user is half
// inclined to drop it; inner zone reads from a soft shading + sleeves alone,
// and lock arcs materialise only where a lock exists (plus a faint dashed
// affordance on your own segments).
// ring7 (review 4, 2026-07-09 — v6 confirmed as the base, default): the
// shading INVERTS — the basket zone is a permanent light SPOTLIGHT, and when
// an account locks their STORE zone darkens (spotlight stays lit, orange arc
// stays); locked accounts get a 🔒 prefix on the etched id (badge dropped);
// ▶ preview leaves a trailing line in the giver's colour that fades slowly.
//
// Naming (user): the inner spotlight area = BASKET, the outer holding area =
// STORE (matches the grid view's store/reserved language).
//
// Review-4 observations, noted not tasked (still exploratory):
// - shared god view confirmed working: same rotation value on two screens
//   aligns the boards; chip FLOW inside a box still varies with viewport
//   size — acceptable, the segment geometry is what's shared
// - Firefox sometimes renders some players' chips as images and not others —
//   pre-existing enrichment/thumb-cache glitch, not a board issue
// - 8 accounts: fine on desktop, too crowded on portrait mobile (~4 is the
//   practical ceiling) — the lots-of-players story (start wide, whittle to a
//   cluster, flip between clusters; Active-only is the seed of it) is THE
//   open challenge for this view
// ring8 (review 6, 2026-07-09 — default; v7 frozen): the snag+structure pass.
// - lock 🔒 no longer SHIFTS the etched id (own text node, anchored before it)
// - locked store dim now sits ABOVE the chips (felt split into base/top SVG
//   layers) — only the account id + 🔒 + xproof label stay bright
// - chip faces WHITE (one player's grey chips vanished against the shading)
// - boundary marking INVERTED: your own arc has NO line (your space flows
//   into the baskets); other players' arcs are solid light grey, and the two
//   mine/other boundaries extend to the screen edge — one continuous divider
//   splitting the board into "where you can drop" vs everyone else's stores.
//   Your arc stays TAPPABLE (transparent stroke) and lights orange on lock.
// - xproof label (accountLabelCache) etched under the id, smaller
// - hub wears a faint Montserrat K (KPAY brand) behind the count
// - chips + etched ids scale with viewport (~⅔ … ~1.3× of the old fixed size)
// - pair/trail lines route UNDER the chips (host z-index below the boxes;
//   the "flips above at rest" glitch was the host sitting over everything)
// - footer rework: account dropdown (pick → Lock/Unlock + 🗑 Delete, ➕ Add
//   at the bottom; the SIGN button will occupy the Lock slot once all-locked
//   — same checkpoint, later phase), Net view toggle (viewer-local netting),
//   "You at bottom" orientation toggle (off = shared/screen-share layout)
// - offers from OTHER PLAYERS (player level, not account — your own second
//   account shouldn't animate at you) fly in with a trail when they land
// ring9 (review 7, 2026-07-09 — default; v8 frozen): fix + party-semantics pass.
// - line-over-chips-at-rest ROOT CAUSE found: position:fixed elements are
//   their own stacking contexts (Chrome), and #boardRoot had NO z-index — so
//   the line hosts' z4 vs the boxes' z5 never competed; DOM order painted the
//   hosts (later siblings) on top. #boardRoot now carries z-index:5 (global
//   bug fix, all skins).
// - trails DOTTED + fading (dasharray is the dot pattern now; draw-in gone)
// - withdraw/reject animates the chip BACK to its owner's store — shown to
//   everyone INCLUDING the actor (it's a click, not a drag; the motion cues
//   where it returned to)
// - Net = FULL pairwise netting (A→B $1 + B→A $3 ⇒ single B→A $2), not just
//   same-direction merging. Netted-away chips: a fade-out would be nice —
//   BOARD-POLISH1 (needs FLIP diffing; the "1 flies into the 3 and crashes
//   into 2" animation is the deluxe version, also parked there).
// - "Active only" → "Party only", rule-aware: cluster → only MY cluster;
//   active → all active accounts; all → everyone. Shows who is actually
//   party to my proposal.
// - when ≥2 disconnected clusters coexist, segments OUTSIDE my cluster fade
//   their wash — the "cluster settles by surprise" problem becomes visible
// - hub K sized to fill the circle; footer lock button fixed-width; dropdown
//   🔒 moved AFTER the id (no jump); dev rotation spinner dropped (superseded
//   by You-at-bottom; frozen skins keep theirs). Parked idea: TWEEN the
//   rotation when toggling You-at-bottom — one number, easy juice someday.
// susan (Lazy Susan v1, same pass): the ring UNWRAPPED for the wide phase —
// other accounts are rectangular cards in a horizontal carousel (arrows +
// native swipe), my store+basket strips sit full-width above the footer.
// Same chips, same drop semantics, same footer/net/party machinery. This is
// the browsing view for many players; the ring is the endgame view once a
// cluster forms (flow discussion: RENDERPATH doc §8).
const ringEtched = () => /^ring[2-9]$/.test(boardSkin) || susan()
const ringSleeved = () => /^ring[4-9]$/.test(boardSkin) || susan()
const ringArcs = () => /^ring[5-9]$/.test(boardSkin)
const ringNoOval = () => /^ring[6-9]$/.test(boardSkin)
const ring8 = () => /^ring[89]$/.test(boardSkin) || susan()   // v8 feature set
const ring9 = () => boardSkin === "ring9" || susan()          // v9 fix set
const susan = () => boardSkin === "susan"

let boardSkin = (() => {
  const s = new URLSearchParams(location.search).get("skin")
  return BOARD_SKINS.includes(s) ? s : "ring9"
})()

// footer state (viewer-local, session-only)
let boardSelfBottom = true        // me at 6 o'clock; off = shared layout
let boardNetView = false          // FULL pairwise netting of FT basket flows
let boardSelectedAccount = null   // footer dropdown selection (account id)
let boardPartyOnly = false        // rule-aware party-to-proposal filter

// dev control (footer): the layout's start angle — segments begin here and run
// clockwise. 180 = the first account's segment straddles 9 o'clock. Editable
// to explore how different rotations render; not a user-facing feature.
let boardStartAngle = 180

{
  const sel = document.getElementById("boardSkinSelect")
  if(sel){
    sel.value = boardSkin
    sel.onchange = e => {
      boardSkin = e.target.value
      const u = new URL(location)
      u.searchParams.set("skin", boardSkin)
      history.replaceState(null, "", u)
      render()
    }
  }
}

let _boardResizeT = null
window.addEventListener("resize", () => {
  clearTimeout(_boardResizeT)
  _boardResizeT = setTimeout(() => render(), 150)
})

/* ── render() override ──────────────────────────────────────────────────── */

async function render(){
  if(!state) return

  document.body.dataset.viewMode = "board"
  document.body.dataset.boardSkin = boardSkin
  if(gameMeta?.network)
    document.body.dataset.network = gameMeta.network.toLowerCase()

  renderBoard()
}

function renderBoard(){

  const root = document.getElementById("boardRoot")
  if(!root) return

  if(susan()){
    renderSusanBoard(root)
    return
  }

  if(boardSkin.startsWith("ring")){
    renderRingBoard(root)
    return
  }

  const accounts = getVisibleAccounts(getAccounts())
  const accountMap = getAccountMap()
  const reservedByAccount = buildReservedByAccount(accounts)

  const mine = accounts.filter(a => isMyAccount(a))
  const others = accounts.filter(a => !isMyAccount(a))

  const W = root.clientWidth, H = root.clientHeight
  const geo = { W, H, cx: W / 2, cy: H * 0.42 }

  const frag = document.createDocumentFragment()

  // seats fan across the top arc, spreading with player count; 270° = top
  const n = others.length
  if(n){
    const span = Math.min(240, Math.max(100, n * 64))
    const start = 270 - span / 2

    others.forEach((account, i) => {
      const a0 = start + i * span / n
      const a1 = start + (i + 1) * span / n
      frag.appendChild(makeWedge(account, a0, a1, geo))
      frag.appendChild(makeSeatCard(account, (a0 + a1) / 2, geo, n, { reservedByAccount, accountMap }))
    })
  }

  // my colour washes the bottom slice (table skin — in market skin the center
  // table already reads as "mine")
  if(mine.length && boardSkin === "table")
    frag.appendChild(makeWedge(mine[0], 55, 125, geo, true))

  frag.appendChild(makeCenterOval(mine, accounts, geo, { accountMap }))
  frag.appendChild(makeDock(mine, { reservedByAccount, accountMap }))

  root.replaceChildren(frag)
}

/* ── ring skin (user drawing 2026-07-09) ────────────────────────────────── */
// The legacy MOBILE view transposed to polar. One segment per ACCOUNT (not
// player — a player with 3 accounts holds 3 segments; drops target an account
// explicitly, no nested aiming). The big oval is the basket boundary: inside
// it = that account's basket, outside to the screen edge = their available,
// with reserved GHOSTED IN PLACE. Hovering a ghost or a basket item shows the
// legacy dotted trade line between them (highlightTradePair — same rules).
// Segments run in JOIN ORDER from 9 o'clock, clockwise, and the layout is the
// SAME for every viewer (shared board — livestream-friendly; a rotate-to-me
// toggle can come later). Your own segments get a stronger wash + (you).
// The small center circle is the pivot — it becomes the strike timer /
// hourglass in the signing phase (stage 2, with per-segment lock arcs on the
// oval line itself; for now locks are glyphs on the account label).

function renderRingBoard(root){

  // join order — shared board for all; filters preserve join order
  // (getVisibleAccounts sorts mine-first, which would reseat the shared board)
  const accounts = boardFilteredAccounts()
  const accountMap = getAccountMap()
  const reservedByAccount = buildReservedByAccount(accounts)
  const etched = ringEtched()

  const W = root.clientWidth, H = root.clientHeight
  const cx = W / 2, cy = H / 2
  const rc = Math.max(24, Math.min(W, H) * 0.045)          // center pivot
  // basket oval — capped so east/west segments keep ≥ ~95px of available-space
  // outside it (portrait phones squeezed chips across the line otherwise)
  const rx = Math.max(92, Math.min(W * 0.30, W / 2 - 95))
  const ry = Math.max(100, Math.min(H * 0.27, H / 2 - 120))

  const rad = deg => deg * Math.PI / 180
  const ovalR = a => (rx * ry) / Math.hypot(ry * Math.cos(a), rx * Math.sin(a))
  const edgeR = a => {
    const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a))
    return Math.min(c > 1e-6 ? (W / 2) / c : Infinity, s > 1e-6 ? (H / 2) / s : Infinity)
  }

  const frag = document.createDocumentFragment()
  const N = accounts.length
  const step = N ? 360 / N : 360
  const geo = { W, H, cx, cy }
  const bottomPad = etched ? 76 : 48        // keep boxes clear of the footer bar
  const segs = []                           // geometry handed to the felt layer

  // ring8 "you at bottom": rotate the shared layout so the middle of my first
  // run of accounts points due south (90° screen). Toggle off = everyone sees
  // the identical board (screen-share / spectator mode).
  let start = boardStartAngle
  if(ring8() && boardSelfBottom){
    const mineIdx = accounts.map((a, i) => isMyAccount(a) ? i : -1).filter(i => i >= 0)
    if(mineIdx.length){
      let runEnd = 0
      while(runEnd < mineIdx.length - 1 && mineIdx[runEnd + 1] === mineIdx[runEnd] + 1) runEnd++
      const center = boardStartAngle + (mineIdx[0] + (runEnd + 1) / 2) * step
      start = boardStartAngle + (90 - center)
    }
  }

  // v9 (review 7): when ≥2 DISCONNECTED clusters coexist, segments outside my
  // cluster fade their wash — makes the split visible before it settles by
  // surprise. Uses the LOCK-PROGRESS1 grouping; unconnected accounts count as
  // outside. Only meaningful under the cluster rule.
  let outsideMyCluster = null
  if(ring9() && (gameMeta?.lockRule || "cluster") === "cluster"){
    const gids = new Set(accounts.map(a => getLockProgress(a.id)?.groupId).filter(Boolean))
    if(gids.size > 1){
      const myG = new Set(accounts.filter(a => isMyAccount(a))
        .map(a => getLockProgress(a.id)?.groupId).filter(Boolean))
      if(myG.size)
        outsideMyCluster = a => !myG.has(getLockProgress(a.id)?.groupId)
    }
  }

  accounts.forEach((account, i) => {

    const a0 = start + i * step, a1 = a0 + step
    const am = rad((a0 + a1) / 2)
    const mine = isMyAccount(account)
    segs.push({ account, a0, a1, am, mine })

    // wash + fat drop target: the whole slice IS the account (own segments
    // accept drops too — acct → acct moves, and drag-home = withdraw)
    const wedge = makeWedge(account, a0, a1, geo, mine)
    if(mine) wedge.classList.add("board-wedge--mine")
    if(ring8() && account.id === boardSelectedAccount)
      wedge.classList.add("board-wedge--selected")   // footer dropdown highlight
    if(outsideMyCluster && !mine && outsideMyCluster(account))
      wedge.classList.add("board-wedge--othercluster")
    boardDropTarget(wedge, account)
    frag.appendChild(wedge)

    const chord = fr => Math.max(0.001, 2 * fr * Math.sin(rad(step / 2)))
    const rOval = ovalR(am), rEdge = edgeR(am)

    // a box's width budget is the TIGHTER of its segment's chord (tangential
    // room) and the annulus depth it sits in (radial room, floored so N/S
    // segments — where radial depth doesn't bound horizontal width — aren't
    // starved). Boxes are also pushed apart radially (inner hub-ward, outer
    // edge-ward) so diagonal segments' boxes don't meet at the oval line.
    const boxW = (radialRoom, tangRoom) =>
      Math.min(Math.max(Math.min(tangRoom, Math.max(radialRoom, 96)), 72), 240)

    // inner box — their basket, inside the oval
    const ri = rc + (rOval - rc) * 0.48
    const innerW = boxW((rOval - rc) * 0.8, chord(Math.max(ri, rOval * 0.55)) * 0.9)
    const inner = document.createElement("div")
    inner.className = "ring-box ring-basket"
    inner.style.maxWidth = innerW + "px"
    inner.style.left = Math.min(Math.max(cx + ri * Math.cos(am), innerW / 2 + 6), W - innerW / 2 - 6) + "px"
    inner.style.top = Math.min(Math.max(cy + ri * Math.sin(am), 40), H - 40) + "px"
    boardBasketChips(account, inner, accountMap)
    boardDropTarget(inner, account)
    frag.appendChild(inner)

    // outer box — available (ghosts in place), outside the oval. v1 carries a
    // label row; etched variants write the id into the felt instead so the
    // chips get the room (and the board reads like a board, not a form)
    const ro = rOval + (rEdge - rOval) * 0.62
    const outerW = boxW((rEdge - rOval) * 0.92, chord(ro) * 0.75)
    const outer = document.createElement("div")
    outer.className = "ring-box ring-avail" + (mine ? " ring-avail--mine" : "")
    outer.style.maxWidth = outerW + "px"
    outer.style.left = Math.min(Math.max(cx + ro * Math.cos(am), outerW / 2 + 6), W - outerW / 2 - 6) + "px"
    outer.style.top = Math.min(Math.max(cy + ro * Math.sin(am), 48), H - bottomPad) + "px"

    if(!etched) outer.appendChild(ringHead(account, mine))
    else if(account.mode === "lock" && boardSkin !== "ring7"){
      // ring7 carries lock state on the etched id + darkened store instead
      const badge = document.createElement("div")
      badge.className = "ring-lockbadge"
      badge.textContent = "🔒"
      outer.appendChild(badge)
    }
    const chips = document.createElement("div")
    chips.className = "board-band"
    boardStoreChips(account, chips)
    boardReservedChips(account, chips, reservedByAccount)
    outer.appendChild(chips)
    boardDropTarget(outer, account)
    frag.appendChild(outer)
  })

  // felt linework: basket oval, segment boundaries, hub ring, etched ids
  frag.appendChild(ringFelt(segs, { W, H, cx, cy, rc, rx, ry, step, edgeR, ovalR, rad, etched }))

  // center pivot — future strike timer / signing hourglass. With lock arcs
  // (ring5/6) the hub rim doubles as the cluster progress ring: the lockbar
  // bent into a circle, orange filling with each required lock.
  const hub = document.createElement("div")
  hub.className = "ring-hub" + (ringArcs() ? " ring-hub--ringed" : "")
  hub.style.left = cx + "px"
  hub.style.top = cy + "px"
  hub.style.width = hub.style.height = rc * 2 + "px"
  const lp = boardLockSummary(accounts.filter(a => isMyAccount(a)), accounts)
  if(ring8()){
    // faint brand K behind the count (KPAY face — Montserrat where loaded,
    // graceful fallback otherwise); the hub doubles as a circular logo.
    // v9: sized to FILL the circle — corners touching the rim (review 7)
    const k = document.createElement("span")
    k.className = "ring-hub-k"
    k.textContent = "K"
    if(ring9()) k.style.fontSize = (rc * 1.9) + "px"
    hub.appendChild(k)
  }
  const hubText = document.createElement("span")
  hubText.textContent = lp ? `${lp.locked}/${lp.total}` : ""
  hub.appendChild(hubText)
  if(ringArcs() && lp) hub.appendChild(hubProgressRing(lp, rc))
  // "accounts" spelled out (user 2026-07-09): locking counts ACCOUNTS —
  // segments are accounts, a multi-account player locks each separately
  hub.title = (gameMeta?.profile?.name || gameMeta?.id || "") +
    (lp ? ` — ${lp.locked} of ${lp.total} accounts locked (${lp.scope})` : "")
  frag.appendChild(hub)

  if(etched) frag.appendChild(ringFooter(accounts.filter(a => isMyAccount(a))))

  root.replaceChildren(frag)

  // ring8: offers from OTHER PLAYERS fly in as they land (one leg of the ▶
  // animation). Player-level guard: your own drops — from ANY of your
  // accounts — don't animate at you; you did the motion. Skipped on the
  // first paint (everything would fly).
  if(ring8()) boardAnimateNewOffers()
}

/* ── Lazy Susan v1 (review 7) ───────────────────────────────────────────────
   The ring UNWRAPPED for the WIDE phase (many players, pre-cluster): other
   accounts are rectangular cards in a horizontal carousel — arrows + native
   swipe/scroll-snap — and my accounts are full-width strips above the footer
   (basket strip over store strip, mirroring the ring's inside/outside).
   Cards mirror that: store on top, basket at the bottom edge facing mine.
   Same chips, same drop semantics (whole card = the account), same footer,
   net + party filters, same offer/withdraw choreography. Swipe-a-player-away
   to dismiss = later feature. Flow: browse + hook up here, then jump to the
   ring (Party only) once a cluster forms — RENDERPATH doc §8. */

function renderSusanBoard(root){

  const accounts = boardFilteredAccounts()
  const accountMap = getAccountMap()
  const reservedByAccount = buildReservedByAccount(accounts)
  const mine = accounts.filter(a => isMyAccount(a))
  const others = accounts.filter(a => !isMyAccount(a))
  const ctx = { reservedByAccount, accountMap }

  const frag = document.createDocumentFragment()
  const wrap = document.createElement("div")
  wrap.className = "susan"

  const carWrap = document.createElement("div")
  carWrap.className = "susan-carousel-wrap"
  const car = document.createElement("div")
  car.className = "susan-carousel"
  const arrow = (txt, dx) => {
    const b = document.createElement("button")
    b.className = "susan-arrow"
    b.textContent = txt
    b.onclick = () => car.scrollBy({ left: dx, behavior: "smooth" })
    return b
  }
  others.forEach(account => car.appendChild(susanCard(account, ctx)))
  if(!others.length){
    const hint = document.createElement("div")
    hint.className = "susan-empty"
    hint.textContent = "No one else on the wheel yet"
    car.appendChild(hint)
  }
  carWrap.appendChild(arrow("‹", -230))
  carWrap.appendChild(car)
  carWrap.appendChild(arrow("›", 230))
  wrap.appendChild(carWrap)

  const mineWrap = document.createElement("div")
  mineWrap.className = "susan-mine"
  mine.forEach(account => mineWrap.appendChild(susanMineRow(account, ctx)))
  wrap.appendChild(mineWrap)

  frag.appendChild(wrap)
  frag.appendChild(ringFooter(mine))
  root.replaceChildren(frag)

  boardAnimateNewOffers()
}

function susanCard(account, ctx){
  const card = document.createElement("div")
  card.className = "susan-card"
    + (account.mode === "lock" ? " susan-card--locked" : "")
    + (account.id === boardSelectedAccount ? " susan-card--selected" : "")
  card.style.borderTopColor = getPlayerColour(account.playerId)
  card.dataset.accountId = account.id

  const head = document.createElement("div")
  head.className = "susan-head"
  head.style.color = getPlayerColour(account.playerId)
  head.textContent = (account.id.split(":")[1] || account.id) + (account.mode === "lock" ? " 🔒" : "")
  card.appendChild(head)
  const xl = window.accountLabelCache?.[account.id.split(":")[1] || account.id]
  if(xl){
    const sub = document.createElement("div")
    sub.className = "susan-xsub"
    sub.textContent = xl
    card.appendChild(sub)
  }

  const store = document.createElement("div")
  store.className = "board-band susan-store"
  store.title = "Their store (available)"
  boardStoreChips(account, store)
  boardReservedChips(account, store, ctx.reservedByAccount)
  card.appendChild(store)

  const basket = document.createElement("div")
  basket.className = "board-band susan-basket"
  basket.title = "Their basket — drop here to offer"
  boardBasketChips(account, basket, ctx.accountMap)
  card.appendChild(basket)

  boardDropTarget(card, account)
  return card
}

function susanMineRow(account, ctx){
  const row = document.createElement("div")
  row.className = "susan-mine-row"
  row.style.borderLeft = "4px solid " + getPlayerColour(account.playerId)
  row.dataset.accountId = account.id

  const head = document.createElement("div")
  head.className = "susan-head"
  head.textContent = (account.id.split(":")[1] || account.id) + " (you)"
    + (account.mode === "lock" ? " 🔒" : "")
  row.appendChild(head)

  const basket = document.createElement("div")
  basket.className = "board-band susan-basket"
  basket.title = "Your basket — offers to you land here"
  boardBasketChips(account, basket, ctx.accountMap)
  row.appendChild(basket)

  const store = document.createElement("div")
  store.className = "board-band susan-store"
  store.title = "Your store"
  boardStoreChips(account, store)
  boardReservedChips(account, store, ctx.reservedByAccount)
  row.appendChild(store)

  boardDropTarget(row, account)
  return row
}

// ── ring8/9 helpers ───────────────────────────────────────────────────────

// shared account pipeline: join-order preserved, party filter + netting
function boardFilteredAccounts(){
  const all = getAccounts()
  let accounts = all

  if(ring8() && boardPartyOnly){
    // rule-aware "Party only" (review 7): show the accounts that are party to
    // MY proposal. cluster → my connected component(s) only; active → all
    // active accounts; all → everyone is required, nothing to hide. Uses the
    // LOCK-PROGRESS1 grouping (getLockProgress) so board and lockbar can
    // never disagree. With no trades yet nothing is party — show everyone.
    const rule = gameMeta?.lockRule || "cluster"
    if(rule !== "all"){
      const myGroups = new Set(
        all.filter(a => isMyAccount(a)).map(a => getLockProgress(a.id)?.groupId).filter(Boolean))
      const partOf = a => {
        const lp = getLockProgress(a.id)
        if(!lp) return false
        return rule === "active" ? true : myGroups.has(lp.groupId)
      }
      const party = all.filter(a => isMyAccount(a) || partOf(a))
      if(party.some(a => !isMyAccount(a))) accounts = party
    }
  } else if(!ring8() && showActiveOnly){
    const vis = new Set(getVisibleAccounts(all).map(a => a.id))
    accounts = all.filter(a => vis.has(a.id))
  }

  // net view (viewer-local): FULL pairwise netting per FT asset — A→B $1 and
  // B→A $3 collapse to a single B→A $2 (review 7; the tx nets exactly like
  // this, so net-on previews the after and removes the strike jolt). NFTs
  // pass through. BOARD-POLISH1: netted-away chips should fade out / fly
  // into their counterpart and "crash" into the difference — needs FLIP
  // diffing, parked.
  if(ring8() && boardNetView)
    accounts = boardNetAccounts(accounts)

  return accounts
}

function boardNetAccounts(accounts){
  const net = new Map()      // "asset|loId|hiId" → signed amount (+ = lo gives hi)
  const nfts = []            // NFT basket lines pass through untouched
  accounts.forEach(acc => {
    (acc.basket || []).forEach(item => {
      const id = String(item.assetId)
      if(id.includes("#") || !item.fromId){ nfts.push({ to: acc.id, item }); return }
      const [lo, hi] = [item.fromId, acc.id].sort()
      const key = id + "|" + lo + "|" + hi
      const sign = item.fromId === lo ? 1 : -1
      net.set(key, (net.get(key) || 0) + sign * (item.amount || 1))
    })
  })
  const baskets = {}
  accounts.forEach(a => baskets[a.id] = [])
  net.forEach((amt, key) => {
    if(!amt) return
    const [assetId, lo, hi] = key.split("|")
    const to = amt > 0 ? hi : lo, from = amt > 0 ? lo : hi
    if(baskets[to]) baskets[to].push({ assetId, amount: Math.abs(amt), fromId: from })
  })
  nfts.forEach(({ to, item }) => baskets[to] && baskets[to].push(item))
  return accounts.map(a => ({ ...a, basket: baskets[a.id] || [] }))
}

// offer/withdraw choreography: diff the raw state between broadcasts.
// New offers fly ghost→basket for everyone EXCEPT the giver's player (they
// did the motion). Withdrawn/rejected offers fly basket→store for EVERYONE
// including the actor (it's a click, not a drag — the return cue helps).
// Rects+markup are snapshotted each paint so removals can replay from the
// previous layout.
let _prevOfferKeys = null
let _prevOfferRects = new Map()
function boardAnimateNewOffers(){
  const keys = new Map()
  Object.values(state?.accounts || {}).forEach(acc => {
    (acc.basket || []).forEach(item => {
      const k = `${acc.id}|${item.fromId}|${item.assetId}`
      keys.set(k, (keys.get(k) || 0) + (item.amount || 1))
    })
  })
  const prev = _prevOfferKeys
  _prevOfferKeys = keys

  const pairEls = k => {
    const [toId, fromId, assetId] = k.split("|")
    const sel = `[data-owner-account="${CSS.escape(fromId)}"]`
      + `[data-asset-id="${CSS.escape(assetId)}"]`
      + `[data-to-account="${CSS.escape(toId)}"]`
    return {
      ghost: document.querySelector(`.asset.reserved${sel}`),
      basket: document.querySelector(`.asset.basket${sel}`)
    }
  }

  if(prev){
    keys.forEach((amt, k) => {
      if((prev.get(k) || 0) >= amt) return
      const fromAccount = state.accounts?.[k.split("|")[1]]
      if(!fromAccount || fromAccount.playerId === currentPlayerId) return
      const { ghost, basket } = pairEls(k)
      if(ghost && basket) boardFlyLeg(ghost, basket, getPlayerColour(fromAccount.playerId), 0)
    })

    prev.forEach((amt, k) => {
      if((keys.get(k) || 0) >= amt) return
      const snap = _prevOfferRects.get(k)
      if(!snap) return
      const [, fromId, assetId] = k.split("|")
      const owner = state.accounts?.[fromId]
      // return target: the owner's store chip it went back into (new DOM);
      // fall back to where the ghost used to be
      const home = document.querySelector(
        `.asset:not(.basket):not(.reserved)[data-owner-account="${CSS.escape(fromId)}"][data-asset-id="${CSS.escape(assetId)}"]`)
      const target = home ? home.getBoundingClientRect() : snap.ghost
      if(snap.basket && target)
        boardFlyRect(snap.html, snap.basket, target, getPlayerColour(owner?.playerId), 0)
    })
  }

  // snapshot for the next diff
  _prevOfferRects = new Map()
  keys.forEach((amt, k) => {
    const { ghost, basket } = pairEls(k)
    if(basket) _prevOfferRects.set(k, {
      basket: basket.getBoundingClientRect(),
      ghost: ghost ? ghost.getBoundingClientRect() : null,
      html: basket.outerHTML
    })
  })
}

// bottom control bar (etched variants) — thumb-reach controls that never
// obscure the board: active-only filter + my lock toggles. Later this bar
// hosts the signing roll-up (wallet pick, sign status) per the 2026-07-09
// review — a footer twin of the signing modal's expanding header.
function ringFooter(mine){

  const bar = document.createElement("div")
  bar.className = "ring-footer"

  const check = (label, checked, onchange, title) => {
    const el = document.createElement("label")
    el.className = "ring-footer-filter"
    if(title) el.title = title
    const cb = document.createElement("input")
    cb.type = "checkbox"
    cb.checked = checked
    cb.onchange = () => onchange(cb.checked)
    el.appendChild(cb)
    el.appendChild(document.createTextNode(" " + label))
    return el
  }

  if(ring8()){
    // "Party only" (was "Active only", review 7): rule-aware — who is party
    // to MY proposal. cluster → my cluster; active → all active; all → n/a.
    bar.appendChild(check("Party only", boardPartyOnly,
      v => { boardPartyOnly = v; render() },
      "Show only accounts party to your proposal (follows the game's lock rule: " + (gameMeta?.lockRule || "cluster") + ")"))
  } else {
    bar.appendChild(check("Active only", showActiveOnly, v => { showActiveOnly = v; render() }))
  }

  if(ring8()){
    bar.appendChild(check("Net", boardNetView,
      v => { boardNetView = v; render() },
      "View baskets fully netted per pair: opposite-direction flows of the same asset collapse to their difference (the transaction nets exactly like this — net-on previews the after and avoids the strike jolt)"))
    bar.appendChild(check("You at bottom", boardSelfBottom,
      v => { boardSelfBottom = v; render() },
      "On: the board rotates so your accounts face you. Off: everyone sees the identical layout (screen-share / spectator)"))

    // account dropdown: pick → Lock/Unlock + 🗑 Delete act on it; ➕ Add last.
    // When all-locked, the Lock slot becomes the SIGN button (same checkpoint,
    // next phase) — see the scene/tx notes at the bottom of this file.
    if(!boardSelectedAccount || !mine.some(a => a.id === boardSelectedAccount))
      boardSelectedAccount = mine[0]?.id || null

    const sel = document.createElement("select")
    sel.className = "ring-footer-accsel"
    mine.forEach(a => {
      const o = document.createElement("option")
      o.value = a.id
      // 🔒 AFTER the id (review 7) — appears/disappears without the id jumping
      o.textContent = (a.id.split(":")[1] || a.id) + (a.mode === "lock" ? " 🔒" : "")
      sel.appendChild(o)
    })
    const add = document.createElement("option")
    add.value = "__add"
    add.textContent = "➕ Add account…"
    sel.appendChild(add)
    if(boardSelectedAccount) sel.value = boardSelectedAccount
    sel.onchange = () => {
      if(sel.value === "__add"){
        sel.value = boardSelectedAccount || ""
        // add-account MODAL lives on game.php (katomia-addaccount.js + markup)
        // — port it to board.php later; prompt is the stopgap composer
        const v = prompt("Add account (e.g. 12345 or 0.0.12345):")
        if(v) addAccounts(v)
        return
      }
      boardSelectedAccount = sel.value
      render()   // re-highlights the selected wedge
    }
    bar.appendChild(sel)

    const selected = () => mine.find(a => a.id === boardSelectedAccount)

    const lockBtn = document.createElement("button")
    const cur = selected()
    lockBtn.className = "ring-footer-lock" + (cur?.mode === "lock" ? " locked" : "")
    lockBtn.textContent = cur?.mode === "lock" ? "🔓 Unlock" : "🔒 Lock"
    lockBtn.disabled = !cur
    lockBtn.onclick = () => { const a = selected(); if(a) boardToggleLock(a) }
    bar.appendChild(lockBtn)

    const delBtn = document.createElement("button")
    delBtn.className = "ring-footer-del"
    delBtn.textContent = "🗑"
    delBtn.title = "Remove the selected account from the game"
    delBtn.disabled = !cur
    delBtn.onclick = () => {
      const a = selected()
      if(a && typeof removeAccount === "function") removeAccount(a.id)  // KAT-AUTOLOAD2-safe path
    }
    bar.appendChild(delBtn)
  } else {
    mine.forEach(account => {
      const b = document.createElement("button")
      b.className = "ring-footer-lock" + (account.mode === "lock" ? " locked" : "")
      b.textContent = (account.mode === "lock" ? "🔒 " : "🔁 ") + (account.id.split(":")[1] || account.id)
      b.title = account.mode === "lock" ? "Locked — tap to unlock" : "Trading — tap to lock"
      b.onclick = () => boardToggleLock(account)
      bar.appendChild(b)
    })
  }

  if(ringArcs() || susan()){
    const play = document.createElement("button")
    play.className = "ring-footer-play"
    play.textContent = "▶"
    play.title = "Preview: animate every standing offer from its ghost to where it landed"
    play.onclick = playTransfers
    bar.appendChild(play)
  }

  if(susan()){
    // no hub on the wheel — cluster progress rides the footer instead
    const lp = boardLockSummary(mine, boardFilteredAccounts())
    if(lp){
      const badge = document.createElement("span")
      badge.className = "ring-footer-lp"
      badge.textContent = `🔒 ${lp.locked}/${lp.total}`
      badge.title = `${lp.locked} of ${lp.total} accounts locked (${lp.scope})`
      bar.appendChild(badge)
    }
  }

  // dev start-angle spinner: frozen skins only — review 7 dropped it for v9+
  // (superseded by You-at-bottom, and a no-op while that toggle is on anyway).
  // Parked juice idea: tween the rotation when You-at-bottom flips — the
  // whole layout hangs off one angle, so it's a single-number animation.
  if(!ring8()){
    const rot = document.createElement("label")
    rot.className = "ring-footer-rot"
    rot.title = "Dev: board start angle (degrees, segments run clockwise from here)"
    rot.appendChild(document.createTextNode("↻"))
    const ri = document.createElement("input")
    ri.type = "number"
    ri.step = 15
    ri.value = boardStartAngle
    ri.onchange = () => { boardStartAngle = Number(ri.value) || 0; render() }
    rot.appendChild(ri)
    bar.appendChild(rot)
  }

  return bar
}

// hub rim as cluster progress: base circle in trading blue, locked fraction
// overlaid in lock orange, starting at 12 o'clock
function hubProgressRing(lp, rc){
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("class", "ring-hubring")
  svg.setAttribute("viewBox", `0 0 ${rc * 2} ${rc * 2}`)
  const mk = cls => {
    const c = document.createElementNS(NS, "circle")
    c.setAttribute("cx", rc); c.setAttribute("cy", rc); c.setAttribute("r", rc - 2)
    c.setAttribute("class", cls)
    c.setAttribute("transform", `rotate(-90 ${rc} ${rc})`)
    svg.appendChild(c)
    return c
  }
  mk("ring-hubring-base")
  const arc = mk("ring-hubring-locked")
  const C = 2 * Math.PI * (rc - 2)
  arc.style.strokeDasharray = `${C * lp.locked / lp.total} ${C}`
  return svg
}

// ▶ preview: replay every standing offer as a chip flying from its ghost to
// where it landed (pure eye-candy over getBoundingClientRect — no state
// change; the signing-modal preview idea transplanted to the board). Each
// flight leaves a TRAILING LINE in the giver's colour that fades slowly
// (review 4 — like the signing-modal animation).
function playTransfers(){
  let i = 0
  document.querySelectorAll(".asset.basket").forEach(basketEl => {
    const { ownerAccount, assetId, toAccount, ownerPlayer } = basketEl.dataset
    if(!ownerAccount || !assetId) return
    const sel = `[data-owner-account="${CSS.escape(ownerAccount)}"]`
      + `[data-asset-id="${CSS.escape(assetId)}"]`
      + `[data-to-account="${CSS.escape(toAccount)}"]`
    const ghost = document.querySelector(`.asset.reserved${sel}`)
    if(!ghost) return
    boardFlyLeg(ghost, basketEl, getPlayerColour(ownerPlayer), i++ * 220)
  })
}

// one leg of the transfer animation: clone flies ghost → basket, trail line
// in the giver's colour draws with it and fades
function boardFlyLeg(ghost, basketEl, colour, delay){
  boardFlyRect(basketEl.outerHTML, ghost.getBoundingClientRect(), basketEl.getBoundingClientRect(), colour, delay)
}

// markup + two rects → flight (also used for withdraw-back, where the source
// chip no longer exists in the new DOM and we replay from a snapshot)
function boardFlyRect(html, a, b, colour, delay){
  if(!html || !a || !b) return
  const tmp = document.createElement("div")
  tmp.innerHTML = html
  const fly = tmp.firstElementChild
  if(!fly) return
  fly.className += " board-fly"
  fly.style.left = a.left + "px"
  fly.style.top = a.top + "px"
  document.body.appendChild(fly)
  setTimeout(() => {
    fly.style.transform = `translate(${b.left - a.left}px, ${b.top - a.top}px)`
    boardTrail(a, b, colour)
  }, (delay || 0) + 30)
  setTimeout(() => fly.remove(), (delay || 0) + 1000)
}

// trailing line: DOTTED in the giver's colour (review 7 — was solid with a
// draw-in; the dash channel now carries the dot pattern), fades out slowly
function boardTrail(a, b, colour){
  let svg = document.querySelector(".board-traillayer")
  if(!svg){
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("class", "board-traillayer")
    document.body.appendChild(svg)
  }
  svg.setAttribute("viewBox", `0 0 ${innerWidth} ${innerHeight}`)
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
  line.setAttribute("x1", a.left + a.width / 2); line.setAttribute("y1", a.top + a.height / 2)
  line.setAttribute("x2", b.left + b.width / 2); line.setAttribute("y2", b.top + b.height / 2)
  line.setAttribute("class", "board-trailline")
  line.style.stroke = colour || "#999"
  svg.appendChild(line)
  requestAnimationFrame(() => {
    setTimeout(() => { line.style.opacity = 0 }, 1000)   // linger, then fade
  })
  setTimeout(() => line.remove(), 3600)
}

// PROP-LOCKSIGN1 commitment flow, shared by the v1 label glyph + footer buttons
async function boardToggleLock(account){
  const locking = account.mode !== "lock"
  let commitment = null
  if(locking && typeof buildLockCommitment === "function")
    commitment = await buildLockCommitment()
  socket.send(JSON.stringify({
    type: "game_toggleLock", gameId, accountId: account.id,
    ...(commitment ? { commitment } : {})
  }))
  window.__lastLockBasisSent = locking ? (commitment?.payload?.basisHash ?? null) : null
}

// ring drop targets wrap the shared setupDropTarget with the two drag-back
// gestures from the 2026-07-09 review (tap fallbacks all still work):
//  · drag your offered item back HOME (its owner's segment) = plain withdraw
//    (core would withdraw + re-offer to self, which reads as a self-basket)
//  · drag an item YOU received back to its giver's segment = reject; dropped
//    anywhere else it just snaps back (re-render restores it — no-op)
function boardDropTarget(el, account){

  setupDropTarget(el, account)
  const coreDrop = el.ondrop

  el.ondrop = e => {

    const rejectFrom = e.dataTransfer.getData("rejectFrom")
    if(rejectFrom){
      e.preventDefault()
      el.classList.remove("drag-over")
      if(account.id === rejectFrom){
        socket.send(JSON.stringify({
          type: "game_reject", gameId,
          accountId: e.dataTransfer.getData("rejectAccount"),
          assetId: e.dataTransfer.getData("assetId")
        }))
        clearSelection()
        render()
      }
      return
    }

    const fromId = e.dataTransfer.getData("fromAccountId")
    const fromBasketTo = e.dataTransfer.getData("fromBasketToAccountId")
    if(fromId && fromBasketTo && account.id === fromId){
      e.preventDefault()
      el.classList.remove("drag-over")
      socket.send(JSON.stringify({
        type: "game_withdraw", gameId,
        fromId, toId: fromBasketTo,
        assetId: e.dataTransfer.getData("assetId")
      }))
      clearSelection()
      render()
      return
    }

    coreDrop(e)
  }
}

// touch has no hover: tapping a chip that has no action of yours flashes the
// dotted pair line instead
function flashTradePair(assetId, fromId, toId){
  highlightTradePair(assetId, fromId, toId, true)
  setTimeout(() => highlightTradePair(assetId, fromId, toId, false), 1600)
}

// account label + lock glyph (mine = clickable toggle; the oval-arc lock
// indicator replaces this in stage 2)
function ringHead(account, mine){

  const head = document.createElement("div")
  head.className = "ring-head"

  const label = document.createElement("span")
  label.className = "ring-head-label"
  label.textContent = (account.id.split(":")[1] || account.id) + (mine ? " (you)" : "")
  label.style.borderBottom = "2px solid " + getPlayerColour(account.playerId)
  head.appendChild(label)

  const glyph = document.createElement("span")
  glyph.className = "ring-lock" + (mine ? " clickable" : "")
  glyph.textContent = account.mode === "lock" ? "🔒" : "🔁"
  glyph.title = account.mode === "lock" ? "Locked" : "Trading"

  if(mine){
    glyph.onclick = e => {
      e.stopPropagation()
      boardToggleLock(account)
    }
  }
  head.appendChild(glyph)
  return head
}

function ringFelt(segs, g){
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("class", "ring-felt")
  svg.setAttribute("viewBox", `0 0 ${g.W} ${g.H}`)

  // ring8 splits the felt in two: this base svg (z below the chip boxes) and
  // a TOP svg (z above them) carrying the locked-store dim + etched labels —
  // so the dim shades the chips but never the account id / 🔒 / xproof label
  const top = ring8() ? document.createElementNS(NS, "svg") : null
  if(top){
    top.setAttribute("class", "ring-felt ring-felt--top")
    top.setAttribute("viewBox", `0 0 ${g.W} ${g.H}`)
  }
  const labelLayer = top || svg
  const dimLayer = top || svg

  const mkLine = (a, r0, r1, cls) => {
    const line = document.createElementNS(NS, "line")
    line.setAttribute("x1", g.cx + r0 * Math.cos(a))
    line.setAttribute("y1", g.cy + r0 * Math.sin(a))
    line.setAttribute("x2", g.cx + r1 * Math.cos(a))
    line.setAttribute("y2", g.cy + r1 * Math.sin(a))
    line.setAttribute("class", cls)
    svg.appendChild(line)
  }

  segs.forEach((seg, i) => {
    const a = g.rad(seg.a0)
    const rE = g.edgeR(a)
    // ring8: a boundary BETWEEN me and another player becomes a solid divider
    // from the basket circle OUT to the screen edge — with the other players'
    // solid arcs it draws ONE continuous line splitting the board into my
    // droppable space (my store + everyone's baskets) vs everyone else's
    // stores. Inside the circle it stays a light boundary (all baskets are
    // droppable — no wall through them).
    const prev = segs[(i + segs.length - 1) % segs.length]
    if(ring8() && segs.length > 1 && (seg.mine !== prev.mine)){
      const rOvalHere = (g.rx * g.ry) / Math.hypot(g.ry * Math.cos(a), g.rx * Math.sin(a))
      mkLine(a, g.rc, rOvalHere, "ring-boundary")
      mkLine(a, rOvalHere, rE, "ring-divider")
    } else {
      mkLine(a, g.rc, rE, "ring-boundary")
    }
  })

  if(ringArcs()){
    // stage 2 arrives: the oval is split into per-account arcs — an account's
    // arc lights lock-orange when THEY lock, and your own arcs are tappable
    // lock toggles (pointer-events on the stroke only). ring6/7 drop the base
    // line entirely: a soft filled shading marks the basket zone instead, and
    // arcs exist only as lock state (yours get a faint dashed affordance).
    // ring6 shades the basket DARKER; ring7 inverts — the basket is a lit
    // SPOTLIGHT and locking darkens that account's STORE zone instead.
    if(ringNoOval()){
      const zone = document.createElementNS(NS, "ellipse")
      zone.setAttribute("cx", g.cx); zone.setAttribute("cy", g.cy)
      zone.setAttribute("rx", g.rx); zone.setAttribute("ry", g.ry)
      zone.setAttribute("class", "ring-basketzone"
        + (boardSkin === "ring7" ? " ring-basketzone--lit" : ""))
      svg.appendChild(zone)
    }
    segs.forEach(seg => {
      const locked = seg.account.mode === "lock"
      // ring7/8: a locked account's store goes dark — offers withdrawn from
      // play, the basket spotlight stays lit. On ring8 the dim lives in the
      // TOP layer so the chips darken too; labels are appended after, staying
      // bright.
      if((boardSkin === "ring7" || ring8()) && locked){
        const dim = document.createElementNS(NS, "path")
        dim.setAttribute("d", ringStoreZonePath(seg, g))
        dim.setAttribute("class", "ring-storedim")
        dimLayer.appendChild(dim)
      }
      // arc visibility matrix — ring8 INVERTS the ownership marking: other
      // players' arcs are solid grey (the divider continues through them);
      // YOUR arc has no line at all — but stays tappable (transparent
      // stroke) and lights orange when you lock
      if(!ring8() && ringNoOval() && !locked && !seg.mine) return
      const arc = document.createElementNS(NS, "path")
      arc.setAttribute("d", ringArcPath(seg, g))
      arc.setAttribute("class", "ring-lockarc"
        + (locked ? " ring-lockarc--locked" : "")
        + (seg.mine ? " ring-lockarc--mine" : "")
        + (ring8() ? (seg.mine ? " ring-lockarc--open" : " ring-lockarc--wall") : ""))
      if(seg.mine){
        arc.onclick = () => boardToggleLock(seg.account)
        const t = document.createElementNS(NS, "title")
        t.textContent = locked ? "Locked — tap your arc to unlock" : "Tap your arc to lock"
        arc.appendChild(t)
      }
      svg.appendChild(arc)
    })
  } else {
    const oval = document.createElementNS(NS, "ellipse")
    oval.setAttribute("cx", g.cx); oval.setAttribute("cy", g.cy)
    oval.setAttribute("rx", g.rx); oval.setAttribute("ry", g.ry)
    // faded + thick in etched variants: reads as felt, and the width is the
    // stage-2 tap-to-lock arc target
    oval.setAttribute("class", "ring-ovalline" + (g.etched ? " ring-ovalline--faded" : ""))
    svg.appendChild(oval)
  }

  if(g.etched) segs.forEach(seg => labelLayer.appendChild(ringEtchLabel(seg, g, NS)))

  if(top){
    const both = document.createDocumentFragment()
    both.appendChild(svg)
    both.appendChild(top)
    return both
  }
  return svg
}

// the ellipse arc across one segment. Segment boundaries are TRUE directions
// from center; ellipse points need the PARAMETRIC angle (t: cos t scaled by
// rx, sin t by ry), so convert first or arcs won't meet the boundary lines.
function ringEllipseParam(g, deg){
  const a = g.rad(deg)
  return Math.atan2(Math.sin(a) / g.ry, Math.cos(a) / g.rx)
}

function ringArcPath(seg, g){
  let t0 = ringEllipseParam(g, seg.a0), t1 = ringEllipseParam(g, seg.a1)
  while(t1 <= t0) t1 += 2 * Math.PI
  const p = t => [g.cx + g.rx * Math.cos(t), g.cy + g.ry * Math.sin(t)]
  const [x0, y0] = p(t0), [x1, y1] = p(t1)
  const large = (t1 - t0) > Math.PI ? 1 : 0
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${g.rx} ${g.ry} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`
}

// the STORE zone of one segment: the annular region between the basket
// ellipse and the screen edge — outer boundary sampled far past the viewport
// (the svg clips), inner edge follows the ellipse back
function ringStoreZonePath(seg, g){
  const R = Math.max(g.W, g.H) * 1.6
  const pts = []
  const steps = 6
  for(let s = 0; s <= steps; s++){
    const a = g.rad(seg.a0 + (seg.a1 - seg.a0) * s / steps)
    pts.push(`${(g.cx + R * Math.cos(a)).toFixed(0)} ${(g.cy + R * Math.sin(a)).toFixed(0)}`)
  }
  let t0 = ringEllipseParam(g, seg.a0), t1 = ringEllipseParam(g, seg.a1)
  while(t1 <= t0) t1 += 2 * Math.PI
  const p = t => `${(g.cx + g.rx * Math.cos(t)).toFixed(1)} ${(g.cy + g.ry * Math.sin(t)).toFixed(1)}`
  const large = (t1 - t0) > Math.PI ? 1 : 0
  return `M ${p(t0)} L ${pts.join(" L ")} L ${p(t1)} A ${g.rx} ${g.ry} 0 ${large} 0 ${p(t0)} Z`
}

// the account id etched into the felt — big, bold, faded, in the owner's
// colour. ring2: written along the segment's most-horizontal boundary line
// (nudged into the segment); ring3: horizontal at the outer zone's centroid.
function ringEtchLabel(seg, g, NS){

  const text = document.createElementNS(NS, "text")
  text.setAttribute("class", "ring-etchlabel")
  text.setAttribute("fill", getPlayerColour(seg.account.playerId))
  // ring7: 🔒 prefix inline (shifts the id — ring8 fixes that with its own
  // anchored node so the account number never moves on lock)
  const lockPrefix = (boardSkin === "ring7" && seg.account.mode === "lock") ? "🔒 " : ""
  text.textContent = lockPrefix + (seg.account.id.split(":")[1] || seg.account.id) + (seg.mine ? " ·you" : "")

  // ring8: etched ids scale with the viewport (~⅔ … ~1.3× of the fixed size)
  const vScale = ring8() ? Math.min(1.3, Math.max(0.67, Math.min(g.W, g.H) / 800)) : 1
  const fs = Math.min(28, Math.max(16, g.step * 0.24)) * vScale
  text.setAttribute("font-size", fs)
  const halfLen = fs * 0.31 * text.textContent.length   // rough glyph budget

  if(boardSkin === "ring3"){
    // nearer the oval than the chip box (box sits at 0.62) so they layer
    // rather than hide each other; x clamped so long ids stay on screen
    const rl = g.ovalR(seg.am) + (g.edgeR(seg.am) - g.ovalR(seg.am)) * 0.30
    const x = Math.min(Math.max(g.cx + rl * Math.cos(seg.am), halfLen + 6), g.W - halfLen - 6)
    text.setAttribute("x", x)
    text.setAttribute("y", g.cy + rl * Math.sin(seg.am))
    text.setAttribute("text-anchor", "middle")
    return text
  }

  // ring2: pick the boundary that lies most east-west, write along it
  const c0 = Math.abs(Math.cos(g.rad(seg.a0))), c1 = Math.abs(Math.cos(g.rad(seg.a1)))
  const abDeg = c0 >= c1 ? seg.a0 : seg.a1
  const ab = g.rad(abDeg)
  // pulled in from the screen edge so the text never clips
  const rt = Math.max(g.ovalR(ab) + halfLen * 0.4,
    Math.min((g.ovalR(ab) + g.edgeR(ab)) / 2, g.edgeR(ab) - halfLen - 10))

  // perpendicular nudge INTO the segment (interior sits at larger angle than
  // a0, smaller than a1), plus keep the glyphs upright
  const inwardSign = abDeg === seg.a0 ? 1 : -1
  const perp = ab + Math.PI / 2

  let rot = ((abDeg % 360) + 360) % 360
  if(rot > 90 && rot < 270) rot -= 180

  // v9 (review 7): pad by glyph metrics — a label BELOW the line needs its
  // ASCENDERS cleared (they reach back up toward the line), one ABOVE only
  // its descenders, so a fixed 18px sat close below and roomy above
  let inward = inwardSign * 18
  if(ring9()){
    const rr = rot * Math.PI / 180
    const below = inwardSign * (Math.cos(perp) * Math.cos(rr + Math.PI / 2)
                              + Math.sin(perp) * Math.sin(rr + Math.PI / 2)) > 0
    inward = inwardSign * (below ? 7 + fs * 0.78 : 7 + fs * 0.25)
  }

  const x = g.cx + rt * Math.cos(ab) + inward * Math.cos(perp)
  const y = g.cy + rt * Math.sin(ab) + inward * Math.sin(perp)

  text.setAttribute("x", x)
  text.setAttribute("y", y)
  text.setAttribute("text-anchor", "middle")

  if(!ring8()){
    text.setAttribute("transform", `rotate(${rot} ${x} ${y})`)
    return text
  }

  // ring8: a <g> carries the rotation; the id text NEVER moves — the 🔒 is
  // its own node anchored to end just before the id (overflow is fine), and
  // an xproof label (accountLabelCache) etches smaller underneath
  const grp = document.createElementNS(NS, "g")
  grp.setAttribute("transform", `rotate(${rot} ${x} ${y})`)
  grp.appendChild(text)

  if(seg.account.mode === "lock"){
    const lock = document.createElementNS(NS, "text")
    lock.setAttribute("class", "ring-etchlabel ring-etchlock")
    lock.setAttribute("x", x - halfLen - 6)
    lock.setAttribute("y", y)
    lock.setAttribute("text-anchor", "end")
    lock.setAttribute("font-size", fs * 0.8)
    lock.textContent = "🔒"
    grp.appendChild(lock)
  }

  const hac = seg.account.id.split(":")[1] || seg.account.id
  const xLabel = window.accountLabelCache?.[hac]
  if(xLabel){
    const sub = document.createElementNS(NS, "text")
    sub.setAttribute("class", "ring-etchlabel ring-etchsub")
    sub.setAttribute("fill", getPlayerColour(seg.account.playerId))
    sub.setAttribute("x", x)
    sub.setAttribute("y", y + fs * 0.78)
    sub.setAttribute("text-anchor", "middle")
    sub.setAttribute("font-size", fs * 0.52)
    sub.textContent = xLabel
    grp.appendChild(sub)
  }

  return grp
}

/* ── layout pieces ──────────────────────────────────────────────────────── */

// Fat pie-slice drop target + low-alpha colour wash, clipped from the board
// center out past the screen edge — dropping anywhere in a player's wedge is
// dropping on that player (direction beats distance on touch).
function makeWedge(account, a0, a1, geo, isMine = false){

  const el = document.createElement("div")
  el.className = "board-wedge"
  el.dataset.accountId = account.id

  const R = Math.max(geo.W, geo.H) * 1.6
  const pts = [[geo.cx, geo.cy]]
  const steps = 6
  for(let s = 0; s <= steps; s++){
    const a = (a0 + (a1 - a0) * s / steps) * Math.PI / 180
    pts.push([geo.cx + R * Math.cos(a), geo.cy + R * Math.sin(a)])
  }
  el.style.clipPath = "polygon(" + pts.map(p => `${p[0].toFixed(0)}px ${p[1].toFixed(0)}px`).join(",") + ")"
  el.style.background = getPlayerColour(account.playerId)

  if(!isMine) setupDropTarget(el, account)
  return el
}

function makeSeatCard(account, midAngle, geo, seatCount, ctx){

  const el = document.createElement("div")
  el.className = "board-seat" + (seatCount > 5 ? " board-seat--slim" : "")
  el.dataset.accountId = account.id
  el.dataset.mode = account.mode

  const rad = midAngle * Math.PI / 180
  const rx = geo.W * 0.35, ry = geo.H * 0.30
  el.style.left = (geo.cx + rx * Math.cos(rad)) + "px"
  el.style.top = (geo.cy + ry * Math.sin(rad)) + "px"
  el.style.borderTopColor = getPlayerColour(account.playerId)

  const head = document.createElement("div")
  head.className = "board-seat-head"
  const player = state.players?.[account.playerId]
  const label = account.id.split(":")[1] || account.id
  head.textContent = (player?.name && player.name !== "anon" ? player.name + " · " : "") + label
  if(account.mode === "lock") head.textContent += " 🔒"
  el.appendChild(head)

  // outer band: what they show as available — reserved stays here as ghosts
  const avail = document.createElement("div")
  avail.className = "board-band board-band-avail"
  boardStoreChips(account, avail)
  boardReservedChips(account, avail, ctx.reservedByAccount)
  el.appendChild(avail)

  if(boardSkin === "table"){
    // inner band: their basket — trays coloured by giver
    const basket = document.createElement("div")
    basket.className = "board-band board-band-basket"
    boardBasketChips(account, basket, ctx.accountMap)
    el.appendChild(basket)
  } else if((account.basket || []).length){
    const badge = document.createElement("div")
    badge.className = "board-seat-badge"
    badge.textContent = "🧺 ×" + account.basket.length
    badge.title = "Their basket — offers made to this player"
    el.appendChild(badge)
  }

  setupDropTarget(el, account)
  return el
}

function makeCenterOval(mine, accounts, geo, ctx){

  const el = document.createElement("div")
  el.className = "board-center"

  const w = Math.min(geo.W * 0.46, 360)
  const h = Math.max(boardSkin === "market" ? geo.H * 0.26 : geo.H * 0.18, 110)
  el.style.width = w + "px"
  el.style.height = h + "px"
  el.style.left = geo.cx + "px"
  el.style.top = geo.cy + "px"

  // lock ring — the lockbar bent around the table rim (SVG ellipse, locked
  // fraction in the lockbar's locked orange over its trading blue)
  const lp = boardLockSummary(mine, accounts)
  if(lp){
    el.appendChild(boardLockRing(lp, w, h))
  }

  const inner = document.createElement("div")
  inner.className = "board-center-inner"

  const title = document.createElement("div")
  title.className = "board-center-title"
  title.textContent = gameMeta?.profile?.name || gameMeta?.id || "katomia"
  inner.appendChild(title)

  const sub = document.createElement("div")
  sub.className = "board-center-sub"
  sub.textContent = (gameMeta?.network || "") + (lp ? ` · 🔒 ${lp.locked}/${lp.total}` : "")
  inner.appendChild(sub)

  if(boardSkin === "market"){
    // ego view: the center IS my basket table — trays land here coloured by giver
    const table = document.createElement("div")
    table.className = "board-band board-center-basket"
    mine.forEach(account => boardBasketChips(account, table, ctx.accountMap))
    if(!table.children.length){
      const hint = document.createElement("div")
      hint.className = "board-center-empty"
      hint.textContent = "Your table is empty — offers to you land here"
      table.appendChild(hint)
    }
    inner.appendChild(table)
  }

  el.appendChild(inner)
  return el
}

function makeDock(mine, ctx){

  const dock = document.createElement("div")
  dock.className = "board-dock"

  if(!mine.length){
    const hint = document.createElement("div")
    hint.className = "board-dock-empty"
    hint.textContent = "Spectating — join from the classic view to get a seat"
    dock.appendChild(hint)
    return dock
  }

  mine.forEach(account => {

    const row = document.createElement("div")
    row.className = "board-dock-row"
    row.dataset.accountId = account.id
    row.dataset.mode = account.mode
    row.style.borderLeft = "4px solid " + getPlayerColour(account.playerId)

    const head = document.createElement("div")
    head.className = "board-dock-head"

    const label = document.createElement("div")
    label.className = "board-dock-label"
    label.textContent = (account.id.split(":")[1] || account.id) + " (you)"
    head.appendChild(label)

    // the real mode toggle + lockbar, reused verbatim
    head.appendChild(createAccountModeEl(account))
    row.appendChild(head)

    const chips = document.createElement("div")
    chips.className = "board-band board-dock-chips"
    boardStoreChips(account, chips)
    boardReservedChips(account, chips, ctx.reservedByAccount)
    if(boardSkin === "table")
      boardBasketChips(account, chips, ctx.accountMap)
    row.appendChild(chips)

    dock.appendChild(row)
  })

  return dock
}

/* ── lock ring ──────────────────────────────────────────────────────────── */

// One shared count for the center: my first account's requirement, else the
// first account that has one (mirrors getLockProgress / LOCK-PROGRESS1).
function boardLockSummary(mine, accounts){
  for(const a of [...mine, ...accounts]){
    const lp = getLockProgress(a.id)
    if(lp) return lp
  }
  return null
}

function boardLockRing(lp, w, h){
  const NS = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(NS, "svg")
  svg.setAttribute("class", "board-lockring")
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`)

  const make = cls => {
    const e = document.createElementNS(NS, "ellipse")
    e.setAttribute("cx", w / 2); e.setAttribute("cy", h / 2)
    e.setAttribute("rx", w / 2 - 3); e.setAttribute("ry", h / 2 - 3)
    e.setAttribute("class", cls)
    svg.appendChild(e)
    return e
  }
  make("board-lockring-base")
  const arc = make("board-lockring-locked")
  // dasharray needs the path length — set once it's in the DOM
  requestAnimationFrame(() => {
    try {
      const len = arc.getTotalLength()
      const frac = Math.max(0, Math.min(1, lp.locked / lp.total))
      arc.style.strokeDasharray = `${len * frac} ${len}`
    } catch {}
  })
  svg.title = `${lp.locked} of ${lp.total} locked (${lp.scope})`
  return svg
}

/* ── chips (compact, but the SAME DOM chips — drag/drop + modal survive) ── */

// Board chips round amounts for game-view legibility (raw precision stays one
// tap away in the asset modal): 1234567.89 → "1.2M", 0.015 → "0.015".
function boardNum(v){
  if(v >= 1e6) return +(v / 1e6).toFixed(1) + "M"
  if(v >= 1e4) return +(v / 1e3).toFixed(1) + "k"
  if(v >= 100) return String(Math.round(v))
  if(v >= 1) return String(+v.toFixed(2))
  return String(+v.toPrecision(2))
}

function boardAssetText(assetId, amount){
  const id = String(assetId)
  const meta = getAssetMeta(assetId)

  if(id.includes("#")){
    // name only — makeAssetEl appends " #serial" itself for the hover tooltip
    return meta?.token_instance_name || meta?.token_class?.name || meta?.token_class?.symbol || id.split("#")[0]
  }

  const isHbar = id.toUpperCase() === "HBAR"
  let sym = isHbar ? "ℏ" : (meta?.token_class?.symbol || meta?.token_class?.name || id)
  if(String(sym).toLowerCase().startsWith("hedera://")) sym = meta?.token_class?.name || id

  const decimals = isHbar ? 8 : Number(meta?.token_class?.decimals || 0)
  if(!decimals)
    return amount > 1 ? `${sym} ×${amount}` : String(sym)

  return `${boardNum(amount / 10 ** decimals)} ${sym}`
}

// etched variants: EVERY chip declares its owner, wherever it sits — no
// cross-referencing. ring2/ring3 tint the chip FACE (kept as a demo of that
// idea); ring4 uses the v1 basket treatment instead — the owner's thick left
// sleeve only, face untouched, because a coloured face collides with NFT
// artwork: the art's colour must never read as ownership.
function ringTint(el, playerId){
  if(!ringEtched() || !playerId) return
  if(ringSleeved()){
    applyOwnerSleeve(el, playerId)
    return
  }
  el.classList.add("chip-owned")
  el.style.background = `color-mix(in srgb, ${getPlayerColour(playerId)} 24%, #fff)`
}

function boardStoreChips(account, container){
  const mine = isMyAccount(account)

  Object.entries(account.assets || {}).forEach(([assetId, amount]) => {
    const el = makeAssetEl({
      text: boardAssetText(assetId, amount),
      assetId,
      ownerAccountId: account.id,
      ownerPlayerId: account.playerId,
      clickable: mine
    })
    applyAssetClasses(el, assetId, amount)
    el.classList.add("board-chip")
    ringTint(el, account.playerId)

    if(mine){
      el.onclick = () => openAssetModal(assetId, account.id, amount)
      el.draggable = true
      el.ondragstart = e => {
        e.dataTransfer.setData("assetId", assetId)
        e.dataTransfer.setData("available", amount || 1)
        e.dataTransfer.setData("fromAccountId", account.id)
        e.dataTransfer.setData("fromBasketToAccountId", "")
      }
    }
    container.appendChild(el)
  })
}

function boardReservedChips(account, container, reservedByAccount){
  const mine = isMyAccount(account)

  ;(reservedByAccount[account.id] || []).forEach(item => {
    const el = makeAssetEl({
      text: boardAssetText(item.assetId, item.amount || 1),
      assetId: item.assetId,
      ownerAccountId: account.id,
      ownerPlayerId: account.playerId,
      reserved: true,
      clickable: mine
    })
    applyAssetClasses(el, item.assetId, item.amount || 1)
    el.classList.add("board-chip", "board-ghost")
    el.title = "Reserved — already offered out"
    ringTint(el, account.playerId)

    // hover shows the dotted line to where it landed (legacy pair rules)
    el.dataset.assetId = item.assetId
    el.dataset.toAccount = item.toAccountId
    el.onmouseenter = () => highlightTradePair(item.assetId, account.id, item.toAccountId, true)
    el.onmouseleave = () => highlightTradePair(item.assetId, account.id, item.toAccountId, false)

    if(mine){
      el.onclick = () => {
        const ok = confirm("Withdraw " + boardAssetText(item.assetId, item.amount || 1) + " from " + item.toAccountId + "?")
        if(!ok) return
        socket.send(JSON.stringify({
          type: "game_withdraw", gameId,
          fromId: account.id, toId: item.toAccountId, assetId: item.assetId
        }))
        clearSelection()
      }
      // drag the ghost home = withdraw; onto another segment = redirect
      // (boardDropTarget routes the home case to a plain withdraw)
      el.draggable = true
      el.ondragstart = e => {
        e.dataTransfer.setData("assetId", item.assetId)
        e.dataTransfer.setData("available", item.amount || 1)
        e.dataTransfer.setData("fromAccountId", account.id)
        e.dataTransfer.setData("fromBasketToAccountId", item.toAccountId)
      }
    } else {
      // not yours: tap = flash where it went (touch has no hover)
      el.onclick = () => flashTradePair(item.assetId, account.id, item.toAccountId)
    }
    container.appendChild(el)
  })
}

function boardBasketChips(account, container, accountMap){

  ;(account.basket || []).forEach(item => {
    const fromAccountId = getFromAccountId(item)
    const fromAccount = fromAccountId ? accountMap[fromAccountId] : null
    const senderIsMine = fromAccount ? isMyAccount(fromAccount) : false
    const receiverIsMine = isMyAccount(account)

    const el = makeAssetEl({
      text: boardAssetText(item.assetId, item.amount || 1),
      assetId: item.assetId,
      ownerAccountId: fromAccountId,
      ownerPlayerId: fromAccount?.playerId || "",
      basket: true,
      clickable: senderIsMine || receiverIsMine
    })
    applyAssetClasses(el, item.assetId, item.amount || 1)
    el.classList.add("board-chip")
    ringTint(el, fromAccount?.playerId)

    // hover shows the dotted line back to the giver's ghost (legacy pair rules)
    el.dataset.assetId = item.assetId
    el.dataset.toAccount = account.id
    if(fromAccountId){
      el.onmouseenter = () => highlightTradePair(item.assetId, fromAccountId, account.id, true)
      el.onmouseleave = () => highlightTradePair(item.assetId, fromAccountId, account.id, false)
    }

    if(senderIsMine){
      el.title = "Your offer — tap to withdraw, drag to redirect"
      el.onclick = () => {
        const ok = confirm("Withdraw " + boardAssetText(item.assetId, item.amount || 1) + " from " + account.id + "?")
        if(!ok) return
        socket.send(JSON.stringify({
          type: "game_withdraw", gameId,
          fromId: fromAccountId, toId: account.id, assetId: item.assetId
        }))
        clearSelection()
      }
      el.draggable = true
      el.ondragstart = e => {
        e.dataTransfer.setData("assetId", item.assetId)
        e.dataTransfer.setData("available", item.amount || 1)
        e.dataTransfer.setData("fromAccountId", fromAccountId)
        e.dataTransfer.setData("fromBasketToAccountId", account.id)
      }
    } else if(receiverIsMine){
      el.title = "Offered to you — tap to return it, or drag it back to its giver"
      el.onclick = () => {
        const ok = confirm("Return " + boardAssetText(item.assetId, item.amount || 1) + " to " + fromAccountId + "?")
        if(!ok) return
        socket.send(JSON.stringify({
          type: "game_reject", gameId,
          accountId: account.id, assetId: item.assetId
        }))
        clearSelection()
      }
      // drag-back-to-giver = reject; any other landing snaps back (re-render)
      if(fromAccountId){
        el.draggable = true
        el.ondragstart = e => {
          e.dataTransfer.setData("assetId", item.assetId)
          e.dataTransfer.setData("rejectFrom", fromAccountId)
          e.dataTransfer.setData("rejectAccount", account.id)
        }
      }
    } else if(fromAccountId){
      // not your trade: tap = flash the pair line (touch has no hover)
      el.onclick = () => flashTradePair(item.assetId, fromAccountId, account.id)
    }
    container.appendChild(el)
  })
}

/* ── demo sandbox (?demo=1) — fixture state, no socket ──────────────────── */
// A playable local fixture: offers/withdraws/locks mutate the fixture through a
// tiny reducer wired to a fake socket, so drag/drop and taps behave like the
// real game. For skin work and screenshots without a backend.

function boardDemoInit(){

  window.assetDisplayCache = {
    "0.0.456": { token_class: { symbol: "USDC", name: "USD Coin", decimals: 6 } },
    "0.0.555": { token_class: { symbol: "GOLD", name: "Gold pass", decimals: 0 } },
    "0.0.789#12": {
      token_class: { symbol: "KAT", name: "Katomia Cats", decimals: 0 },
      token_instance_name: "Kat",
      token_asset_image_URL: boardDemoSvg("😺", "#ffe0b2")
    },
    "0.0.789#31": {
      token_class: { symbol: "KAT", name: "Katomia Cats", decimals: 0 },
      token_instance_name: "Kat",
      token_asset_image_URL: boardDemoSvg("🐯", "#ffccbc")
    }
  }

  gameMeta = {
    id: "DEMO", network: "playnet", lockRule: "cluster",
    visibility: "demo", profile: { name: "Board demo" }
  }

  state = {
    players: {
      p1: { name: "You",  colour: "#7c4dff" },
      p2: { name: "Ada",  colour: "#e91e63" },
      p3: { name: "Bud",  colour: "#00897b" },
      p4: { name: "Cyn",  colour: "#f59f00" }
    },
    accounts: {
      "p1:0.0.1001": {
        id: "p1:0.0.1001", label: "0.0.1001", playerId: "p1", mode: "shop",
        assets: { "HBAR": 1234500000, "0.0.456": 250000000, "0.0.555": 3 },
        basket: [
          { assetId: "HBAR", amount: 500000000, fromId: "p2:0.0.2002" },
          // second drop from the same giver — exercises the Net toggle (5+2=7ℏ)
          { assetId: "HBAR", amount: 200000000, fromId: "p2:0.0.2002" },
          { assetId: "0.0.789#31", amount: 1, fromId: "p3:0.0.3003" }
        ]
      },
      // second account for the same player — on the ring skin this holds its
      // OWN segment (segments = accounts, the 2026-07-09 structural decision)
      "p1:0.0.1111": {
        id: "p1:0.0.1111", label: "0.0.1111", playerId: "p1", mode: "shop",
        assets: { "HBAR": 220000000 },
        basket: []
      },
      "p2:0.0.2002": {
        id: "p2:0.0.2002", label: "0.0.2002", playerId: "p2", mode: "shop",
        assets: { "HBAR": 8100000000, "0.0.456": 12345678 },
        basket: [
          { assetId: "0.0.789#12", amount: 1, fromId: "p1:0.0.1001" }
        ]
      },
      "p3:0.0.3003": {
        id: "p3:0.0.3003", label: "0.0.3003", playerId: "p3", mode: "lock",
        assets: { "0.0.555": 7 },
        basket: [
          { assetId: "0.0.456", amount: 50000000, fromId: "p1:0.0.1001" }
        ]
      },
      "p4:0.0.4004": {
        id: "p4:0.0.4004", label: "0.0.4004", playerId: "p4", mode: "shop",
        assets: { "HBAR": 42000000, "0.0.789#31": 1 },
        basket: []
      }
    }
  }

  // NB fixture semantics match the backend: an asset sitting in a basket has
  // already LEFT its giver's store (so Kat #12 is in p2's basket, not p1's assets)

  currentPlayerId = "p1"
  socket = { readyState: 1, send: m => boardDemoApply(JSON.parse(m)) }

  // fake xproof label so the etched sublabel (ring8) can be previewed
  window.accountLabelCache = { ...(window.accountLabelCache || {}), "0.0.2002": "ada.kpay.id" }

  render()
}

function boardDemoSvg(emoji, bg){
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'>` +
    `<rect width='100%' height='100%' rx='14' fill='${bg}'/>` +
    `<text x='50%' y='54%' dominant-baseline='middle' text-anchor='middle' font-size='52'>${emoji}</text></svg>`
  )
}

function boardDemoApply(msg){

  const acc = id => state.accounts[id]

  if(msg.type === "game_offer"){
    const from = acc(msg.fromId), to = acc(msg.toId)
    if(!from || !to) return
    const have = from.assets[msg.assetId] || 0
    const amount = Math.min(msg.amount || 1, have)
    if(amount <= 0) return
    if(have - amount <= 0) delete from.assets[msg.assetId]
    else from.assets[msg.assetId] = have - amount
    to.basket.push({ assetId: msg.assetId, amount, fromId: msg.fromId })
  }

  if(msg.type === "game_withdraw" || msg.type === "game_reject"){
    const holder = msg.type === "game_reject" ? acc(msg.accountId) : acc(msg.toId)
    if(!holder) return
    const i = holder.basket.findIndex(it =>
      it.assetId === msg.assetId && (msg.type === "game_reject" || it.fromId === msg.fromId))
    if(i < 0) return
    const [item] = holder.basket.splice(i, 1)
    const owner = acc(item.fromId)
    if(owner) owner.assets[item.assetId] = (owner.assets[item.assetId] || 0) + (item.amount || 1)
  }

  if(msg.type === "game_toggleLock"){
    const a = acc(msg.accountId)
    if(a) a.mode = a.mode === "lock" ? "shop" : "lock"
  }

  if(!msg.__seed) render()
}

/* ── SHAPING NOTES: the scene viewmodel (Phase 1.5) ─────────────────────────
   Full discussion: BOARD-UI1-RENDERPATH-20260709.md §3-§5 (workspace tasks).

   Today renderRingBoard() reads proposal state directly (getAccounts,
   buildReservedByAccount). The signing phase paints THE SAME PICTURE from a
   pending TRANSACTION, so the split to make before wireframing it:

     buildSceneFromProposal(state)  ─┐
                                     ├─▶ scene ─▶ renderRingBoard(scene)
     buildSceneFromTx(tx, state)    ─┘

   scene = {
     segments: [{ accountId, playerId, mine, locked,           // arc/wash/dim
                  signStatus?,          // tx phase: null | pending|signed|problem
                  store: [chip], ghosts: [chip], basket: [chip] }],
     hub: { locked, total, scope }     // tx phase: + expiresAt (countdown)
   }
   chip = { assetId, amount, fromAccountId?, fromPlayerId?, handlers-by-phase }

   Phase differences the scene absorbs, so painters never fork:
   - proposal = the BEFORE+AFTER view (store + ghosts + baskets, all mutable);
     tx = the AFTER only (basket legs frozen from tx data; ghosts stay as the
     ghosted "before" — nothing visually leaves the table at strike)
   - NETTING: a tx is inherently netted; the Net toggle above previews that
     during proposal. Net-ON means zero jolt at strike; net-OFF accepts a
     merge jump (or a future merge animation — parked). Likely endgame: net
     always on, toggle demoted to nerd/dev.
   - arcs: locked(orange) → signStatus green/red per account (SIGN-STATUSLANG1
     colours, same language as the signing modal — never diverge)
   - hub: count → countdown (SIGN-COUNTDOWN1 hourglass)
   - footer: the Lock button slot BECOMES the Sign button when all-locked
     (same dropdown picks the signing account); wallet/sign roll-up docks here
   - after execution: success = basket chips animate into their new owners'
     stores, brighter than the (still dimmed) existing store chips — 3 layers:
     old store chips < dim sheet < new arrivals; failure = chips animate back
     to their givers (deal torn down). Both are boardFlyLeg choreography.
──────────────────────────────────────────────────────────────────────────── */

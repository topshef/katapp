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

const BOARD_SKINS = ["ring", "ring2", "ring3", "table", "market"]

// ring2/ring3 = the 2026-07-09 review-pass treatment (board-game feel): account
// ids etched into the felt instead of label rows, ALL chips tinted by owner,
// oval faded+thickened (future tap-to-lock arc), footer control bar. They
// differ only in where the etched id sits: ring2 along the most-horizontal
// segment boundary, ring3 horizontal at the segment centroid. ring stays as
// the v1 for side-by-side comparison until one wins.
const ringEtched = () => boardSkin === "ring2" || boardSkin === "ring3"

let boardSkin = (() => {
  const s = new URLSearchParams(location.search).get("skin")
  return BOARD_SKINS.includes(s) ? s : "ring"
})()

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

  // join order — shared board for all; the active-only filter (footer) reuses
  // the legacy visibility logic but keeps join order (getVisibleAccounts
  // sorts mine-first, which would reseat the shared board)
  const all = getAccounts()
  let accounts = all
  if(showActiveOnly){
    const vis = new Set(getVisibleAccounts(all).map(a => a.id))
    accounts = all.filter(a => vis.has(a.id))
  }
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

  accounts.forEach((account, i) => {

    const a0 = 180 + i * step, a1 = a0 + step
    const am = rad((a0 + a1) / 2)
    const mine = isMyAccount(account)
    segs.push({ account, a0, a1, am, mine })

    // wash + fat drop target: the whole slice IS the account (own segments
    // accept drops too — acct → acct moves, and drag-home = withdraw)
    const wedge = makeWedge(account, a0, a1, geo, mine)
    if(mine) wedge.classList.add("board-wedge--mine")
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
    else if(account.mode === "lock"){
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

  // center pivot — future strike timer / signing hourglass
  const hub = document.createElement("div")
  hub.className = "ring-hub"
  hub.style.left = cx + "px"
  hub.style.top = cy + "px"
  hub.style.width = hub.style.height = rc * 2 + "px"
  const lp = boardLockSummary(accounts.filter(a => isMyAccount(a)), accounts)
  hub.textContent = lp ? `${lp.locked}/${lp.total}` : ""
  hub.title = (gameMeta?.profile?.name || gameMeta?.id || "") +
    (lp ? ` — ${lp.locked} of ${lp.total} locked (${lp.scope})` : "")
  frag.appendChild(hub)

  if(etched) frag.appendChild(ringFooter(accounts.filter(a => isMyAccount(a))))

  root.replaceChildren(frag)
}

// bottom control bar (etched variants) — thumb-reach controls that never
// obscure the board: active-only filter + my lock toggles. Later this bar
// hosts the signing roll-up (wallet pick, sign status) per the 2026-07-09
// review — a footer twin of the signing modal's expanding header.
function ringFooter(mine){

  const bar = document.createElement("div")
  bar.className = "ring-footer"

  const filt = document.createElement("label")
  filt.className = "ring-footer-filter"
  const cb = document.createElement("input")
  cb.type = "checkbox"
  cb.checked = showActiveOnly
  cb.onchange = () => { showActiveOnly = cb.checked; render() }
  filt.appendChild(cb)
  filt.appendChild(document.createTextNode(" Active only"))
  bar.appendChild(filt)

  mine.forEach(account => {
    const b = document.createElement("button")
    b.className = "ring-footer-lock" + (account.mode === "lock" ? " locked" : "")
    b.textContent = (account.mode === "lock" ? "🔒 " : "🔁 ") + (account.id.split(":")[1] || account.id)
    b.title = account.mode === "lock" ? "Locked — tap to unlock" : "Trading — tap to lock"
    b.onclick = () => boardToggleLock(account)
    bar.appendChild(b)
  })

  return bar
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

  segs.forEach(seg => {
    const a = g.rad(seg.a0)
    const rE = g.edgeR(a)
    const line = document.createElementNS(NS, "line")
    line.setAttribute("x1", g.cx + g.rc * Math.cos(a))
    line.setAttribute("y1", g.cy + g.rc * Math.sin(a))
    line.setAttribute("x2", g.cx + rE * Math.cos(a))
    line.setAttribute("y2", g.cy + rE * Math.sin(a))
    line.setAttribute("class", "ring-boundary")
    svg.appendChild(line)
  })

  const oval = document.createElementNS(NS, "ellipse")
  oval.setAttribute("cx", g.cx); oval.setAttribute("cy", g.cy)
  oval.setAttribute("rx", g.rx); oval.setAttribute("ry", g.ry)
  // faded + thick in etched variants: reads as felt, and the width is the
  // stage-2 tap-to-lock arc target
  oval.setAttribute("class", "ring-ovalline" + (g.etched ? " ring-ovalline--faded" : ""))
  svg.appendChild(oval)

  if(g.etched) segs.forEach(seg => svg.appendChild(ringEtchLabel(seg, g, NS)))

  return svg
}

// the account id etched into the felt — big, bold, faded, in the owner's
// colour. ring2: written along the segment's most-horizontal boundary line
// (nudged into the segment); ring3: horizontal at the outer zone's centroid.
function ringEtchLabel(seg, g, NS){

  const text = document.createElementNS(NS, "text")
  text.setAttribute("class", "ring-etchlabel")
  text.setAttribute("fill", getPlayerColour(seg.account.playerId))
  text.textContent = (seg.account.id.split(":")[1] || seg.account.id) + (seg.mine ? " ·you" : "")

  const fs = Math.min(28, Math.max(16, g.step * 0.24))
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
  const inward = (abDeg === seg.a0 ? 1 : -1) * 18
  const perp = ab + Math.PI / 2
  const x = g.cx + rt * Math.cos(ab) + inward * Math.cos(perp)
  const y = g.cy + rt * Math.sin(ab) + inward * Math.sin(perp)

  let rot = ((abDeg % 360) + 360) % 360
  if(rot > 90 && rot < 270) rot -= 180

  text.setAttribute("x", x)
  text.setAttribute("y", y)
  text.setAttribute("text-anchor", "middle")
  text.setAttribute("transform", `rotate(${rot} ${x} ${y})`)
  return text
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

// etched variants: EVERY chip wears its owner's colour, wherever it sits —
// ownership reads directly off the board with no cross-referencing (and the
// oval can fade back). The basket sleeve stays as reinforcement.
function ringTint(el, playerId){
  if(!ringEtched() || !playerId) return
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

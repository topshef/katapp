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

const BOARD_SKINS = ["table", "market"]

let boardSkin = (() => {
  const s = new URLSearchParams(location.search).get("skin")
  return BOARD_SKINS.includes(s) ? s : "table"
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
      el.title = "Offered to you — tap to return it"
      el.onclick = () => {
        const ok = confirm("Return " + boardAssetText(item.assetId, item.amount || 1) + " to " + fromAccountId + "?")
        if(!ok) return
        socket.send(JSON.stringify({
          type: "game_reject", gameId,
          accountId: account.id, assetId: item.assetId
        }))
        clearSelection()
      }
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

// katomia-tickets.js — PROP-TICKETS1: priced offers ("tickets") in proposal circles.
// Design: docs/priced-offers-20260820.html · phases: docs/tickets-phased-plan-20260820.html
//
// EVERYTHING here is DARK unless the URL carries ?tickets=1 (window.KTICKETS).
// Flag off = no body class, no DOM, no listeners, no messages — the board hooks in
// katomia-board.js are all guarded on window.KTICKETS && typeof tkt* === "function".
//
// A ticket IS an order (same record, same verbs — game_orderCreate/orderCancel/orderFill);
// only the felt-facing vocabulary differs. v1 tickets are strict all-or-nothing
// (minFill 1/1, GTC, no expiry) — partial takes are a later phase.

// ── phase 0/5a: flag rail ────────────────────────────────────────────────────
// ?tickets=1 forces ON, ?tickets=0 forces OFF (dev overrides); otherwise the
// nerd-mode "🎟 Allow tickets" setting (localStorage, set via board settings) decides.
window.KTICKETS = (() => {
  const p = new URLSearchParams(location.search).get("tickets")
  if(p === "1") return true
  if(p === "0") return false
  try { return localStorage.getItem("katomiaTickets") === "1" } catch { return false }
})()
if(window.KTICKETS) document.body?.classList.add("feat-tickets")

// ── signing — copied from katomia-render-orders.js:2751-2790, not imported:
// board.php doesn't load render-orders (same copy-not-import precedent as
// formatJoinRule, katomia-render.js:1150). TKT_SIG_FIELDS must stay byte-identical
// to SIG_SPEC_FIELDS there or the spec hash (049f1b69) diverges and every verifier
// rejects the signature.
const TKT_SIG_FIELDS = ["specVersion","gameId","network","clientOrderId","issuedAt","bundleHash","timeInForce","minFill"]

const TKT_SIG_SPEC = (async () => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(TKT_SIG_FIELDS)))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 8)
})()

async function tktHashBundle(bundle){
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(bundle)))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("")
}

async function tktBuildOrder(bundle){
  const { privateKey, publicKeyJwk } = await getOrCreatePlayerKeypair()
  const clientOrderId = crypto.randomUUID(), issuedAt = Date.now(), minFill = { numerator: 1, denominator: 1 }
  const full = { gameId, network: gameMeta?.network ?? null, clientOrderId, issuedAt,
    bundleHash: await tktHashBundle(bundle), timeInForce: "GTC", minFill, specVersion: await TKT_SIG_SPEC }
  const payload = Object.fromEntries(TKT_SIG_FIELDS.map(k => [k, full[k]]))
  const sigRaw = await crypto.subtle.sign("Ed25519", privateKey, new TextEncoder().encode(JSON.stringify(payload)))
  const pubkeyHex = atob(publicKeyJwk.x.replace(/-/g, "+").replace(/_/g, "/"))
    .split("").map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
  const intentSignature = { alg: "Ed25519", spec: payload.specVersion, sig: btoa(String.fromCharCode(...new Uint8Array(sigRaw))), pubkeyHex }
  return { bundle, minFill, timeInForce: "GTC", expiresAt: 0, clientOrderId, issuedAt, matchConditions: null, intentSignature }
}

// ── model helpers ────────────────────────────────────────────────────────────
const tktHac = acc => acc?.hac ?? (String(acc?.id || "").split(":")[1] || acc?.label || acc?.id)

// open tickets whose (first) give-leg sits on this account
function tktOrdersFor(account){
  const orders = state?.players?.[account.playerId]?.orders || {}
  return Object.entries(orders).filter(([, o]) =>
    ((o.bundle || []).find(l => l.amount < 0) || {}).accountId === tktHac(account))
}

// coarse client mirror of the backend's getRemainingRatio: unposted basket rows
// + settled history, each fill counted once (rows share the fill's n/d per leg)
function tktFilledRatio(order, orderId){
  const seen = new Set()
  const add = (key, n, d) => { if(seen.has(key)) return 0; seen.add(key); return n / d }
  let f = 0
  for(const acc of getAccounts()) for(const it of acc.basket || [])
    if(String(it.orderId) === String(orderId) && it.fillId) f += add("b" + it.fillId, it.numerator ?? 1, it.denominator ?? 1)
  for(const s of order.settled || []) f += add("s" + s.fillId, s.numerator ?? 1, s.denominator ?? 1)
  return f
}

// uncommitted stock: store balance minus the give-legs of the account's other open
// tickets (plain offers already left the store at drop; ticket fills debit nothing
// until settlement — the escrow-vs-claim gap, design doc §2). Negative = oversold.
function tktFreeAmount(account, assetId){
  let free = account.assets?.[assetId] || 0
  for(const [oid, o] of tktOrdersFor(account)){
    if(tktFilledRatio(o, oid) >= 1) continue
    for(const l of o.bundle) if(l.amount < 0 && l.asset === assetId) free += l.amount
  }
  return free
}

// display↔raw scaling (feedback 21b2355b, 2026-08-21: HBAR entered as tinybar).
// Mirrors AMOUNT-SCALE1 (katomia-helpers.js getTransferAmount): HBAR = 8 dp,
// NFTs 0, tokens from the metadata cache — and NEVER scale a real token whose
// meta hasn't loaded (returns null → caller asks the user to retry). Playnet
// word-assets (apple…) have no meta and are correctly 0 dp.
function tktDecimals(assetId){
  const id = String(assetId)
  if(id.toUpperCase() === "HBAR") return 8
  if(id.includes("#")) return 0
  const meta = window.assetDisplayCache?.[id]
  if(!meta && /^0\.0\.\d+$/.test(id)) return null   // real token, meta not loaded yet
  return Number(meta?.token_class?.decimals || 0)
}
function tktToRaw(assetId, display){
  const d = tktDecimals(assetId)
  if(d === null) return null
  const raw = Math.round(Number(display) * 10 ** d)
  return Math.abs(Number(display) * 10 ** d - raw) > 1e-6 ? NaN : raw   // finer than the token allows
}
const tktToDisplay = (assetId, raw) => Number(raw) / 10 ** (tktDecimals(assetId) ?? 0)

const tktLegText = legs => legs.map(l =>
  typeof boardAssetText === "function" ? boardAssetText(l.asset, Math.abs(l.amount)) : Math.abs(l.amount) + " " + l.asset).join(" + ")

const tktKnownAssets = () => [...new Set(getAccounts().flatMap(a => Object.keys(a.assets || {})))]

// ── phase A1: the QUIET ticket ───────────────────────────────────────────────
// (build plan tickets-build-plan-20260821.html §8 · design tickets-quiet-levers-20260821.html §2)
//
// v1 drew a ticket as a SEPARATE object on the felt — a second class of chip with
// the whole exchange printed across its face. The user's steer: "the price is not
// primary to the display, the item remains primary… you'd still see the chicken
// and you'd see some visual cue that it's actually got a ticketing on it. Make
// them ticket-ended." So the standalone chip is GONE. The give-leg's own chip
// wears a perforated right edge, and everything else lives in the asset card,
// which already opens on any chip, yours or theirs.
//
// What went away is a new KIND of object, not necessarily a second chip: pricing
// part of a stack still splits $100 into $95 + $5 (phase A2) — but both are money.

// open (not fully filled) tickets whose GIVE side includes this asset on this account
function tktOpenOrdersForAsset(account, assetId){
  return tktOrdersFor(account).filter(([oid, o]) =>
    tktFilledRatio(o, oid) < 1 && o.bundle.some(l => l.amount < 0 && String(l.asset) === String(assetId)))
}

// ── phase A2: the priced stack splits ────────────────────────────────────────
// "$100 where $5 is reserved for a chicken… you'd still see just those two chips."
// Returns the slices a store stack should render as, remainder FIRST (it keeps the
// |s#1 sim ident that the flight-origin and withdraw-glide lookups key on).
//
// Both slices are SOLID. The dashed ghost already means "this has left your store
// and is promised elsewhere" — an escrow. A ticket reserves nothing: the $5 is
// still in the store and still spendable, which is exactly why dragging it out
// needs a guard (phase B3). Drawing it as reserved would make that guard read as
// a surprise instead of a reminder. (User review 2026-08-21, D12.)
function tktStoreSlices(account, assetId, amount, reservedByAccount){
  const open = tktOpenOrdersForAsset(account, assetId)
  if(!open.length) return [{ amount, priced: false }]
  // don't compound two split mechanisms: if part of this stack is already offered
  // out, the rimpile/ghost path owns that split — leave the stack whole and stub it
  if((reservedByAccount?.[account.id] || []).some(r => String(r.assetId) === String(assetId)))
    return [{ amount, priced: true }]
  let priced = 0
  for(const [, o] of open) for(const l of o.bundle)
    if(l.amount < 0 && String(l.asset) === String(assetId)) priced += Math.abs(l.amount)
  priced = Math.min(priced, amount)
  // whole stack spoken for (selling the chicken) — one chip, and it wears the stub
  if(!(priced > 0) || priced >= amount) return [{ amount, priced: true }]
  return [{ amount: amount - priced, priced: false }, { amount: priced, priced: true }]
}

// called per store chip from boardStoreChips (flag-guarded). Adds a class and a
// tooltip; never adds a node, never changes the chip's height — a taller chip
// becomes the tallest in its zone and inflates the counter band, which is the
// regression P5a had to fix (katomia-board.css bandFull note).
function tktMarkStoreChip(el, account, assetId){
  const open = tktOpenOrdersForAsset(account, assetId)
  if(!open.length) return
  el.classList.add("board-ticketed")
  if(open.some(([oid, o]) => tktFilledRatio(o, oid) > 0)) el.classList.add("board-ticketed-inplay")
  el.dataset.tktChip = "1"                    // stable door for the QA harness
  el.dataset.orderId = open[0][0]
  if(open.length > 1) el.dataset.tktCount = open.length
  if(typeof boardTip === "function") boardTip(el, isMyAccount(account)
    ? "Priced — your ticket is on this. Tap to see it."
    : "Priced — tap to see the ticket and take it.")
  tktHoverPeek(el, open)
}

// ── phase A3: the hover peek, and "who could fill this?" ─────────────────────
// Glance = the stub · hover = the legs · tap = the card. The peek is a POPOVER
// anchored to the chip, never a growth of the chip: anything that changes a
// chip's height inflates the counter band (see the mask note in the CSS).
//
// The second half is the more useful one and nearly free: hovering a ticket
// lights every chip on the felt that could fill it, which answers the maker's
// actual question — is there anyone here who can take this? It reuses the
// board's existing "draw a relationship across the felt" idea (highlightTradePair)
// rather than inventing a second visual language.
//
// Hover-capable devices only, same rule as boardTip (BOARD-TIPTOUCH1): on touch
// this would fire on long-press and fight the drag.
function tktHoverPeek(el, open){
  if(typeof boardCanHover === "function" && !boardCanHover()) return
  el.onmouseenter = () => {
    if(window.__boardDragPayload) return   // mid-drag: the drag owns the board
    tktShowPeek(el, open)
    tktLightFillers(open, true)
  }
  el.onmouseleave = () => { tktHidePeek(); tktLightFillers(open, false) }
}

// The board re-renders on every state update, so a hovered chip can be replaced
// out from under the pointer and its mouseleave never fires. One delegated
// listener retires an orphaned peek instead of a per-peek observer.
let tktPeekWired = false
function tktWirePeekReaper(){
  if(tktPeekWired) return
  tktPeekWired = true
  document.addEventListener("mouseover", e => {
    const box = document.getElementById("tktPeek")
    if(!box) return
    const a = box.__anchor
    if(!a || !a.isConnected || !(e.target === a || a.contains(e.target))){ tktHidePeek(); tktLightFillers(box.__open || [], false) }
  }, true)
  document.addEventListener("dragstart", () => tktHidePeek(), true)
}

function tktShowPeek(el, open){
  tktHidePeek()
  tktWirePeekReaper()
  const box = document.createElement("div")
  box.id = "tktPeek"
  box.dataset.testid = "tkt-peek"
  box.__anchor = el
  box.__open = open
  for(const [orderId, order] of open){
    const line = document.createElement("div")
    line.className = "tkt-peek-line"
    const give = document.createElement("b")
    give.textContent = tktLegText(order.bundle.filter(l => l.amount < 0))
    line.appendChild(give)
    line.appendChild(document.createTextNode(" ⇢ "))
    const want = document.createElement("b")
    want.textContent = tktLegText(order.bundle.filter(l => l.amount > 0))
    line.appendChild(want)
    if(tktFilledRatio(order, orderId) > 0){
      const st = document.createElement("span")
      st.className = "tkt-peek-state"
      st.textContent = " · a take is on the table"
      line.appendChild(st)
    }
    box.appendChild(line)
  }
  document.body.appendChild(box)
  // anchor above the chip, nudged back inside the viewport rather than clipped
  const r = el.getBoundingClientRect(), b = box.getBoundingClientRect()
  const left = Math.max(6, Math.min(window.innerWidth - b.width - 6, r.left + r.width / 2 - b.width / 2))
  const top = r.top - b.height - 8 < 6 ? r.bottom + 8 : r.top - b.height - 8
  box.style.left = Math.round(left) + "px"
  box.style.top = Math.round(top) + "px"
}

const tktHidePeek = () => document.getElementById("tktPeek")?.remove()

// light every chip anywhere on the felt that could satisfy a want-leg
function tktLightFillers(open, on){
  const wants = new Set(open.flatMap(([, o]) => o.bundle.filter(l => l.amount > 0).map(l => String(l.asset))))
  document.querySelectorAll(".board-chip[data-asset-id]").forEach(c => {
    if(!wants.has(String(c.dataset.assetId))) return
    c.classList.toggle("board-tkt-wanted", !!on)
  })
}

// ── the ticket section of the asset card ─────────────────────────────────────
// Called from boardAssetDetail. Renders one block per open ticket on this asset:
// the legs, the status, and the maker's or taker's actions.
function tktAssetCardSection({ card, addAction, account, assetId, modal, frozen }){
  const open = tktOpenOrdersForAsset(account, assetId)
  if(!open.length) return
  const mine = isMyAccount(account)

  for(const [orderId, order] of open){
    const filled = tktFilledRatio(order, orderId)
    const box = document.createElement("div")
    box.className = "board-assetdetail-rows subtle tkt-cardsec"
    box.dataset.testid = "tkt-section"
    box.dataset.orderId = orderId

    const head = document.createElement("div")
    head.className = "tkt-cardsec-head"
    head.textContent = "🎟 " + (mine ? "Your ticket" : "Priced ticket")
    box.appendChild(head)
    tktLegRows(box, order)

    const st = document.createElement("div")
    st.className = "tkt-cardsec-state"
    st.textContent = filled > 0
      ? "A take is on the table — locks decide it now."
      : "Open — anyone in the circle can take it."
    box.appendChild(st)
    card.appendChild(box)

    if(frozen) continue   // signing: the card still informs, but nothing can act

    if(mine){
      addAction("kbtn-blue", "⧉ Clone to new ticket", "Start a new ticket from this one", () => {
        modal.remove(); tktBuilder(account, order)
      }, "tkt-clone")
      if(filled === 0)
        addAction("kbtn-red", "✂ Tear up ticket", "Withdraw this price. Nothing already in a basket is touched.", () => {
          if(!confirm("Tear up this ticket? Anything already in baskets is untouched.")) return
          socket.send(JSON.stringify({ type: "game_orderCancel", gameId, orderId }))
          modal.remove()
        }, "tkt-cancel")
      continue
    }

    if(filled > 0) continue   // in play — no second take while a fill is on the table
    tktAddTakeAction({ box, addAction, order, orderId, account, modal })
  }
}

// the taker half — shared so the drag-take gesture (phase B) can reuse the same
// filler resolution and the same warnings without duplicating them.
function tktAddTakeAction({ box, addAction, order, orderId, account, modal }){
  const myAccounts = getAccounts().filter(a => isMyAccount(a))
  if(!myAccounts.length){
    const p = document.createElement("div")
    p.className = "tkt-cardsec-state"
    p.textContent = "Add one of your accounts to the circle first — the take needs somewhere to land."
    box.appendChild(p)
    return
  }
  let filler = myAccounts[0]
  if(myAccounts.length > 1){
    const sel = document.createElement("select")
    sel.className = "tkt-fillersel"
    myAccounts.forEach(a => sel.appendChild(Object.assign(document.createElement("option"),
      { value: a.id, textContent: tktHac(a) })))
    sel.onchange = () => filler = myAccounts.find(a => a.id === sel.value) || myAccounts[0]
    box.appendChild(sel)
  }
  const short = order.bundle.filter(l => l.amount < 0 && tktFreeAmount(account, l.asset) < 0)
  if(short.length){
    const w = document.createElement("div")
    w.className = "tkt-cardsec-state tkt-warn"
    w.textContent = "⚠ Their stall may not cover this ticket — " + [...new Set(short.map(l => l.asset))].join(", ")
      + " is promised on other tickets too. On a real network an oversold deal fails at signing."
    box.appendChild(w)
  }
  addAction("kbtn-blue", "Take it 🎟", "Their gives land in your basket, your side lands in theirs. Nobody locks automatically.", () => {
    tktSendFill(orderId, filler)
    modal?.remove()
  }, "tkt-take")
}

// one place that speaks game_orderFill, so the card and the drag gesture cannot drift
function tktSendFill(orderId, fillerAccount){
  socket.send(JSON.stringify({ type: "game_orderFill", gameId, orderId,
    numerator: 1, denominator: 1, fillerAccountId: tktHac(fillerAccount) }))
}

// ── sheets (shared skeleton mirrors boardAssetDetail's modal) ────────────────
function tktModal(title){
  document.getElementById("tktModal")?.remove()
  const modal = document.createElement("div")
  modal.id = "tktModal"
  modal.className = "asset-modal"
  modal.onclick = e => { if(e.target === modal) modal.remove() }
  const card = document.createElement("div")
  card.className = "asset-modal-card board-assetdetail-card tkt-card"
  modal.appendChild(card)
  const close = document.createElement("div")
  close.className = "asset-modal-close"
  close.textContent = "✕"
  close.onclick = () => modal.remove()
  card.appendChild(close)
  const name = document.createElement("div")
  name.className = "asset-modal-name"
  name.textContent = title
  card.appendChild(name)
  const say = text => {
    const p = document.createElement("div")
    p.className = "subtle tkt-say"
    p.textContent = text
    card.appendChild(p)
  }
  const addAction = (cls, text, fn, testid) => {
    const b = document.createElement("button")
    b.className = "kbtn " + cls + " board-assetdetail-act tkt-act"
    b.textContent = text
    if(testid) b.dataset.testid = testid
    b.onclick = fn
    card.appendChild(b)
    return b
  }
  document.body.appendChild(modal)
  return { modal, card, say, addAction }
}

function tktLegRows(card, order){
  const rows = document.createElement("div")
  rows.className = "board-assetdetail-rows subtle"
  const row = (k, legs) => {
    const r = document.createElement("div")
    const b = document.createElement("b")
    b.textContent = k + ": "
    r.appendChild(b)
    r.appendChild(document.createTextNode(tktLegText(legs)))
    rows.appendChild(r)
  }
  row("Gives", order.bundle.filter(l => l.amount < 0))
  row("Wants", order.bundle.filter(l => l.amount > 0))
  card.appendChild(rows)
  return rows
}

// (phase A1: tktSheet — the standalone ticket modal — retired with the standalone
// ticket chip that was its only caller. Manage and take now live in the asset
// card's ticket section above, which is the "variant of the modal" the steer asked
// for. tktModal/tktLegRows stay: the builder still uses them.)

// ── phase 1: builder ─────────────────────────────────────────────────────────
// Slim two-stack form (give / want) in the join-rule-composer spirit. Amounts are
// RAW integer units (playnet fruit and zero-decimal tokens are 1:1; decimals are a
// later refinement, same as the pro-mode raw bundle in the order modal). All lines
// carry the tapped account — order-mode convention (both legs reference the maker).
function tktBuilder(account, prefill){
  const { modal, card, say, addAction } = tktModal("🎟 New ticket")
  const lines = { give: [], want: [] }
  if(prefill?.bundle) for(const l of prefill.bundle) lines[l.amount < 0 ? "give" : "want"].push({ asset: l.asset, amount: tktToDisplay(l.asset, Math.abs(l.amount)) })
  else if(prefill?.give) lines.give = prefill.give.map(l => ({ asset: l.asset, amount: tktToDisplay(l.asset, l.amount) }))
  if(!lines.give.length) lines.give.push({ asset: "", amount: 1 })
  if(!lines.want.length) lines.want.push({ asset: "", amount: 1 })

  const dl = document.createElement("datalist")
  dl.id = "tktAssetOptions"
  tktKnownAssets().forEach(id => dl.appendChild(Object.assign(document.createElement("option"), { value: id })))
  card.appendChild(dl)

  const secs = document.createElement("div")
  card.appendChild(secs)
  const render = () => {
    secs.innerHTML = ""
    for(const side of ["give", "want"]){
      const lbl = document.createElement("div")
      lbl.className = "tkt-seclbl subtle"
      lbl.textContent = side === "give" ? "You give" : "You want"
      secs.appendChild(lbl)
      lines[side].forEach((l, i) => {
        const r = document.createElement("div")
        r.className = "tkt-line"
        const asset = Object.assign(document.createElement("input"), { value: l.asset, placeholder: "token id (0.0.x, 0.0.x#serial, HBAR) or playnet name" })
        asset.setAttribute("list", "tktAssetOptions")
        asset.oninput = () => l.asset = asset.value.trim()
        const amt = Object.assign(document.createElement("input"), { type: "number", min: "0", step: "any", value: l.amount })
        amt.className = "tkt-amt"
        amt.oninput = () => l.amount = Math.max(0, +amt.value || 0)
        const del = Object.assign(document.createElement("button"), { textContent: "✕", className: "tkt-del" })
        del.onclick = () => { lines[side].splice(i, 1); render() }
        r.append(asset, amt, del)
        secs.appendChild(r)
      })
      const add = Object.assign(document.createElement("button"), { textContent: "＋ add asset", className: "tkt-addline addacct-link" })
      add.onclick = () => { lines[side].push({ asset: "", amount: 1 }); render() }
      secs.appendChild(add)
    }
  }
  render()
  say("Anyone in the circle can take this ticket — all-or-nothing. You can tear it up any time before it's taken.")

  addAction("kbtn-blue", "Create ticket 🎟", async () => {
    const give = lines.give.filter(l => l.asset), want = lines.want.filter(l => l.asset)
    if(!give.length || !want.length) return alert("A ticket needs at least one asset on each side")
    // display -> raw units per leg (feedback 21b2355b): meta race and
    // finer-than-decimals inputs abort with a plain reason, never mis-scale
    for(const l of [...give, ...want]){
      l.raw = tktToRaw(l.asset, l.amount)
      if(l.raw === null) return alert("Still loading " + l.asset + "'s details (decimals) — try again in a second")
      if(Number.isNaN(l.raw)) return alert(l.amount + " is finer than " + l.asset + " allows (" + tktDecimals(l.asset) + " decimal places)")
      if(l.raw < 1) return alert("Amount for " + l.asset + " is too small")
    }
    const over = [...new Set(give.filter(l => l.raw > tktFreeAmount(account, l.asset)).map(l => l.asset))]
    if(over.length && !confirm("Your stall may not cover this ticket: " + over.join(", ")
      + " is already promised on other tickets (or short in your store). Tickets don't reserve stock — an oversold deal fails at signing on a real network.\n\nCreate anyway?")) return
    const hac = tktHac(account)
    const bundle = [...give.map(l => ({ accountId: hac, asset: l.asset, amount: -l.raw })),
                    ...want.map(l => ({ accountId: hac, asset: l.asset, amount: l.raw }))]
    const orderType = bundle.length === 2 ? (bundle.some(l => String(l.asset).includes("#")) ? "simple-nft" : "simple-ft") : "exotic"
    const order = await tktBuildOrder(bundle)
    socket.send(JSON.stringify({ type: "game_orderCreate", gameId, order: { ...order, orderType } }))
    modal.remove()
  }, "tkt-create")
}

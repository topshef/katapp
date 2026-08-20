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
// to SIG_SPEC_FIELDS there or the spec hash (049f1b69) diverges and the backend/KEA
// reject the signature.
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

const tktLegText = legs => legs.map(l =>
  typeof boardAssetText === "function" ? boardAssetText(l.asset, Math.abs(l.amount)) : Math.abs(l.amount) + " " + l.asset).join(" + ")

const tktKnownAssets = () => [...new Set(getAccounts().flatMap(a => Object.keys(a.assets || {})))]

// ── phase 2: felt render (called from boardStoreChips under flag guard) ──────
function tktRenderStoreTickets(account, container){
  for(const [orderId, o] of tktOrdersFor(account)){
    const f = tktFilledRatio(o, orderId)
    if(f >= 1) continue   // fully taken/settled — nothing left on the stall
    const gives = o.bundle.filter(l => l.amount < 0), wants = o.bundle.filter(l => l.amount > 0)
    const el = document.createElement("div")
    el.className = "asset board-chip board-ticket" + (f > 0 ? " board-ticket-inplay" : "")
    el.dataset.testid = "tkt-chip"
    el.dataset.orderId = orderId
    el.textContent = "🎟 " + tktLegText(gives) + " ⇢ " + tktLegText(wants)
    if(typeof boardTip === "function") boardTip(el, f > 0 ? "Ticket — a take is on the table"
      : isMyAccount(account) ? "Your priced ticket — tap to manage" : "Priced ticket — tap to take")
    el.onclick = e => { e.stopPropagation(); tktSheet(orderId, o, account, f) }
    container.appendChild(el)
  }
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

// ── phase 2 (manage) + phase 3 (take) ────────────────────────────────────────
function tktSheet(orderId, order, account, filled){
  const mine = isMyAccount(account)
  const { modal, card, say, addAction } = tktModal(mine ? "🎟 Your ticket" : "🎟 Ticket")
  tktLegRows(card, order)
  say(filled > 0 ? "Status: a take is on the table — locks decide it now." : "Status: open — anyone in the circle can take it.")

  if(mine){
    addAction("kbtn-blue", "⧉ Clone to new ticket", () => { modal.remove(); tktBuilder(account, order) }, "tkt-clone")
    if(filled === 0) addAction("kbtn-red", "✂ Tear up ticket", () => {
      if(!confirm("Tear up this ticket? Anything already in baskets is untouched.")) return
      socket.send(JSON.stringify({ type: "game_orderCancel", gameId, orderId }))
      modal.remove()
    }, "tkt-cancel")
    else say("Recall the fill from the basket first if you want to tear it up.")
    return
  }

  // taker view — v1 tickets are all-or-nothing, so the take is always 1/1
  const myAccounts = getAccounts().filter(a => isMyAccount(a))
  if(!myAccounts.length){ say("Add one of your accounts to the circle first — the take needs somewhere to land."); return }
  if(filled > 0) return   // in play — no second take while a fill is on the table
  let filler = myAccounts[0]
  if(myAccounts.length > 1){
    const sel = document.createElement("select")
    sel.className = "tkt-fillersel"
    myAccounts.forEach(a => sel.appendChild(Object.assign(document.createElement("option"), { value: a.id, textContent: tktHac(a) })))
    sel.onchange = () => filler = myAccounts.find(a => a.id === sel.value) || myAccounts[0]
    card.appendChild(sel)
  }
  say("Taking swaps the whole ticket: their gives land in your basket, your side lands in theirs. Nobody locks automatically.")
  const short = order.bundle.filter(l => l.amount < 0 && tktFreeAmount(account, l.asset) < 0)
  if(short.length) say("⚠ Their stall may not cover this ticket — " + [...new Set(short.map(l => l.asset))].join(", ")
    + " is promised on other tickets too. On a real network an oversold deal fails at signing.")
  addAction("kbtn-blue", "Take it 🎟", () => {
    socket.send(JSON.stringify({ type: "game_orderFill", gameId, orderId,
      numerator: 1, denominator: 1, fillerAccountId: tktHac(filler) }))
    modal.remove()
  }, "tkt-take")
}

// ── phase 1: builder ─────────────────────────────────────────────────────────
// Slim two-stack form (give / want) in the join-rule-composer spirit. Amounts are
// RAW integer units (playnet fruit and zero-decimal tokens are 1:1; decimals are a
// later refinement, same as the pro-mode raw bundle in the order modal). All lines
// carry the tapped account — order-mode convention (both legs reference the maker).
function tktBuilder(account, prefill){
  const { modal, card, say, addAction } = tktModal("🎟 New ticket")
  const lines = { give: [], want: [] }
  if(prefill?.bundle) for(const l of prefill.bundle) lines[l.amount < 0 ? "give" : "want"].push({ asset: l.asset, amount: Math.abs(l.amount) })
  else if(prefill?.give) lines.give = prefill.give.map(l => ({ asset: l.asset, amount: l.amount }))
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
        const amt = Object.assign(document.createElement("input"), { type: "number", min: "1", step: "1", value: l.amount })
        amt.className = "tkt-amt"
        amt.oninput = () => l.amount = Math.max(1, Math.floor(+amt.value || 1))
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
    const over = [...new Set(give.filter(l => l.amount > tktFreeAmount(account, l.asset)).map(l => l.asset))]
    if(over.length && !confirm("Your stall may not cover this ticket: " + over.join(", ")
      + " is already promised on other tickets (or short in your store). Tickets don't reserve stock — an oversold deal fails at signing on a real network.\n\nCreate anyway?")) return
    const hac = tktHac(account)
    const bundle = [...give.map(l => ({ accountId: hac, asset: l.asset, amount: -l.amount })),
                    ...want.map(l => ({ accountId: hac, asset: l.asset, amount: l.amount }))]
    const orderType = bundle.length === 2 ? (bundle.some(l => String(l.asset).includes("#")) ? "simple-nft" : "simple-ft") : "exotic"
    const order = await tktBuildOrder(bundle)
    socket.send(JSON.stringify({ type: "game_orderCreate", gameId, order: { ...order, orderType } }))
    modal.remove()
  }, "tkt-create")
}

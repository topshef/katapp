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

// ── phase D: the dial ────────────────────────────────────────────────────────
// Negotiable · Firm · Instant — one maker-set control, not a matrix of booleans,
// and the whole sliding scale from proposal to order lives on it.
//
// Firm is the default because a ticket exists for ASYNCHRONY: one that needs the
// maker to come back and lock is an appointment, not a ticket. Instant is nerd
// mode only, permanently (D8) — it is the position that most turns a circle into
// a shop.
//
// NOT IN THE SIGNED PAYLOAD YET, and that is an interlock rather than an
// oversight: the dial changes WHEN VALUE MOVES, so it is execution semantics and
// belongs inside the signature (a new SIG_SPECS id, phase I, riding
// SOURCE-UNIFY1). Until then anything other than Negotiable is refused off
// playnet — disabled here with the reason on it, and refused again by the
// backend so the guarantee does not depend on this file.
const TKT_DIAL = [
  { v: "none",  label: "Negotiable", blurb: "A take lays both sides out. Nobody locks — haggle from there." },
  { v: "maker", label: "Firm",       blurb: "Your side locks when someone takes it. They still review and lock." },
  { v: "both",  label: "Instant",    blurb: "Both sides lock and it settles straight away. A vending machine." },
]
const TKT_DIAL_DEFAULT = "maker"

const tktIsPlaynet = () => (gameMeta?.network || "playnet") === "playnet"
// Instant can only be instant where a connected pair may settle on its own.
// Under "active"/"all" the circle waits for people who are not in this trade, so
// the position would be a promise the circle cannot keep — disabled, and said,
// rather than silently downgraded.
const tktLockRule = () => gameMeta?.lockRule || "cluster"
function tktDialAvailable(v){
  if(v === "none") return { ok: true }
  if(!tktIsPlaynet()) return { ok: false, why: "playnet only until the dial is inside the signed payload (SOURCE-UNIFY1)" }
  if(v === "both" && tktLockRule() !== "cluster")
    return { ok: false, why: "this circle settles only when everyone agrees, so a take can't settle on its own" }
  return { ok: true }
}
const tktDialOf = order => String(order?.autoLock || "none")
function tktTakeLabel(order){
  const d = tktDialOf(order)
  if(d === "both")  return "Buy now — settles instantly 🎟"
  if(d === "maker") return "Take at this price 🎟"
  return "Take it — you'll both haggle 🎟"
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

// ── the unsourced ticket ─────────────────────────────────────────────────────
// A ticket whose give-leg has no store behind it any more — because it was
// offered out (B3), spent, or priced without ever holding it. Without this the
// ticket would simply VANISH from the felt: no store amount means no chip, and
// the stub rides a chip. An invisible promise is the worst outcome of all, so it
// gets a chip of its own, drawn in the red "this leg needs filling" vocabulary.
// Appended after the store chips, so it reads as an extra rather than a holding.
function tktUnsourcedChips(account, container){
  const held = account.assets || {}
  const seen = new Set()
  for(const [orderId, o] of tktOrdersFor(account)){
    if(tktFilledRatio(o, orderId) >= 1) continue
    for(const l of o.bundle){
      if(l.amount >= 0) continue
      const id = String(l.asset)
      if((held[id] || 0) > 0) continue     // still backed — the store chip wears the stub
      if(seen.has(id)) continue
      seen.add(id)
      const el = makeAssetEl({
        text: typeof boardAssetText === "function" ? boardAssetText(id, Math.abs(l.amount)) : id,
        assetId: id, ownerAccountId: account.id, ownerPlayerId: account.playerId,
        clickable: isMyAccount(account)
      })
      el.classList.add("board-chip", "board-ticketed", "board-tkt-unsourced")
      el.dataset.tktChip = "1"
      el.dataset.orderId = orderId
      el.dataset.tktUnsourced = "1"
      if(typeof ringTint === "function") ringTint(el, account.playerId)
      if(typeof boardTip === "function") boardTip(el, isMyAccount(account)
        ? "Unsourced — this ticket promises something your store no longer holds"
        : "Unsourced — their store no longer holds what this ticket promises")
      el.onclick = () => boardAssetDetail(id, account, 0)
      container.appendChild(el)
    }
  }
}

// ── phase B2: wanted slots, revealed only while you are dragging ─────────────
// The design pass had these as permanent red ghosts in the maker's basket zone,
// which doubles a ticket's footprint — the exact thing phase A is undoing. So
// they appear at the one moment they are useful: pick up a carrot and every
// ticket in the circle that wants a carrot lights up as a drop target.
//
// The slot IS the maker's own priced chip, not a new element. That matters for
// more than tidiness: chips in the organic layout are positioned by the physics
// sim, and injecting a node mid-drag would land it unplaced. It also makes the
// gesture legible — you drop your carrot ONTO the apple that is priced for
// carrots. Dropping anywhere else in the same segment stays an ordinary offer,
// which is what keeps "give it to them" and "sell it to them" apart.
function tktShowSlots(assetId, fromAccountId){
  tktHidePeek()
  const map = getAccountMap ? getAccountMap() : {}
  document.querySelectorAll(".board-chip.board-ticketed[data-order-id]").forEach(chip => {
    const acc = map[chip.dataset.ownerAccount]
    if(!acc || isMyAccount(acc)) return               // your own ticket can't want your own drop
    const order = state?.players?.[acc.playerId]?.orders?.[chip.dataset.orderId]
    if(!order) return
    if(!order.bundle.some(l => l.amount > 0 && String(l.asset) === String(assetId))) return
    chip.classList.add("board-tkt-slot")
    chip.dataset.tktSlotFrom = fromAccountId
    chip.dataset.tktSlotAsset = assetId
  })
}

function tktHideSlots(){
  document.querySelectorAll(".board-tkt-slot").forEach(c => {
    c.classList.remove("board-tkt-slot")
    delete c.dataset.tktSlotFrom
    delete c.dataset.tktSlotAsset
  })
}

// called from the wedge's ondrop BEFORE the segment re-route. Returns true if the
// drop landed on a wanted slot and was handled as a take.
function tktSlotDrop(e){
  const slot = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".board-tkt-slot")
  if(!slot) return false
  const from = getAccountMap()[slot.dataset.tktSlotFrom]
  tktHideSlots()
  if(!from || !isMyAccount(from)) return false
  tktSendFill(slot.dataset.orderId, from)
  if(typeof clearSelection === "function") clearSelection()
  if(typeof render === "function") render()
  return true
}

// ── phase B3: offering out something you have already priced ─────────────────
// A plain offer DEBITS the store; a ticket debits nothing. So dropping your
// priced chicken into someone's basket doesn't just double-promise it — it
// leaves the store, and the ticket is then backed by nothing. Name that outcome
// rather than discovering it at signing.
//
// The complication: there is a drop modal, but not always. boardAskAmount
// returns immediately without prompting when available <= 1 — NFTs and single
// units, which is exactly the chicken. So this asks in its own right, before the
// amount step, and is suppressible for anyone who finds it noisy.
async function tktConfirmOfferOut(fromAccountId, assetId){
  const acc = getAccountMap()[fromAccountId]
  if(!acc || !isMyAccount(acc)) return true
  const open = tktOpenOrdersForAsset(acc, assetId)
  if(!open.length) return true
  try { if(localStorage.getItem("katomiaTicketsQuietDragWarn") === "1") return true } catch {}
  const label = typeof boardAssetText === "function" ? boardAssetText(assetId, 1) : assetId
  return confirm(
    `You have priced ${label} on a ticket.\n\n`
    + `Offering it here hands it over now — a ticket reserves nothing, so the ticket stays open `
    + `and becomes UNSOURCED: you would owe something you no longer hold.\n\n`
    + `OK to offer it anyway (the ticket turns red), or Cancel and tear up the ticket first.`)
}

// ── the ticket section of the asset card ─────────────────────────────────────
// Called from boardAssetDetail. Renders one block per open ticket on this asset:
// the legs, the status, and the maker's or taker's actions.
function tktAssetCardSection({ card, addAction, account, assetId, modal, frozen }){
  const open = tktOpenOrdersForAsset(account, assetId)
  if(!open.length) return
  // PROP-TICKETS1 phase C1 (user review 2026-08-21). "mine" is per PLAYER, which
  // is why a ticket on your account A read as yours from account B and the take
  // branch never rendered. Two accounts under one player does not mean one entity
  // owns both — they may be representing one of them — and even when it is you,
  // taking your own ticket is the cheapest possible demo of the whole loop.
  // So the two halves are decided separately: your player MADE it (manage), and
  // you hold some OTHER account that could fill it (take). Both can be true.
  const mine = isMyAccount(account)
  const fillers = getAccounts().filter(a => isMyAccount(a) && a.id !== account.id)

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
    }

    if(filled > 0) continue   // in play — no second take while a fill is on the table
    if(mine && !fillers.length) continue   // only the maker's own account is here
    tktAddTakeAction({ box, addAction, order, orderId, account, modal, fillers, mine })
  }
}

// the taker half — shared so the drag-take gesture (phase B) can reuse the same
// filler resolution and the same warnings without duplicating them.
function tktAddTakeAction({ box, addAction, order, orderId, account, modal, fillers, mine }){
  // never offer the maker's own account as the filler: the backend skips a leg
  // whose giver and receiver are the same account, so it would be a silent no-op
  const myAccounts = fillers || getAccounts().filter(a => isMyAccount(a) && a.id !== account.id)
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
  if(mine){
    const p = document.createElement("div")
    p.className = "tkt-cardsec-state"
    p.textContent = "This is your own ticket — taking it with another of your accounts trades between them. "
      + "Useful for trying a ticket out; it is a real trade, not a rehearsal."
    box.appendChild(p)
  }
  // THE DIAL'S REAL UI IS THIS LABEL. The maker decided; the taker consents by
  // taking; so the button has to say what taking will do.
  const dial = tktDialOf(order)
  const say2 = txt => { const p = document.createElement("div"); p.className = "tkt-cardsec-state"; p.textContent = txt; box.appendChild(p) }
  if(dial === "both") say2("This ticket settles the moment you take it — no locking step.")
  else if(dial === "maker") say2("The maker's side is already committed. You take it, review, and lock.")
  addAction("kbtn-blue", mine ? "Take it with another account 🎟" : tktTakeLabel(order),
    dial === "both" ? "Taking this settles immediately."
      : dial === "maker" ? "The maker has pre-committed; you still lock."
      : "Their gives land in your basket, your side lands in theirs. Nobody locks automatically.", () => {
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

  // ── the dial, nerd mode only ───────────────────────────────────────────────
  // Normal mode never sees this: it gets Firm and no control at all (§6 of the
  // design). document.body.nerd is the same gate every other lab knob uses.
  let autoLock = TKT_DIAL_DEFAULT
  if(document.body.classList.contains("nerd")){
    const lbl = document.createElement("div")
    lbl.className = "tkt-seclbl subtle"
    lbl.textContent = "When someone takes it"
    card.appendChild(lbl)
    const dial = document.createElement("div")
    dial.className = "tkt-dial"
    dial.dataset.testid = "tkt-dial"
    const blurb = document.createElement("div")
    blurb.className = "tkt-cardsec-state"
    const paint = () => {
      dial.innerHTML = ""
      for(const opt of TKT_DIAL){
        const avail = tktDialAvailable(opt.v)
        const b = document.createElement("button")
        b.className = "tkt-dial-opt" + (autoLock === opt.v ? " on" : "") + (avail.ok ? "" : " off")
        b.textContent = opt.label
        b.dataset.dial = opt.v
        if(!avail.ok){ b.disabled = true; b.title = avail.why }
        b.onclick = () => { if(!avail.ok) return; autoLock = opt.v; paint() }
        dial.appendChild(b)
      }
      const cur = TKT_DIAL.find(o => o.v === autoLock)
      const bad = tktDialAvailable(autoLock)
      blurb.textContent = cur ? cur.blurb : ""
      if(!bad.ok) blurb.textContent += "  ⚠ " + bad.why
    }
    // never open on a position this circle cannot honour
    if(!tktDialAvailable(autoLock).ok) autoLock = "none"
    paint()
    card.appendChild(dial)
    card.appendChild(blurb)
  } else if(!tktDialAvailable(TKT_DIAL_DEFAULT).ok){
    autoLock = "none"
  }

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
    // last word on the interlock: never post a dial this circle/network cannot
    // honour, whatever the form happened to be showing
    const dialOut = tktDialAvailable(autoLock).ok ? autoLock : "none"
    socket.send(JSON.stringify({ type: "game_orderCreate", gameId, order: { ...order, orderType, autoLock: dialOut } }))
    modal.remove()
  }, "tkt-create")
}

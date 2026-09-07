// katomia-carousel.js — CAROUSEL1 (operator, 2026-09-06): the board unwrapped into two
// stripes with the baskets meeting in the middle.
//
//   "Instead of the circle view for proposals, a carousel view where we divide the screen
//    top and bottom — other players on top, my accounts at the bottom — and you can scroll
//    amongst them left and right. The basket area is in the middle as it is now, except
//    it's a stripe along the middle of the screen, because the two stripes meet there. You'd
//    still drag and drop from one to another. There's no centre of the screen, there's a
//    centre LINE — maybe a centre piece, an oblong strip, so the signing countdown can still
//    happen in the middle and keep visual continuity with the circle. Both rows scroll; the
//    other players could even be a conveyor belt. Same language, same actions as the circle
//    — we're only changing the shape of the board. The priority is that nothing we put in
//    breaks what we've got."
//
// So this is a SEPARATE renderer for a SEPARATE skin ("carousel", ?skin=carousel, 🎠 in the
// nerd-only Board skin dropdown). It is chosen in renderBoard() before the ring and the old
// Lazy Susan skins, and it touches none of their code. What it shares is exactly the machinery
// that carries the game's meaning, all of it skin-agnostic and all of it already exercised by
// the Lazy Susan for months:
//
//   boardFilteredAccounts / boardReserved / getAccountMap   which accounts, what is reserved
//   boardStoreChips / boardReservedChips / boardBasketChips  the SAME chips (tall shape, colours,
//                                                             owner etching, data-* the offer
//                                                             animation keys on)
//   boardDropTarget                                          offer / withdraw / pick semantics —
//                                                             the whole card is the account
//   ringFooter                                               lock, account select, ▶, 🔒 x/y
//   boardStartCountdown / boardOpenSigning                   the signing countdown pill and the
//                                                             tap-to-sign, verbatim from the hub
//   boardAnimateNewOffers                                    ghost→basket flight, DOM-keyed
//
// What it deliberately does NOT do (parity items, listed so nobody hunts for them):
//   TODO(CAROUSEL1-parity) chat bubbles: the ring anchors them on segment geometry
//     (_boardChatAnchors); here it is left empty, so bubbles are skipped and the docked
//     strip carries messages. A card-anchored bubble is the obvious follow-up.
//   TODO(CAROUSEL1-parity) focus spotlight (▶ in the footer): the ring dims the felt and
//     flies chips to baskets; here ▶ plays the offer animation only.
//   TODO(CAROUSEL1-parity) the organic chip physics, zone walls, counter shade, lock arcs:
//     ring geometry, no equivalent in a flow layout — cards are the walls.
//   TODO(CAROUSEL1-refactor) the Lazy Susan's susanCard/susanMineRow and this file's card
//     builder are two takes on "an account as a card with two bands". Once this skin has been
//     kicked around, fold them into one builder with a {basketFirst} switch and retire the
//     older susan* skins. Not done now, on purpose: a shared builder would mean editing the
//     susan path, and the brief is to add without breaking.
//
// Loaded AFTER katomia-board.js (classic script, same global lexical scope), so it sees the
// board's top-level state and helpers by name.

// ── conveyor (the "other players drift past" mode) ────────────────────────────────────────
// ?conveyor=1 starts it; the ⟳ button on the top row toggles it. Pauses while a finger or the
// pointer is on the track (you cannot drop onto a moving target), resumes on release, wraps
// at the end. Stops itself once its track leaves the document (a re-render replaces it).
let _carouselConveyor = (new URLSearchParams(location.search).get("conveyor") || "") === "1"
let _carouselConveyorRaf = 0
const CAROUSEL_CONVEYOR_PX_PER_FRAME = 0.35

function carouselRunConveyor(track){
  cancelAnimationFrame(_carouselConveyorRaf)
  let held = false
  const hold = () => { held = true }, release = () => { held = false }
  track.addEventListener("pointerdown", hold); track.addEventListener("pointerup", release)
  track.addEventListener("pointercancel", release)
  track.addEventListener("mouseenter", hold); track.addEventListener("mouseleave", release)
  // The track snaps (scroll-snap-type: x mandatory) so a swipe lands on a card. A conveyor
  // and mandatory snapping cannot coexist: each sub-pixel nudge is snapped straight back to
  // the nearest card, and the belt never moves (measured: scrollLeft pinned at 4 while the
  // frame loop ran). Snapping is suspended while the belt runs and restored when it stops,
  // and the position is accumulated as a float because scrollLeft rounds what it is given.
  track.style.scrollSnapType = "none"
  let pos = track.scrollLeft
  const step = () => {
    _carouselConveyorRaf = 0
    if(!_carouselConveyor || !document.body.contains(track)){ track.style.scrollSnapType = ""; return }
    if(!held){
      const max = track.scrollWidth - track.clientWidth
      if(max > 2){
        pos = pos >= max - 1 ? 0 : pos + CAROUSEL_CONVEYOR_PX_PER_FRAME
        track.scrollLeft = pos
      }
    } else pos = track.scrollLeft   // a finger moved it — carry on from there
    _carouselConveyorRaf = requestAnimationFrame(step)
  }
  _carouselConveyorRaf = requestAnimationFrame(step)
}

// ── one account as a card ─────────────────────────────────────────────────────────────────
// mine: basket on TOP (facing the centre strip), store below. others: store on top, basket at
// the BOTTOM (facing the centre strip). So the two baskets meet at the middle of the screen —
// the ring's inner rim, unwrapped into a line.
function carouselCard(account, ctx, mine){
  const card = document.createElement("div")
  card.className = "carousel-card"
    + (mine ? " carousel-card--mine" : " carousel-card--other")
    + (account.mode === "lock" ? " carousel-card--locked" : "")
    + (account.id === boardSelectedAccount ? " carousel-card--selected" : "")
  const colour = getPlayerColour(account.playerId)
  card.style.setProperty("--pc", colour)
  card.dataset.accountId = account.id

  const head = document.createElement("div")
  head.className = "carousel-head"
  const id = document.createElement("span")
  id.className = "carousel-head-id"
  id.textContent = boardShortAcctId(account.id.split(":")[1] || account.id)
  head.appendChild(id)
  const tags = []
  if(mine) tags.push("you")
  if(account.mode === "lock") tags.push("🔒")
  if(!mine && playerAllowsPick(account.playerId)) tags.push("◀ pick")
  if(tags.length){
    const t = document.createElement("span")
    t.className = "carousel-head-tags"
    t.textContent = tags.join(" · ")
    head.appendChild(t)
  }
  if(mine){
    head.style.cursor = "pointer"
    head.title = "Tap to make this your active account"
    head.onclick = () => { boardSelectedAccount = account.id; render() }
  }
  const xl = window.accountLabelCache?.[account.id.split(":")[1] || account.id]
  if(xl){
    const sub = document.createElement("div")
    sub.className = "carousel-xsub"
    sub.textContent = xl
    head.appendChild(sub)
  }

  const store = document.createElement("div")
  store.className = "board-band carousel-store"
  store.title = mine ? "Your store" : "Their store (available)"
  boardStoreChips(account, store, ctx.reservedByAccount)
  boardReservedChips(account, store, ctx.reservedByAccount)

  const basket = document.createElement("div")
  basket.className = "board-band carousel-basket"
  basket.title = mine ? "Your basket — offers to you land here" : "Their basket — drop here to offer"
  boardBasketChips(account, basket, ctx.accountMap)

  card.appendChild(head)
  if(mine){ card.appendChild(basket); card.appendChild(store) }
  else { card.appendChild(store); card.appendChild(basket) }

  boardDropTarget(card, account)
  return card
}

// ── a row: arrows + a snapping, scrollable track of cards ─────────────────────────────────
function carouselRow(kind, accounts, ctx, emptyText){
  const row = document.createElement("div")
  row.className = "carousel-row carousel-row--" + kind
  const track = document.createElement("div")
  track.className = "carousel-track"
  track.setAttribute("role", "list")
  const arrow = (txt, dir) => {
    const b = document.createElement("button")
    b.type = "button"
    b.className = "carousel-arrow carousel-arrow--" + (dir < 0 ? "prev" : "next")
    b.textContent = txt
    b.title = dir < 0 ? "Previous" : "Next"
    b.onclick = () => track.scrollBy({ left: dir * Math.max(160, track.clientWidth * 0.7), behavior: "smooth" })
    return b
  }
  accounts.forEach(a => track.appendChild(carouselCard(a, ctx, kind === "mine")))
  if(!accounts.length){
    const hint = document.createElement("div")
    hint.className = "carousel-empty"
    hint.textContent = emptyText
    track.appendChild(hint)
  }
  row.appendChild(arrow("‹", -1))
  row.appendChild(track)
  row.appendChild(arrow("›", +1))
  if(kind === "others"){
    const auto = document.createElement("button")
    auto.type = "button"
    auto.className = "carousel-conveyor" + (_carouselConveyor ? " carousel-conveyor--on" : "")
    auto.textContent = "⟳"
    auto.title = _carouselConveyor ? "Conveyor on — other players drift past. Tap to stop." : "Conveyor: let the other players drift past"
    auto.onclick = () => { _carouselConveyor = !_carouselConveyor; render() }
    row.appendChild(auto)
    if(_carouselConveyor) carouselRunConveyor(track)
  }
  return row
}

// ── the centre strip: the ring's hub, unwrapped into an oblong ────────────────────────────
// Normally the small K and the lock tally. While signing, the SAME countdown pill the hub
// shows (.ring-hub-count, ticked by boardStartCountdown) and the same tap-to-sign — so the
// signing moment reads the same in both shapes.
function carouselCentre(mine, accounts){
  const strip = document.createElement("div")
  strip.className = "carousel-centre" + (boardSigning ? " carousel-centre--counting" : "")
  const lp = boardLockSummary(mine, accounts)
  if(boardSigning){
    const count = document.createElement("span")
    count.className = "ring-hub-count ring-hub-count--" + boardSigning.status
    count.title = "Time left in the signing window. Green = signed; dark green in the last ~10s = still signed, but too late for new signatures to land; amber = waiting for signatures"
    strip.appendChild(count)
    boardStartCountdown(count)
    const inline = (typeof boardSignInline === "function" && boardSignInline()) && typeof window.KPaySign === "function"
    if(inline || (typeof boardExtSign !== "undefined" && boardExtSign)){
      strip.style.cursor = "pointer"
      strip.title = inline ? "Tap to sign (all wallet options)" : "Tap for the full signing page (all wallet options)"
      strip.onclick = () => boardOpenSigning(boardSigning.tx)
    }
  } else {
    const k = document.createElement("span")
    k.className = "carousel-centre-k"
    k.textContent = "K"
    strip.appendChild(k)
    if(lp){
      const badge = document.createElement("span")
      badge.className = "carousel-centre-lp"
      badge.textContent = `🔒 ${lp.locked}/${lp.total}`
      badge.title = `${lp.locked} of ${lp.total} accounts locked (${lp.scope})`
      strip.appendChild(badge)
    }
  }
  return strip
}

// ── the board ─────────────────────────────────────────────────────────────────────────────
function renderCarouselBoard(root){
  const accounts = boardFilteredAccounts()
  const accountMap = getAccountMap()
  const reservedByAccount = boardReserved(accounts)
  const mine = accounts.filter(a => isMyAccount(a))
  const others = accounts.filter(a => !isMyAccount(a))
  const ctx = { reservedByAccount, accountMap }

  // TODO(CAROUSEL1-parity): no segment geometry to anchor speech bubbles on — see the header
  _boardChatAnchors = {}

  // The signing phase is DETECTED per render, and the ring does it inside its own renderer
  // (renderRingBoard) — so a skin that does not repeat it never sees the countdown. Same two
  // lines, same order. (The older Lazy Susan skins have this gap too; left as they are —
  // TODO(CAROUSEL1-refactor): hoist the detection into render() once susan* is folded in.)
  boardSigning = boardDetectSigning()
  boardSigningWindowDiag(boardSigning)

  const frag = document.createDocumentFragment()
  const wrap = document.createElement("div")
  wrap.className = "carousel"
  wrap.appendChild(carouselRow("others", others, ctx, "No one else here yet"))
  wrap.appendChild(carouselCentre(mine, accounts))
  wrap.appendChild(carouselRow("mine", mine, ctx, "Add an account to take a seat"))
  frag.appendChild(wrap)
  frag.appendChild(ringFooter(mine))
  frag.appendChild(boardBrandmark())
  root.replaceChildren(frag)

  boardAnimateNewOffers()
}

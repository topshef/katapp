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
//   boardDetectSigning / boardTxChips / boardUpdateBanner     the signing phase: detection,
//   boardStartCountdown / boardOpenSigning                    the struck legs painted into the
//                                                             baskets, the banner, the countdown
//                                                             pill and the tap-to-sign — from the hub
//   boardAnimateNewOffers                                    ghost→basket flight, DOM-keyed
//
// What it deliberately does NOT do (parity items, listed so nobody hunts for them):
//   chat bubbles: anchored per stall on its store (carouselChatAnchors), aimed away from
//     the centre line — CAROUSEL2, was a parity gap.
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

// ── one account as a stall ────────────────────────────────────────────────────────────────
// CAROUSEL2 (operator, 2026-09-07): "what we've got on the circle is very simple — a felt,
// dividing lines, and a ring that divides basket from store. Not formatting on top of
// formatting." So an account is a column of bare felt: the id etched into the store the way
// the ring etches it into the wedge, ONE line between store and basket (the lock arc,
// unwrapped — trading blue, orange once locked), and a single divider to the next stall.
// No card, no border, no basket box. mine: basket on TOP (facing the centre line), store
// below; others: store on top, basket at the BOTTOM — the two basket rows meet in the middle,
// the ring's inner rim as a line.
function carouselCard(account, ctx, mine){
  const stall = document.createElement("div")
  stall.className = "carousel-card"
    + (mine ? " carousel-card--mine" : " carousel-card--other")
    + (account.mode === "lock" ? " carousel-card--locked" : "")
    + (account.id === boardSelectedAccount ? " carousel-card--selected" : "")
  stall.style.setProperty("--pc", getPlayerColour(account.playerId))
  stall.dataset.accountId = account.id

  // the etched id: same words as the ring's wedge label (id · you · 🔒 · ◀)
  const etch = document.createElement("div")
  etch.className = "carousel-etch"
  etch.textContent = boardShortAcctId(account.id.split(":")[1] || account.id)
    + (mine ? " · you" : "")
    + (account.mode === "lock" ? " 🔒" : "")
    + (!mine && playerAllowsPick(account.playerId) ? " ◀" : "")
  const xl = window.accountLabelCache?.[account.id.split(":")[1] || account.id]
  if(xl) etch.title = xl
  if(mine){
    etch.style.cursor = "pointer"
    etch.title = (xl ? xl + " — " : "") + "Tap to make this your active account"
    etch.onclick = () => { boardSelectedAccount = account.id; render() }
  }

  const store = document.createElement("div")
  store.className = "board-band carousel-store"
  store.title = mine ? "Your store" : "Their store (available)"
  store.appendChild(etch)
  boardStoreChips(account, store, ctx.reservedByAccount)
  boardReservedChips(account, store, ctx.reservedByAccount)

  // the rim: the lock arc unwrapped — blue open, orange locked; while signing it takes the
  // account's signature status (green signed / amber waiting / grey none), as the arcs do
  const rim = document.createElement("div")
  const hac = account.id.split(":")[1] || account.id
  let sign = null
  if(boardSigning && boardSigning.legs[hac]){
    const per = boardSignStatus?.txid === boardSigning.tx?.txid ? boardSignStatus.byAccount?.[hac] : null
    sign = (per === "loading" ? "pending" : per) ?? boardSigning.status
  }
  rim.className = "carousel-rim" + (sign ? " carousel-rim--" + sign : "")
  rim.title = sign ? `Signature: ${sign}` : account.mode === "lock" ? "Locked" : "Store above the line, basket below — the ring's rim"

  const basket = document.createElement("div")
  basket.className = "board-band carousel-basket"
  basket.title = mine ? "Your basket — offers to you land here" : "Their basket — drop here to offer"
  boardBasketChips(account, basket, ctx.accountMap)
  // signing phase: the strike cleared the baskets server-side, but the board keeps the
  // picture — receiving legs render as tx chips in place (same call as the ring's wedge;
  // the 4th arg names the basket so the success flight knows where each chip lands)
  if(boardSigning){
    const legs = boardSigning.legs[account.id.split(":")[1] || account.id]
    if(legs && !basket.querySelector(".asset")) boardTxChips(legs, basket, ctx.accounts, account.id)
  }

  if(mine){ stall.append(basket, rim, store) }
  else { stall.append(store, rim, basket) }

  boardDropTarget(stall, account)
  return stall
}

// ── a row: arrows + a snapping, scrollable track of stalls ────────────────────────────────
// CAROUSEL2: the row remembers where you left it. Every render replaces the DOM, and a fresh
// track starts at 0 — so any action (an offer, a lock, someone else's move) threw both rows
// back to the beginning and the trail you had just drawn pointed at a stall that had scrolled
// away. The position is kept per row across renders and put back once the track is in the
// document (scrollLeft on a detached node is a no-op).
const _carouselScroll = { others: 0, mine: 0 }

function carouselRow(kind, accounts, ctx, emptyText){
  const row = document.createElement("div")
  row.className = "carousel-row carousel-row--" + kind
  const track = document.createElement("div")
  track.className = "carousel-track"
  track.dataset.kind = kind
  track.setAttribute("role", "list")
  track.addEventListener("scroll", () => { _carouselScroll[kind] = track.scrollLeft }, { passive: true })
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
  row.append(arrow("‹", -1), track, arrow("›", +1))
  return row
}

// after the DOM lands: put each row back where it was, then (re)start the belt from there,
// and give the chat its bubble anchors — one per stall, on the store, aimed away from the
// centre line (the ring's "radially outward": up for the top row, down for mine). Recorded
// here because the positions need real layout; scroll moves them, and the next paint
// re-aims the tails anyway (same caveat as the ring's avatar points).
function carouselRestore(wrap){
  wrap.querySelectorAll(".carousel-track").forEach(track => {
    track.scrollLeft = _carouselScroll[track.dataset.kind] || 0
    if(track.dataset.kind === "others" && _carouselConveyor) carouselRunConveyor(track)
  })
  carouselChatAnchors(wrap)
  wrap.querySelectorAll(".carousel-track").forEach(track =>
    track.addEventListener("scroll", () => carouselChatAnchors(wrap), { passive: true }))
}

function carouselChatAnchors(wrap){
  const rb = document.getElementById("boardRoot")?.getBoundingClientRect()
  if(!rb) return
  const accountMap = getAccountMap()
  _boardChatAnchors = {}
  wrap.querySelectorAll(".carousel-card").forEach(stall => {
    const id = stall.dataset.accountId
    const mine = stall.classList.contains("carousel-card--mine")
    const r = (stall.querySelector(".carousel-store") || stall).getBoundingClientRect()
    _boardChatAnchors[id] = {
      x: r.left + r.width / 2 - rb.left, y: r.top + r.height / 2 - rb.top,
      am: mine ? Math.PI / 2 : -Math.PI / 2, mine, playerId: accountMap[id]?.playerId
    }
  })
}

// ── the centre line: the ring's hub, unwrapped ────────────────────────────────────────────
// One line across the board where the two basket rows meet, with the K and the lock tally
// sitting on it. While signing, the SAME countdown pill the hub shows (.ring-hub-count,
// ticked by boardStartCountdown) and the same tap-to-sign — so the signing moment reads the
// same in both shapes. The conveyor toggle (⟳) lives at the line's right end.
function carouselCentre(mine, accounts){
  const strip = document.createElement("div")
  strip.className = "carousel-centre" + (boardSigning ? " carousel-centre--counting" : "")
  const lp = boardLockSummary(mine, accounts)
  const piece = document.createElement("div")
  piece.className = "carousel-centre-piece"
  if(boardSigning){
    const count = document.createElement("span")
    count.className = "ring-hub-count ring-hub-count--" + boardSigning.status
    count.title = "Time left in the signing window. Green = signed; dark green in the last ~10s = still signed, but too late for new signatures to land; amber = waiting for signatures"
    piece.appendChild(count)
    // ticked by boardStartCountdown once the strip is in the document — it checks
    // document.body.contains(el) on its first tick and would stop dead on a detached node
    const inline = (typeof boardSignInline === "function" && boardSignInline()) && typeof window.KPaySign === "function"
    if(inline || (typeof boardExtSign !== "undefined" && boardExtSign)){
      piece.style.cursor = "pointer"
      piece.title = inline ? "Tap to sign (all wallet options)" : "Tap for the full signing page (all wallet options)"
      piece.onclick = () => boardOpenSigning(boardSigning.tx)
    }
  } else {
    const k = document.createElement("span")
    k.className = "carousel-centre-k"
    k.textContent = "K"
    piece.appendChild(k)
    if(lp){
      const badge = document.createElement("span")
      badge.className = "carousel-centre-lp"
      badge.textContent = `🔒 ${lp.locked}/${lp.total}`
      badge.title = `${lp.locked} of ${lp.total} accounts locked (${lp.scope})`
      piece.appendChild(badge)
    }
  }
  strip.appendChild(piece)
  const auto = document.createElement("button")
  auto.type = "button"
  auto.className = "carousel-conveyor" + (_carouselConveyor ? " carousel-conveyor--on" : "")
  auto.textContent = "⟳"
  auto.title = _carouselConveyor ? "Conveyor on — other players drift past. Tap to stop." : "Conveyor: let the other players drift past"
  auto.onclick = () => { _carouselConveyor = !_carouselConveyor; render() }
  strip.appendChild(auto)
  return strip
}

// ── the signing lifecycle, skin-agnostic ──────────────────────────────────────────────────
// CAROUSEL2 (operator, 2026-09-07: "locking doesn't visibly show any transaction being
// raised … no signing option … it just goes straight to clearing the table"). Two causes.
// The detector itself, boardDetectSigning, answered null for every skin but ring15/16 — so
// this renderer's countdown block was unreachable, the baskets the strike had emptied
// server-side simply went blank, and the footer never turned into ✍ Sign. That gate now
// admits the carousel. And the ring does a run of skin-agnostic work at the top of its own
// renderer that nothing else shared: hold the last paint until a verdict lands, mark the
// body signing (read-only CSS), the side-circle breadcrumb, and the vanish-from-pending
// verdict that asks the chain (BOARD-TXTRUTH1 — never guess a failure). This is that run,
// the same statements in the same order, for this skin.
//   TODO(CAROUSEL2-refactor): renderRingBoard carries this block inline (katomia-board.js,
//   top of renderRingBoard through `_boardLastSigningTxid = nowTxid`). Once this copy has
//   proven itself in the wild, replace the ring's inline block with a call to this function
//   (moved into katomia-board.js) — one lifecycle, two shapes. Not done now: the brief is to
//   add without touching the ring.
// Returns false when the paint must be held (the caller returns without painting).
function carouselSigningPrologue(){
  {
    const nowSig = boardDetectSigning()
    const prev = _boardLastSigningTxid
    if(!nowSig && prev && !boardSuccessAcked.has(prev) && !window.katomiaTxStatus?.snapshot(prev)?.verdict){
      if(!_boardVerdictHold){
        _boardVerdictHold = { txid: prev, since: Date.now() }
        boardDiag("board:verdict-hold:start", { txid: prev, skin: "carousel" })
        boardConfirmTxFromChain(prev, window.katomiaTxStatus?.snapshot(prev)?.expiry || 0)
        setTimeout(() => {
          if(_boardVerdictHold?.txid !== prev) return
          boardDiag("board:verdict-hold:cap", { txid: prev })
          _boardVerdictHold = null
          render()
        }, BOARD_VERDICT_HOLD_CAP_MS)
      }
      if(_boardVerdictHold.txid === prev && Date.now() - _boardVerdictHold.since < BOARD_VERDICT_HOLD_CAP_MS) return false
    } else if(_boardVerdictHold){
      _boardVerdictHold = null
    }
  }

  boardSigning = boardDetectSigning()
  boardSigningWindowDiag(boardSigning)
  if(boardSigning) document.body.dataset.signing = "1"
  else delete document.body.dataset.signing

  if(state?.moved && typeof currentPlayerId !== "undefined" && currentPlayerId){
    for(const [accId, childId] of Object.entries(state.moved)){
      if(accId.split(":")[0] !== currentPlayerId) continue
      if(_boardMovedNotified.has(childId)) continue
      _boardMovedNotified.add(childId)
      try {
        window.katomiaChat?.system?.(
          `Your deal moved to side circle ${childId} while you were away — it settles there.`,
          { link: childId, linkText: childId })
      } catch(_){}
    }
  }

  {
    const nowTxid = boardSigning?.tx?.txid || null
    if(_boardLastSigningTxid && _boardLastSigningTxid !== nowTxid && !boardSuccessAcked.has(_boardLastSigningTxid)){
      const vanished = _boardLastSigningTxid
      window.katomiaTxStatus?.report(vanished, { source: "board", kind: "progress", detail: { event: "left-pending" } })
      boardConfirmTxFromChain(vanished, window.katomiaTxStatus?.snapshot(vanished)?.expiry || 0)
    }
    if(_boardLastSigningTxid && !nowTxid)
      boardTrailLines().forEach(l => l.remove())
    _boardLastSigningTxid = nowTxid
  }
  return true
}

// ── the board ─────────────────────────────────────────────────────────────────────────────
function renderCarouselBoard(root){
  if(!carouselSigningPrologue()) return

  const accounts = boardFilteredAccounts()
  const accountMap = getAccountMap()
  const reservedByAccount = boardReserved(accounts)   // signing-phase ghosts merged in
  const mine = accounts.filter(a => isMyAccount(a))
  const others = accounts.filter(a => !isMyAccount(a))
  const ctx = { reservedByAccount, accountMap, accounts }

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
  carouselRestore(wrap)
  const pill = wrap.querySelector(".carousel-centre .ring-hub-count")
  if(pill) boardStartCountdown(pill)
  boardUpdateBanner()   // signing narrative / hint / hidden — same as the ring

  boardAnimateNewOffers()

  // the STRIKE moment: entering the signing phase auto-plays the choreography once (legs
  // fly from the giver's ghost to the basket they now sit in); ▶ replays it
  const txid = boardSigning?.tx?.txid || null
  if(txid && window.__boardStruckTx !== txid) setTimeout(playTransfers, 80)
  window.__boardStruckTx = txid

  boardPruneOrphanTrails()
}

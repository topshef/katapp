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
//     ring geometry, no equivalent in a flow layout — cards are the walls. Arranging chips
//     by hand and "Sticky chips" DO work here now, without physics (CAROUSEL-ARRANGE1).
//   TODO(CAROUSEL1-refactor) the Lazy Susan's susanCard/susanMineRow and this file's card
//     builder are two takes on "an account as a card with two bands". Once this skin has been
//     kicked around, fold them into one builder with a {basketFirst} switch and retire the
//     older susan* skins. Not done now, on purpose: a shared builder would mean editing the
//     susan path, and the brief is to add without breaking.
//
// Loaded AFTER katomia-board.js (classic script, same global lexical scope), so it sees the
// board's top-level state and helpers by name.

// ── conveyor (the "other players drift past" mode) ────────────────────────────────────────
// ?conveyor=1 starts it; the button at the right end of the centre line toggles it. Pauses
// while a finger or the pointer is on the track (you cannot drop onto a moving target),
// resumes on release. Stops itself once its track leaves the document (a re-render replaces
// it). CAROUSEL-WHEEL1 (owner 2026-10-13: "it should be infinite scroll as well, so it
// shouldn't jump back to the beginning when it gets to the end"): the row is a wheel now, so
// the belt simply keeps turning — the first player comes round again after the last, past
// the seam line — and it never snaps back to the start. A row where everyone fits has nothing
// to drift, and the button is hidden for it (carouselFit).
let _carouselConveyor = (new URLSearchParams(location.search).get("conveyor") || "") === "1"
let _carouselConveyorRaf = 0
const CAROUSEL_CONVEYOR_PX_PER_FRAME = 0.35

// snapping is suspended while the belt runs (see below) or a mouse drags the row; this puts
// back whatever the row should have now
function carouselSnapRestore(track){
  track.style.scrollSnapType = track.dataset.kind === "others" && _carouselConveyor ? "none" : ""
}

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
    if(!_carouselConveyor || !document.body.contains(track)){ carouselSnapRestore(track); return }
    if(!held && track._wheel) pos = carouselScrollTo(track, pos + CAROUSEL_CONVEYOR_PX_PER_FRAME)
    else pos = track.scrollLeft   // a finger moved it (or nothing to drift) — carry on from there
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
  const sign = boardAccountSignState(hac)   // LOCKBAR1: the ring's rule, shared
  // LOCKBAR1 (owner 2026-10-13): the rim IS the lock bar — the ring's arc laid flat. Same
  // classes, tube width, tones, hover and tap as the arc (katomia-board.js boardWireLockBar),
  // so the footer's Lock preview and the optimistic lock paint find it like an arc.
  const locked = account.mode === "lock"
  const party = boardLockBarParty(account, ctx.accounts, sign, locked)
  rim.className = "carousel-rim ring-lockarc"
    + (locked ? " ring-lockarc--locked" : "")
    + (mine ? " ring-lockarc--mine ring-lockarc--open" : " ring-lockarc--wall")
    + (party ? " ring-lockarc--target" : "")
    + (sign ? " carousel-rim--" + sign : "")
  rim.dataset.accountId = account.id
  rim.style.setProperty("--tstrip", boardLockBarTone(account, party))
  if(mine && !sign) boardWireLockBar(rim, account, locked)
  else rim.title = sign ? `Signature: ${sign}` : locked ? "Locked" : "Store above the line, basket below — the ring's rim, laid flat"

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
// document (scrollLeft on a detached node is a no-op). On a wheel row (below) it is kept as
// the offset into one turn of the wheel, so a re-render puts back the same stalls.
const _carouselScroll = { others: 0, mine: 0 }

function carouselRow(kind, accounts, ctx, emptyText){
  const row = document.createElement("div")
  row.className = "carousel-row carousel-row--" + kind
  const track = document.createElement("div")
  track.className = "carousel-track"
  track.dataset.kind = kind
  track.setAttribute("role", "list")
  const arrow = (txt, dir) => {
    const b = document.createElement("button")
    b.type = "button"
    b.className = "carousel-arrow carousel-arrow--" + (dir < 0 ? "prev" : "next")
    b.textContent = txt
    b.title = dir < 0 ? "Previous" : "Next"
    // a wheel steps whole stalls (the snap would round it anyway; this keeps it even)
    b.onclick = () => {
      const page = Math.max(160, track.clientWidth * 0.7), W = track._wheel?.W
      track.scrollBy({ left: dir * (W ? Math.max(1, Math.round(page / W)) * W : page), behavior: "smooth" })
    }
    return b
  }
  accounts.forEach(a => track.appendChild(carouselCard(a, ctx, kind === "mine")))
  if(!accounts.length){
    const hint = document.createElement("div")
    hint.className = "carousel-empty"
    hint.textContent = emptyText
    track.appendChild(hint)
  }
  carouselDragScroll(track)
  row.append(arrow("‹", -1), track, arrow("›", +1))
  return row
}

// ── the wheel ─────────────────────────────────────────────────────────────────────────────
// CAROUSEL-WHEEL1 (owner 2026-10-13: "an infinite scroll so that you don't get to the end.
// When you get to the end, you're back at the beginning again — effectively like a wheel,
// just like on round table … a slightly thicker dividing line so you can see that you're
// back at the beginning … default behaviour, no setting"). A row whose stalls do not all fit
// becomes a wheel; a row where everyone fits stays as it was (there is no end to reach).
//
// HOW, and why this way. The track keeps NATIVE scrolling — the phone swipe the owner likes
// and the browser's own momentum and snapping are untouched. Its content is one long empty
// span (many turns of the wheel), and each stall is absolutely positioned at its place in
// whichever turn is nearest the middle of the view, re-placed on every scroll. A stall only
// ever jumps a whole turn, and only while it is out of sight, so nothing visibly moves.
// Nothing is CLONED: every chip, basket and drop target exists once, so the trails, hover
// lines, flights and drop logic — all of which find chips by data-* selectors — see exactly
// the DOM they always did. The price of no clones: a stall can be on screen in only one place,
// so one turn must be at least the view plus one stall (C ≥ V + W). A stall is therefore
// widened when the row holds few of them — W ≥ V / (N − 1) — which on a phone with two
// accounts means one full-width stall at a time. scrollLeft is written only on restore, by a
// mouse drag and by the conveyor, never during a finger swipe.
const CAROUSEL_WHEEL_SPAN_PX = 240000
const CAROUSEL_WHEEL_SLACK_PX = 24   // a little more than one stall of slack where we can afford it

function carouselWheelSetup(track){
  const cards = [...track.querySelectorAll(":scope > .carousel-card")]
  const V = track.clientWidth
  if(cards.length < 2 || V <= 0 || track.scrollWidth <= V + 1) return null
  const floor = Math.max(...cards.map(c => c.getBoundingClientRect().width))
  const N = cards.length
  const W = Math.min(V, Math.max(Math.ceil(floor), Math.ceil((V + CAROUSEL_WHEEL_SLACK_PX) / (N - 1))))
  const C = N * W
  const turns = Math.max(4, Math.ceil(CAROUSEL_WHEEL_SPAN_PX / C))
  const span = document.createElement("div")
  span.className = "carousel-span"
  span.style.width = turns * C + "px"
  track.prepend(span)
  track.classList.add("carousel-track--wheel")
  track.style.setProperty("--cw", W + "px")
  // the seam: the first account's left edge, where the last one comes round to meet it
  cards.forEach((c, i) => c.classList.toggle("carousel-card--seam", i === 0))
  track._wheel = { cards, W, C, V, turns, home: Math.floor(turns / 2) * C }
  return track._wheel
}

// each stall in the turn nearest the middle of the view at scroll position s
function carouselWheelPlace(track, s = track.scrollLeft){
  const w = track._wheel
  if(!w) return
  const mid = s + w.V / 2
  w.cards.forEach((card, i) => {
    const base = i * w.W
    const x = base + w.C * Math.round((mid - base - w.W / 2) / w.C)
    if(card._wheelX !== x){ card._wheelX = x; card.style.left = x + "px" }
  })
}

// a scroll WE make: place the stalls for the destination first, so the frame that shows it
// already has them there (a scroll event would only arrive a frame later). Far from home —
// hours of conveyor — the wheel is turned back a whole number of turns, which looks the same.
function carouselScrollTo(track, s){
  const w = track._wheel
  if(w && (s < w.C || s > (w.turns - 2) * w.C)) s = w.home + (((s % w.C) + w.C) % w.C)
  carouselWheelPlace(track, s)
  track.scrollLeft = s
  return s
}

// where the row is, as kept across renders: the offset into one turn on a wheel
function carouselOffset(track){
  const w = track._wheel, s = track.scrollLeft
  return w ? ((s % w.C) + w.C) % w.C : s
}

// ── drag to scroll, desktop ───────────────────────────────────────────────────────────────
// CAROUSEL-DRAG1 (owner 2026-10-13: "on mobile you can just do that by swiping … on desktop it
// doesn't have that feature … click and drag on the background to scroll"). Mouse only — touch
// keeps the native swipe. A press on a chip, a button or a link is theirs (chips drag to make
// offers), so the row only takes presses on the felt; it starts moving after a few pixels, so
// a plain click on the felt, the etched id or your lock bar still does what it did. Letting go
// carries a little momentum and settles on a stall, the way a swipe does, and the click that
// ends a drag is swallowed so it cannot also tap whatever is under the pointer.
const CAROUSEL_DRAG_START_PX = 6
function carouselDragScroll(track){
  let d = null
  track.addEventListener("pointerdown", e => {
    if(e.pointerType !== "mouse" || e.button !== 0 || !track._wheel) return
    if(e.target.closest(".asset, button, a, input, select, textarea")) return
    d = { id: e.pointerId, x: e.clientX, s: track.scrollLeft, on: false, trace: [] }
  })
  track.addEventListener("pointermove", e => {
    if(!d || e.pointerId !== d.id) return
    const dx = e.clientX - d.x
    if(!d.on){
      if(Math.abs(dx) < CAROUSEL_DRAG_START_PX) return
      d.on = true
      try { track.setPointerCapture(d.id) } catch(_){}
      track.classList.add("carousel-track--dragging")
      track.style.scrollSnapType = "none"   // follow the hand; settle on a stall on release
      try { window.getSelection()?.removeAllRanges() } catch(_){}
    }
    carouselScrollTo(track, d.s - dx)
    const now = performance.now()
    d.trace.push([now, track.scrollLeft])
    while(d.trace.length > 2 && now - d.trace[0][0] > 100) d.trace.shift()
  })
  const end = e => {
    if(!d || e.pointerId !== d.id) return
    const was = d
    d = null
    if(!was.on) return
    track.classList.remove("carousel-track--dragging")
    const t = was.trace, a = t[0], b = t[t.length - 1]
    const v = t.length > 1 && b[0] > a[0] ? (b[1] - a[1]) / (b[0] - a[0]) : 0   // px per ms
    const w = track._wheel
    const aim = track.scrollLeft + v * 180
    const left = w ? Math.round(aim / w.W) * w.W : aim
    track.scrollTo({ left, behavior: "smooth" })
    setTimeout(() => { if(document.body.contains(track)) carouselSnapRestore(track) }, 500)
    const eat = ev => { ev.stopPropagation(); ev.preventDefault() }
    window.addEventListener("click", eat, { capture: true, once: true })
    setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 0)
  }
  track.addEventListener("pointerup", end)
  track.addEventListener("pointercancel", end)
}

// after the DOM lands: make each row a wheel if it needs one, put it back where it was, then
// (re)start the belt from there, and give the chat its bubble anchors — one per stall, on the
// store, aimed away from the centre line (the ring's "radially outward": up for the top row,
// down for mine). Recorded here because the positions need real layout; every scroll
// re-records them, re-places the wheel and re-aims the dotted lines.
function carouselRestore(wrap){
  wrap.querySelectorAll(".carousel-track").forEach(track => {
    const kind = track.dataset.kind
    const w = carouselWheelSetup(track)
    const off = _carouselScroll[kind] || 0
    if(w) carouselScrollTo(track, w.home + (((off % w.C) + w.C) % w.C))
    else track.scrollLeft = off
    track.addEventListener("scroll", () => {
      carouselWheelPlace(track)
      _carouselScroll[kind] = carouselOffset(track)
      carouselChatAnchors(wrap)
      carouselTrails()
    }, { passive: true })
    if(kind === "others" && _carouselConveyor) carouselRunConveyor(track)
  })
  carouselChatAnchors(wrap)
}

// ── the dotted lines follow the rows ──────────────────────────────────────────────────────
// CAROUSEL-TRAILS3 (owner 2026-10-13: "when a chip has been dropped into another basket, so
// there's a dotted line joining them, if you then scroll the carousel … that dotted line
// doesn't get cleared … you end up with a random dotted line just sitting in the wrong
// place"). The lines are drawn in screen space and were only re-aimed after a render; a
// scroll is not a render. Now every scroll re-aims them at their chips (the ring's own pass,
// boardReanchorTrails), and a line with an end scrolled out of its row's view is hidden until
// that end comes back — a line into the arrows or off the screen says nothing true.
function carouselTrails(){
  boardReanchorTrails()
  const rows = [...document.querySelectorAll(".carousel .carousel-track")].map(t => t.getBoundingClientRect())
  if(!rows.length) return
  const seen = (x, y) => {
    const r = rows.find(r => y >= r.top && y <= r.bottom)
    return !r || (x >= r.left - 1 && x <= r.right + 1)
  }
  boardTrailLines().forEach(line => {
    const at = k => Number(line.getAttribute(k))
    line.classList.toggle("board-trailline--offstage", !(seen(at("x1"), at("y1")) && seen(at("x2"), at("y2"))))
  })
}

// CAROUSEL-FIT1 (owner 2026-10-13, feedback alpha-yankee-44): no nested scrollbars. A band
// (store or basket) whose chips overflow its stall is compressed — the overlap (--cz, see
// katomia-board.css) grows in 4px steps until the chips fit or the cap is reached; past the
// cap the band clips rather than scroll (the stall is already at its widest share of the row).
// The arrows only show when the row really overflows. Re-run when thumbnails land, since an
// image arriving changes a chip's size.
const CAROUSEL_CZ_MAX = 36
function carouselFit(wrap){
  wrap.querySelectorAll(".carousel-card .board-band").forEach(band => {
    let cz = 0
    band.style.setProperty("--cz", "0px")
    while(band.scrollHeight > band.clientHeight + 1 && cz < CAROUSEL_CZ_MAX){
      cz += 4
      band.style.setProperty("--cz", cz + "px")
    }
  })
  wrap.querySelectorAll(".carousel-row").forEach(row => {
    const track = row.querySelector(".carousel-track")
    row.classList.toggle("carousel-row--fits", !!track && !track._wheel && track.scrollWidth <= track.clientWidth + 1)
  })
  // nothing to drift when every other player is already in view (CAROUSEL-WHEEL1)
  wrap.classList.toggle("carousel--others-fit", !!wrap.querySelector(".carousel-row--others.carousel-row--fits"))
}

// ── arranging chips by hand, and sticky chips ─────────────────────────────────────────────
// CAROUSEL-ARRANGE1 (owner 2026-10-13: "in carousel mode I don't seem to be able to rearrange
// my chips like I can in round table … if you do rearrange them, they stay in that arrangement
// … there is a tick option in View for sticky chips, and I'm assuming that should work in both
// modes"). Not a design limit, an omission: the Round Table's arranging and its sticky option
// both live in its chip physics (boardArrangeAt pins a body, sticky freezes settled bodies),
// and this skin lays chips out as plain wrapping rows with no bodies — so a drop inside your
// own space found nothing to pin and did nothing, and the sticky tick had nothing to freeze.
//
// The same two ideas, without physics, per band (a stall's store, or its basket):
//   · ARRANGE: drag a chip and let go inside the band it lives in, and it stays exactly where
//     you let go (pinned, kept per circle in this browser — the ring's pins are kept the same
//     way, and as there, nobody else's board moves). The other chips make room around it.
//     Released anywhere else, the drag means what it always meant (offer, redirect, pick).
//     Someone else's chip can be slid about inside their space too, as on the ring
//     (BOARD-ARRANGEOTHERS1) — it is fenced to that space.
//   · STICKY (View → Sticky chips, on by default): a chip keeps the place it was given while
//     others come and go — a chip that leaves leaves its gap, a newcomer takes the first free
//     place. Off: everything not hand-placed closes up in reading order, as before. A change
//     of shape (the stall gets wider or narrower) lets the unpinned chips re-flow — the
//     owner's "stable until the shape changes".
// A band with nothing to honour stays in the ordinary flow layout, untouched (including
// CAROUSEL-FIT1's compression); only a band that needs it is switched to placed chips.
// Ghosts (an offer's reservation in your store) and signing-phase legs are placed like any
// chip but are not themselves arranged by a drop: their drags already mean withdraw/redirect.
const CAROUSEL_CHIP_GAP = 2   // = .board-band gap

function carouselPinsKey(){ return "katomiaCarouselPins:" + (typeof gameId !== "undefined" && gameId ? gameId : "demo") }
let _carouselPins = null
function carouselPins(){
  if(!_carouselPins){
    try { _carouselPins = JSON.parse(localStorage.getItem(carouselPinsKey()) || "{}") } catch(_){ _carouselPins = {} }
  }
  return _carouselPins
}
function carouselPinsSave(){
  try {
    const pins = carouselPins(), keys = Object.keys(pins)
    keys.slice(0, Math.max(0, keys.length - 200)).forEach(k => delete pins[k])   // cap, oldest first
    localStorage.setItem(carouselPinsKey(), JSON.stringify(pins))
  } catch(_){}
}

// sticky places, this session: ident → {x, y, gen}; per band: the layout generation and the
// width it was laid out at (a different width = a change of shape)
const _carouselSpots = new Map()
const _carouselBandState = new Map()

function carouselBandKey(band){
  const stall = band.closest(".carousel-card")
  return (stall?.dataset.accountId || "") + "|" + (band.classList.contains("carousel-basket") ? "basket" : "store")
}
function carouselChipIdent(el, bandKey){
  const d = el.dataset
  const kind = el.classList.contains("board-txchip") ? "t" : el.classList.contains("reserved") ? "g" : ""
  return [bandKey, d.ownerAccount || "", d.assetId || "", d.toAccount || "", kind].join("|")
}

// where chips may sit in a band, in the band's own coordinates (its padding box)
function carouselBandRegion(band){
  const cs = getComputedStyle(band)
  const etch = band.querySelector(":scope > .carousel-etch")
  const top = Math.max(parseFloat(cs.paddingTop) || 0, etch ? etch.offsetTop + etch.offsetHeight : 0)
  return {
    x0: parseFloat(cs.paddingLeft) || 0, y0: top,
    x1: band.clientWidth - (parseFloat(cs.paddingRight) || 0),
    y1: band.clientHeight - (parseFloat(cs.paddingBottom) || 0)
  }
}

function carouselOverlaps(a, list){
  return list.some(b => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
}

// first free place in reading order around what is already placed, or null
function carouselFirstFit(w, h, placed, R, maxY, rowTop = R.y0){
  const g = CAROUSEL_CHIP_GAP
  const cands = [{ x: R.x0, y: rowTop }]
  placed.forEach(p => {
    cands.push({ x: p.x + p.w + g, y: p.y }, { x: R.x0, y: p.y + p.h + g }, { x: p.x, y: p.y + p.h + g })
  })
  cands.sort((a, b) => a.y - b.y || a.x - b.x)
  for(const c of cands){
    if(c.x + w > R.x1 + 0.5 || c.y > maxY + 0.5) continue
    if(!carouselOverlaps({ x: c.x, y: c.y, w, h }, placed)) return c
  }
  return null
}

function carouselClampTo(R, w, h, x, y, maxY){
  return {
    x: Math.max(R.x0, Math.min(R.x1 - w, x)),
    y: Math.max(R.y0, Math.min(maxY, y))
  }
}

function carouselLayoutBand(band){
  // back to the plain flow first: every pass measures it fresh
  band.classList.remove("carousel-band--placed")
  band.style.height = ""
  const chips = [...band.children].filter(c => c.classList.contains("asset"))
  chips.forEach(c => { c.style.removeProperty("--cx"); c.style.removeProperty("--cy"); c.classList.remove("carousel-chip--out") })
  // nothing to place — or the board is not on screen (another view is showing): every
  // chip would measure 0,0, and sticky would keep that as everyone's place (found by harness)
  if(!chips.length || !band.clientWidth || !band.offsetParent) return

  const key = carouselBandKey(band)
  const st = _carouselBandState.get(key) || { gen: 0, width: 0 }
  const gen = st.gen + 1
  const reshaped = st.width && Math.abs(st.width - band.clientWidth) > 1
  // a crowded band (CAROUSEL-FIT1 tucks its chips under each other) packs itself: held
  // places would only fight the compression. Hand-placed chips still count there.
  const crowded = parseFloat(band.style.getPropertyValue("--cz")) > 0
  const pins = carouselPins(), sticky = !!boardStickyChips && !crowded
  const seen = new Map()
  const items = chips.map(el => {
    let id = carouselChipIdent(el, key)
    const n = (seen.get(id) || 0) + 1
    seen.set(id, n)
    if(n > 1) id += "#" + n
    el.dataset.cslot = id
    const pin = el.classList.contains("reserved") || el.classList.contains("board-txchip") ? null : pins[id]
    const spot = sticky && !reshaped ? _carouselSpots.get(id) : null
    return { el, id, pin, spot, live: spot && spot.gen === st.gen }
  })
  // the flow is measured WITHOUT the hand-placed chips, so the rest read as they would if
  // those had been lifted off the row — the natural rows to fall back on (and to close up into)
  items.forEach(it => { if(it.pin) it.el.classList.add("carousel-chip--out") })
  items.forEach(it => { it.x = it.el.offsetLeft; it.y = it.el.offsetTop; it.w = it.el.offsetWidth; it.h = it.el.offsetHeight })
  const flowH = band.offsetHeight
  const record = list => {
    _carouselBandState.set(key, { gen, width: band.clientWidth })
    if(sticky) list.forEach(it => _carouselSpots.set(it.id, { x: it.x, y: it.y, gen }))
  }

  // nothing to honour, or everything already where the flow puts it: stay a flow band
  const same = (a, it) => Math.abs(a.x - it.x) < 1 && Math.abs(a.y - it.y) < 1
  if(items.every(it => !it.pin && (!it.spot || same(it.spot, it)))){ record(items); return }

  const R = carouselBandRegion(band)
  const isBasket = band.classList.contains("carousel-basket")
  // a basket grows to hold what was placed in it (it sizes to its content in the flow too);
  // a store keeps the height the stall gives it
  const maxYFor = h => isBasket ? Infinity : Math.max(R.y0, R.y1 - h)
  const placed = []
  const put = (it, p) => { it.x = p.x; it.y = p.y; placed.push(it) }
  // hand-placed first, exactly (overlapping another hand-placed chip is the hand's choice);
  // then places still held from the last layout; then a place that was left empty and came
  // back. A held place that would now sit on a chip already placed — a hand-placed one, or a
  // neighbour that grew when its picture loaded — is given up, and the chip takes the first
  // free place like a newcomer.
  items.filter(it => it.pin).forEach(it => put(it, carouselClampTo(R, it.w, it.h, it.pin.x, it.pin.y, maxYFor(it.h))))
  const free = []
  const hold = it => {
    const p = carouselClampTo(R, it.w, it.h, it.spot.x, it.spot.y, maxYFor(it.h))
    if(carouselOverlaps({ ...p, w: it.w, h: it.h }, placed)) free.push(it)
    else put(it, p)
  }
  items.filter(it => !it.pin && it.spot && it.live).forEach(hold)
  items.filter(it => !it.pin && it.spot && !it.live).forEach(hold)
  items.filter(it => !it.pin && !it.spot).forEach(it => free.push(it))
  // the rest keep their place in the natural rows where that is free, else the first free
  // place in reading order; with no room at all, the row place (overlapping, as a full band does)
  // (the search starts on the first row's line, so a chip it moves still sits in the row)
  free.sort((a, b) => chips.indexOf(a.el) - chips.indexOf(b.el))
  const rowTop = Math.max(R.y0, Math.min(...items.filter(it => !it.pin).map(it => it.y)))
  free.forEach(it => {
    const flow = carouselClampTo(R, it.w, it.h, it.x, it.y, maxYFor(it.h))
    put(it, !carouselOverlaps({ ...flow, w: it.w, h: it.h }, placed) ? flow
      : carouselFirstFit(it.w, it.h, placed, R, maxYFor(it.h), rowTop) || flow)
  })

  band.classList.add("carousel-band--placed")
  // placed chips no longer give a basket its height (it is sized by its content); hold it at
  // least at its flow height, taller if a chip was placed lower. A store's height comes from
  // its stall (flex), placed or not.
  if(isBasket){
    const pb = (parseFloat(getComputedStyle(band).paddingBottom) || 0) + band.clientTop * 2
    band.style.height = Math.max(flowH, ...items.map(it => it.y + it.h + pb)) + "px"
  }
  // through custom properties, NOT inline left/top: boardChipRect (trails, flights) reads an
  // inline left/top as the ring sim's SCREEN position, and these are band coordinates — the
  // first cut aimed every dotted line at the top of the screen (found by harness)
  items.forEach(it => { it.el.style.setProperty("--cx", it.x + "px"); it.el.style.setProperty("--cy", it.y + "px") })
  record(items)
}

// fit (CAROUSEL-FIT1) then place, on the plain flow each time
function carouselSettle(wrap){
  const bands = [...wrap.querySelectorAll(".carousel-card .board-band")]
  bands.forEach(b => {
    b.classList.remove("carousel-band--placed"); b.style.height = ""
    b.querySelectorAll(":scope > .carousel-chip--out").forEach(c => c.classList.remove("carousel-chip--out"))
  })
  carouselFit(wrap)
  bands.forEach(carouselLayoutBand)
}

// the drop: inside the band the chip lives in → it stays there (boardArrangeAt calls this
// on the carousel, from the mouse drop, the drag-end fallback and the touch release)
function carouselArrangeAt(srcEl, x, y){
  const band = srcEl?.closest?.(".carousel-card .board-band")
  if(!band || !document.body.contains(band)) return false
  if(srcEl.classList.contains("reserved") || srcEl.classList.contains("board-txchip")) return false
  const r = band.getBoundingClientRect()
  if(x < r.left || x > r.right || y < r.top || y > r.bottom) return false   // left its space
  const R = carouselBandRegion(band)
  const w = srcEl.offsetWidth, h = srcEl.offsetHeight
  const isBasket = band.classList.contains("carousel-basket")
  const p = carouselClampTo(R, w, h,
    x - r.left - band.clientLeft - w / 2, y - r.top - band.clientTop - h / 2,
    isBasket ? Math.max(R.y0, band.clientHeight - h) : Math.max(R.y0, R.y1 - h))
  const id = srcEl.dataset.cslot || carouselChipIdent(srcEl, carouselBandKey(band))
  carouselPins()[id] = { x: Math.round(p.x), y: Math.round(p.y) }
  carouselPinsSave()
  boardDiag("board:carousel:arrange", { band: carouselBandKey(band) })
  carouselLayoutBand(band)
  carouselTrails()
  return true
}

// the fence for someone else's chip (arrange-only drag): the chip's centre may not leave
// their band; the same shape as the ring's boardArrangeClamp answer
function carouselArrangeClamp(srcEl, x, y){
  const band = srcEl?.closest?.(".carousel-card .board-band")
  if(!band) return null
  const r = band.getBoundingClientRect(), R = carouselBandRegion(band)
  const w = srcEl.offsetWidth, h = srcEl.offsetHeight
  const cx = Math.max(r.left + R.x0 + w / 2, Math.min(r.left + R.x1 - w / 2, x))
  const cy = Math.max(r.top + R.y0 + h / 2, Math.min(r.bottom - h / 2, y))
  return { x: cx, y: cy, outside: Math.hypot(cx - x, cy - y) > 20 }
}

// View → Sticky chips, flipped while on the carousel: on = keep everything where it is now;
// off = forget the held places and let the unpinned chips close up
function carouselStickyChanged(on){
  _carouselSpots.clear()
  _carouselBandState.clear()
  if(on){
    const wrap = document.querySelector("#boardRoot .carousel")
    if(wrap) wrap.querySelectorAll(".carousel-card .board-band").forEach(carouselLayoutBand)
  } else render()
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
// same in both shapes. The conveyor toggle (a turning arrow) lives at the line's right end.
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
  // CAROUSEL-WHEEL1 (owner 2026-10-13: "the UI of the button is messed up … the ring is not —
  // the icon is just messed up"). It was the text glyph ⟳ in a 24px circle that kept the
  // browser's 6px/12px button padding: the glyph was pushed off-centre and clipped by its own
  // ring. Now a drawn icon (a wheel's turning arrow) centred in a true circle, padding zeroed,
  // and while the belt runs the icon turns slowly, so on/off reads without the colour alone.
  const auto = document.createElement("button")
  auto.type = "button"
  auto.className = "carousel-conveyor" + (_carouselConveyor ? " carousel-conveyor--on" : "")
  auto.innerHTML = '<svg viewBox="-1 -1 26 26" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>'
  auto.title = _carouselConveyor ? "Conveyor on — other players drift past. Tap to stop." : "Conveyor: let the other players drift past"
  auto.setAttribute("aria-label", auto.title)
  auto.setAttribute("aria-pressed", _carouselConveyor ? "true" : "false")
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
  carouselSettle(wrap)
  // a thumbnail landing changes its chip's size: fit and place again, and re-aim the lines
  wrap.querySelectorAll("img").forEach(img => {
    if(!img.complete) img.addEventListener("load", () => { carouselSettle(wrap); carouselTrails() }, { once: true })
  })
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
  // SIGN-TRAILS2 (owner 2026-10-13: on the carousel "we're seeing [the dotted line] until after
  // we lock, and then once we lock, the link is gone" — the Round Table keeps it). The trail
  // lines live on one persistent layer inside #boardRoot; every render's replaceChildren
  // detaches it, and the ring re-adopts it (and re-aims every line at its chips' new places)
  // in boardReanchorTrails after each paint. The carousel never called it, so the first
  // render after the strike — the signing phase's own repaint — took the lines with it. Same
  // pass now, after the carousel's DOM is in: re-adopt, re-aim, prune what lost an end.
  // CAROUSEL-TRAILS3: the same pass runs on every scroll, and hides a line whose end is
  // scrolled out of view (carouselTrails).
  carouselTrails()
}

// katomia-places.js — where you have been, and who is at a circle (owner 2026-10-09).
// Loaded on Home, Circles, the board and the order view. Two small things, kept together
// because both describe circles from the outside, and both will grow:
//
// ── RECENT-VISITS1: your watch / play history ────────────────────────────────────────
// Every circle page you open is remembered in THIS browser (localStorage katomiaRecent),
// newest first, side circles included — the list on Home is the way back to somewhere you
// were. It is history, not membership: the × on Home forgets a visit, it does not take
// your accounts off that board (leaving is still Remove account, inside the circle).
// OPEN (owner, same day): people operate in several circles at once, asynchronously, and
// will want to hop between them without going Home — a strip of recent circles (small
// chips) on the board itself is the likely next step; this store is what it would read.
// Visits and seats are different dimensions: a visit is "I looked", a seat is "I have
// accounts on that board" (the games list's `you` field, LIST-MINE1). The Circles list
// filters on seats; Home's history is visits.
//
// ── AUDIENCE-WWP1: watch / wait / play ───────────────────────────────────────────────
// The stadium (owner, same day): PLAYING are on the pitch — party to a deal in progress;
// WAITING are on the bench — seated with accounts, in no deal right now; WATCHING are in
// the stands — connected with nothing seated. The backend counts them (hbarlive_hts
// katomiaAudience, in the games list's `activity`). Shown as ▶ ⏸ 👁 with the words in the
// tooltip; whether "playing" is the right word in the UI is still open.
(function(){
  "use strict"
  const KEY = "katomiaRecent", MAX = 30
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter(x => x && x.id) : [] } catch { return [] } }
  const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))) } catch {} }

  window.katomiaRecent = {
    list: read,
    // Record a visit. Cheap to call on every state broadcast: it only writes when this
    // circle is not already on top, its name/network changed, or a minute has passed.
    touch(id, info = {}){
      if(!id) return
      id = String(id)
      const list = read()
      const top = list[0]
      const now = Date.now()
      if(top && top.id === id && (!info.name || top.name === info.name) && (!info.net || top.net === info.net)
         && (!info.view || top.view === info.view) && now - (top.at || 0) < 60000) return
      const old = list.find(x => x.id === id) || {}
      const entry = { id, view: info.view || old.view || "board", net: info.net || old.net || "",
                      name: info.name || old.name || "", at: now }
      write([entry].concat(list.filter(x => x.id !== id)))
    },
    remove(id){ write(read().filter(x => x.id !== String(id))) },
    clear(){ try { localStorage.removeItem(KEY) } catch {} }
  }

  // ▶ ⏸ 👁 — only the levels that are non-zero; "" when nobody is there.
  window.katomiaAudienceHtml = (a) => {
    a = a || {}
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))
    const bits = [
      [a.playing, "▶", "playing — party to a deal right now"],
      [a.waiting, "⏸", "waiting — seated with accounts, in no deal"],
      [a.watching, "👁", "watching — connected, nothing seated"]
    ].filter(([n]) => n > 0)
    if(!bits.length) return ""
    const title = bits.map(([n, , w]) => `${n} ${w}`).join(" · ")
    return `<span class="katomia-aud" title="${esc(title)}">` +
      bits.map(([n, ico]) => `<span class="katomia-aud-bit">${ico}&#8239;${n}</span>`).join("") + `</span>`
  }

  // ── BUBBLE-LINKS1 (owner 2026-10-09): every circle you can open wears the same bubble ────
  // "Recently visited, Live now … they should all have the same bubble effect, just as on the
  // circles page … the plainer bubble effect, the plain background and just a bubble outline."
  // So the Circles list's hover bubble moved here, unchanged, and Home's rows use it too:
  // katomiaDressCircleLinks(elements) — a plain card at rest, ONE living outline under the
  // pointer, and the 800ms entry gesture (kbubbleOpen) on click. The element may be the link
  // itself or a row that holds one (its first a[href] is the target). Needs kbubble.js and
  // kbubbleopen.js on the page; without them a click is a plain link. Its history:
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

  window.katomiaDressCircleLinks = (els) => {
    ;[...els].forEach(el => {
      if(el.dataset.kbDressed) return          // loadCircles() is re-entrant
      el.dataset.kbDressed = "1"
      const href = el.getAttribute("href") || el.querySelector("a[href]")?.getAttribute("href")
      window.kbubbleOpen?.bind(el, Object.assign({}, KBO_CIRCLE, { target: href }))
      el.addEventListener("mouseenter", () => bubbleOn(el))
      el.addEventListener("mouseleave", () => bubbleOff(el))
      el.addEventListener("focus", () => bubbleOn(el))       // keyboard parity
      el.addEventListener("blur", () => bubbleOff(el))
    })
  }

  // Ranking for "Live now": who is on the pitch first, then the bench, then the stands.
  window.katomiaAudienceScore = (a) => {
    a = a || {}
    return (a.playing || 0) * 10000 + (a.waiting || 0) * 100 + (a.watching || 0)
  }
})()

// kbubbleopen.js — ENTRY-BUBBLE1 (user 2026-07-29): the click-through transition.
// Sibling to kbubble.js (the living border). Here the border stops being a garnish and
// becomes the page transition: click the button and its loop *inflates* — seeded organic
// undulation, breath surges, rounding out as it swells — until it has swallowed the
// viewport and the stroke has left the screen. The button's own text/fill fade out; the
// TARGET PAGE fades in *inside the loop*, clipped to it, so the bubble reads as a window
// growing onto the next page rather than an overlay wiping over this one.
//
// Mechanics (why it's built this way):
//   · the target lives in a real <iframe> pinned to the viewport (position:fixed;inset:0)
//     so what you see through the hole is the final page at its FINAL size — no scale/pan,
//     hence no jump when we hand over to a real navigation at the end.
//   · the loop is published twice per frame: as an SVG <clipPath> (clips the iframe — canvas
//     can't clip a live document) and as a canvas path (fill + stroke, drawn over it).
//   · prefetch() warms the iframe on hover/touch so the reveal is instant. The iframe is
//     NEVER reparented — moving an iframe in the DOM reloads it and would throw the warm
//     document away — we just restyle it in place (z-index/opacity/clip-path).
//
// Progressive enhancement: play() returns null and navigates plainly when canvas/clip-path
// is unavailable or the user prefers reduced motion. Nothing here is required for the click
// to work — the transition is garnish over a normal link.
//
// API:
//   kbubbleOpen.bind(el, opts?) -> handle   wires hover-prefetch + click; opts as below
//   kbubbleOpen.play(el, opts?) -> run|null runs it now (opts.px/py = pointer, viewport px)
//   kbubbleOpen.prefetch(url)               warm the target iframe early
//   run.close()                             tear down (swap:'stay' — back to the host page)
//   opts:
//     target(url — THE editable parameter) · ms(1400 growth) · hold(140 at full screen)
//     coverage(1.22 — final radius vs the farthest viewport corner; >1 walks the stroke
//       off-screen; auto-lifted if the undulation would otherwise dip back into view)
//     origin('pointer'|'center') · ease(1.9 — easeInOut exponent of the growth curve)
//     puffs(2)/puffDepth(0.06) — breath surges: the swell comes in gulps, not one glide
//     seed(7) · lobes(4) · harmonics(3) · undulate(0.09 radial wobble, fraction of radius)
//     settle(0.6 — how much of the wobble surface tension irons out as it fills)
//     wobbleHz(0.55 drift) · points(150)
//     revealFrom(0.06)/revealTo(0.62) — the target's opacity tween, in progress units
//     fillAlpha(0.22)/fillFadeTo(0.5) — the button's own fill dissolving into the reveal
//     style('ink'|'glow'|'iridescent') · color · width(1.8) · blur(0) · strokeFade(0.9)
//     textFadeMs(240) — the button's label/box fading away
//     backdrop('auto'|css colour|null) — solid sheet under the reveal, same clip. Matters:
//       an iframe whose stylesheet hasn't landed yet paints NOTHING, so without a backdrop
//       a cold target turns the window see-through and the bubble looks like a no-op.
//       'auto' = the target's own body background once readable, else this page's.
//     swap('navigate'|'stay'|'none') · prefetch(true) · lockScroll(true) · onDone(fn)

(() => {
  if (window.kbubbleOpen) return

  const reduced = matchMedia?.("(prefers-reduced-motion: reduce)").matches
  const DEF = { target: "", ms: 1400, hold: 140, coverage: 1.22, origin: "pointer", ease: 1.9,
                puffs: 2, puffDepth: 0.06, seed: 7, lobes: 4, harmonics: 3, undulate: 0.09,
                settle: 0.6, wobbleHz: 0.55, points: 150, revealFrom: 0.06, revealTo: 0.62,
                fillAlpha: 0.22, fillFadeTo: 0.5, style: "ink", color: "", width: 1.8, blur: 0,
                strokeFade: 0.9, textFadeMs: 240, backdrop: "auto", swap: "navigate",
                prefetch: true, lockScroll: true, onDone: null }

  // seeded PRNG (mulberry32) — same seed = same bubble, so a shape you liked is reproducible
  const rng = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v
  const smooth = v => v * v * (3 - 2 * v)

  // Distance from an interior point to the rounded-rect boundary along a unit direction.
  // Slab hit first, then — if that lands in a corner quadrant — the corner circle instead,
  // so the loop starts EXACTLY on the button's border (radius included), not on its box.
  function rayRR(cx, cy, dx, dy, w, h, r){
    r = Math.max(0, Math.min(r, w / 2, h / 2))
    const tx = dx > 0 ? (w - cx) / dx : dx < 0 ? -cx / dx : Infinity
    const ty = dy > 0 ? (h - cy) / dy : dy < 0 ? -cy / dy : Infinity
    let t = Math.min(tx, ty)
    const px = cx + dx * t, py = cy + dy * t
    const kx = px < r ? r : px > w - r ? w - r : null
    const ky = py < r ? r : py > h - r ? h - r : null
    if(kx !== null && ky !== null){
      const ex = cx - kx, ey = cy - ky, b = ex * dx + ey * dy, c = ex * ex + ey * ey - r * r, disc = b * b - c
      if(disc > 0) t = -b + Math.sqrt(disc)
    }
    return Math.max(1, t)
  }

  const warm = new Map()   // url -> iframe, parked at z-index:-1 until a run claims it
  function prefetch(url){
    if(!url) return null
    if(warm.has(url)) return warm.get(url)
    const fr = document.createElement("iframe")
    fr.src = url; fr.tabIndex = -1; fr.setAttribute("aria-hidden", "true"); fr.dataset.kboWarm = url
    fr.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;border:0;margin:0;opacity:0;pointer-events:none;z-index:-1;"
    document.body.appendChild(fr)
    const link = document.createElement("link"); link.rel = "prefetch"; link.href = url; document.head.appendChild(link)
    warm.set(url, fr)
    return fr
  }

  let uid = 0, running = null

  // ── per-user tuning override (ENTRY-CIRCLES1, user 2026-07-30) ──────────────
  // "nerd option to apply alternative settings would be amazing (local to the user)".
  // A tuning object in localStorage that rides OVER every call site, so a tester can
  // retune the real transition on the real pages — not just in the kdemo lab — and it
  // sticks for them alone without touching anyone else or the deployed defaults.
  //
  // Structural keys are deliberately NOT overridable: target/swap/onDone/px/py decide
  // WHERE the click goes and how it hands over. Letting a stored blob redirect
  // navigation would turn a cosmetic preference into a broken (or hijackable) link.
  const TUNE_KEY = "katomia.kbubbleopen.tuning.v1"
  const TUNE_LOCKED = ["target", "swap", "onDone", "px", "py"]

  function userTuning(){
    let raw = null
    try { raw = localStorage.getItem(TUNE_KEY) } catch { return null }   // private mode / blocked
    if(!raw) return null
    let obj = null
    try { obj = JSON.parse(raw) } catch { return null }                  // corrupt → ignore, don't throw
    if(!obj || typeof obj !== "object" || Array.isArray(obj)) return null
    const out = {}
    for(const k of Object.keys(obj)){
      if(TUNE_LOCKED.includes(k)) continue
      if(!(k in DEF)) continue                                           // unknown key → ignore
      out[k] = obj[k]
    }
    return Object.keys(out).length ? out : null
  }

  function setUserTuning(obj){
    try {
      if(obj == null){ localStorage.removeItem(TUNE_KEY); return true }
      localStorage.setItem(TUNE_KEY, JSON.stringify(obj)); return true
    } catch { return false }
  }

  function play(el, opts = {}){
    // DEF < call-site opts < this user's stored tuning.
    const o = Object.assign({}, DEF, opts, userTuning() || {}), url = o.target
    if(!url) return null
    const done = () => { o.onDone?.(); if(o.swap === "navigate") location.href = url }
    if(reduced || !document.createElement("canvas").getContext?.("2d")){ done(); return null }
    if(running) return null

    const r = el.getBoundingClientRect()
    if(!r.width || !r.height){ done(); return null }
    const cx = o.origin === "pointer" && o.px != null ? o.px : r.left + r.width / 2
    const cy = o.origin === "pointer" && o.py != null ? o.py : r.top + r.height / 2
    const lx = cx - r.left, ly = cy - r.top                        // origin inside the button
    const brad = o.radius ?? (parseFloat(getComputedStyle(el).borderRadius) || 10)

    // seeded harmonics — INTEGER lobe counts so the wobble closes seamlessly round the loop
    const rnd = rng(Math.round(o.seed) * 2654435761 % 2147483647)
    const H = Array.from({ length: Math.max(1, Math.round(o.harmonics)) }, (_, k) => ({
      L: Math.max(1, Math.round(o.lobes * (k + 1) * (0.55 + rnd() * 0.9))),
      ph: rnd() * Math.PI * 2, sp: (0.45 + rnd()) * o.wobbleHz, a: 1 / (k + 1) }))
    const hsum = H.reduce((s, h) => s + h.a, 0)
    const wob = (th, t) => H.reduce((s, h) => s + h.a * Math.sin(h.L * th + h.ph + t * h.sp * 6.283), 0) / hsum

    // final radius: past the farthest corner, so the stroke exits the screen. Lifted if the
    // end-state wobble amplitude could otherwise pull a lobe back into view.
    const corner = () => Math.max(Math.hypot(cx, cy), Math.hypot(innerWidth - cx, cy), Math.hypot(cx, innerHeight - cy), Math.hypot(innerWidth - cx, innerHeight - cy))
    const ampEnd = o.undulate * (1 - clamp01(o.settle))
    const R1 = corner() * Math.max(o.coverage, 1.02 + ampEnd)

    const id = "kbo-clip-" + (++uid)
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0")
    svg.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;"
    svg.innerHTML = `<defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d=""/></clipPath></defs>`
    const clipPath = svg.querySelector("path")
    document.body.appendChild(svg)

    const cv = document.createElement("canvas")
    cv.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;"
    document.body.appendChild(cv)
    const ctx = cv.getContext("2d")
    let vw = 0, vh = 0, dpr = 1
    const size = () => { vw = innerWidth; vh = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2); cv.width = vw * dpr; cv.height = vh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0) }
    size()

    // the reveal: warm iframe if we have one (never reparented), else created cold now
    const fr = prefetch(url)
    fr.style.zIndex = "2147482999"; fr.style.opacity = "0"; fr.style.clipPath = `url(#${id})`
    fr.style.webkitClipPath = `url(#${id})`

    // ...and a solid sheet under it, on the same clip: a target that hasn't painted yet is
    // fully transparent, and a see-through window reads as "the click did nothing".
    const bdCol = () => {
      try { const d = fr.contentDocument, tr = "rgba(0, 0, 0, 0)"
            for(const n of [d?.body, d?.documentElement]){ const c = n && getComputedStyle(n).backgroundColor; if(c && c !== tr && c !== "transparent") return c } } catch(e){}
      return getComputedStyle(document.body).backgroundColor || "#fff"
    }
    const bd = document.createElement("div")
    bd.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:2147482998;opacity:0;background:${o.backdrop && o.backdrop !== "auto" ? o.backdrop : bdCol()};`
    if(o.backdrop) document.body.appendChild(bd)
    bd.style.clipPath = bd.style.webkitClipPath = `url(#${id})`
    if(o.backdrop === "auto") fr.addEventListener("load", () => bd.style.background = bdCol(), { once: true })   // late-loading target

    const htmlOverflow = document.documentElement.style.overflow
    if(o.lockScroll) document.documentElement.style.overflow = "hidden"
    const elStyle = el.getAttribute("style") || ""
    el.style.transition = `opacity ${o.textFadeMs}ms ease-out`
    el.style.opacity = "0"

    const t0 = performance.now()
    let raf = 0, dead = false, unclipped = false

    // growth curve: easeInOut(exponent) + decaying breath surges, so it swells in gulps
    const grow = p => { const b = p < .5 ? Math.pow(2 * p, o.ease) / 2 : 1 - Math.pow(2 - 2 * p, o.ease) / 2
                        return clamp01(b + o.puffDepth * Math.sin(6.283 * o.puffs * p) * (1 - p)) }

    function shape(p, t){
      const e = grow(p), N = Math.max(24, Math.round(o.points))
      const amp = o.undulate * Math.pow(e, 0.6) * (1 - clamp01(o.settle) * e * e)
      const pts = []
      let rmin = Infinity
      for(let i = 0; i < N; i++){
        const th = i / N * 6.283185307, dx = Math.cos(th), dy = Math.sin(th)
        const r0 = rayRR(lx, ly, dx, dy, r.width, r.height, brad)
        const rr = (r0 + (R1 - r0) * e) * (1 + amp * wob(th, t))
        if(rr < rmin) rmin = rr
        pts.push([cx + dx * rr, cy + dy * rr])
      }
      return { pts, e, rmin }
    }

    // one loop, two consumers: an SVG path string (clips the live iframe) and the canvas
    // path (fill + stroke). Same quadratic midpoint smoothing kbubble.js uses.
    const trace = (pts, into) => {
      const N = pts.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
      let s = "", m0 = mid(pts[0], pts[1])
      into ? into.moveTo(m0[0], m0[1]) : s = `M${m0[0].toFixed(1)} ${m0[1].toFixed(1)}`
      for(let i = 1; i <= N; i++){
        const c = pts[i % N], m = mid(c, pts[(i + 1) % N])
        if(into) into.quadraticCurveTo(c[0], c[1], m[0], m[1])
        else s += `Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`
      }
      if(into) into.closePath(); else s += "Z"
      return s
    }

    function frame(now){
      if(dead) return
      if(vw !== innerWidth || vh !== innerHeight) size()
      const t = now / 1000, p = clamp01((now - t0) / o.ms)
      const { pts, e, rmin } = shape(p, t)

      // once every point clears the farthest corner the clip is a no-op — drop it (and the
      // stroke) so the last frames are the bare page, ready for a seamless hand-over
      if(!unclipped && rmin > corner() * 1.005){ unclipped = true; fr.style.clipPath = fr.style.webkitClipPath = bd.style.clipPath = bd.style.webkitClipPath = "none" }
      if(!unclipped) clipPath.setAttribute("d", trace(pts, null))
      fr.style.opacity = bd.style.opacity = String(smooth(clamp01((p - o.revealFrom) / Math.max(0.01, o.revealTo - o.revealFrom))))

      ctx.clearRect(0, 0, vw, vh)
      if(!unclipped){
        const fa = o.fillAlpha * (1 - clamp01(p / Math.max(0.01, o.fillFadeTo)))
        if(fa > 0.002){
          ctx.beginPath(); trace(pts, ctx); ctx.shadowBlur = 0
          if(o.style === "iridescent"){
            const g = ctx.createLinearGradient(cx - R1 * e, cy - R1 * e, cx + R1 * e, cy + R1 * e)
            for(let s = 0; s <= 4; s++) g.addColorStop(s / 4, `hsla(${(s * 90 + t * 40) % 360}, 85%, 68%, ${fa})`)
            ctx.fillStyle = g
          } else { ctx.globalAlpha = fa; ctx.fillStyle = o.color || "rgba(29,35,42,.65)" }
          ctx.fill(); ctx.globalAlpha = 1
        }
        const sa = 1 - smooth(clamp01((p - o.strokeFade) / Math.max(0.01, 1 - o.strokeFade)))
        if(sa > 0.01){
          ctx.globalAlpha = sa; ctx.lineWidth = o.width; ctx.lineCap = "round"
          if(o.style === "iridescent"){
            const N = pts.length
            for(let i = 0; i < N; i++){
              ctx.strokeStyle = `hsla(${(i / N * 360 + t * 40) % 360}, 85%, 66%, .9)`
              ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = o.blur || 4
              ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[(i + 1) % N][0], pts[(i + 1) % N][1]); ctx.stroke()
            }
          } else {
            if(o.style === "glow"){ ctx.shadowColor = o.color || "rgba(47,111,237,.8)"; ctx.shadowBlur = o.blur || 10 }
            else if(o.blur > 0){ ctx.shadowColor = o.color || "rgba(29,35,42,.65)"; ctx.shadowBlur = o.blur }
            ctx.strokeStyle = o.color || "rgba(29,35,42,.65)"
            ctx.beginPath(); trace(pts, ctx); ctx.stroke()
          }
          ctx.shadowBlur = 0; ctx.globalAlpha = 1
        }
      }

      if(p < 1){ raf = requestAnimationFrame(frame); return }
      // full screen: bare target page, nothing of ours painted over it
      fr.style.clipPath = fr.style.webkitClipPath = bd.style.clipPath = bd.style.webkitClipPath = "none"
      fr.style.opacity = bd.style.opacity = "1"
      ctx.clearRect(0, 0, vw, vh)
      setTimeout(() => {
        if(dead) return
        if(o.swap === "stay"){ fr.style.pointerEvents = "auto"; cv.remove() }
        else if(o.swap === "none") run.close()
        o.onDone?.()
        if(o.swap === "navigate") location.href = url   // same document, already painted → no flash
      }, o.hold)
    }
    raf = requestAnimationFrame(frame)

    const run = { el, opts: o, url, close(){
      if(dead) return
      dead = true; cancelAnimationFrame(raf); cv.remove(); svg.remove(); bd.remove()
      fr.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;border:0;margin:0;opacity:0;pointer-events:none;z-index:-1;"
      if(o.lockScroll) document.documentElement.style.overflow = htmlOverflow
      el.setAttribute("style", elStyle)
      running = null
    } }
    running = run
    return run
  }

  // hover/touch warms the target, click inflates. Options are read LIVE off handle.opts so a
  // tuning UI can mutate one object and the next click uses it.
  function bind(el, opts = {}){
    const h = { el, opts: Object.assign({}, DEF, opts), run: null }
    const warmUp = () => { if(h.opts.prefetch) prefetch(h.opts.target) }
    const onClick = e => { e.preventDefault(); h.run = play(el, Object.assign({}, h.opts, { px: e.clientX || null, py: e.clientY || null })) }
    el.addEventListener("pointerenter", warmUp); el.addEventListener("touchstart", warmUp, { passive: true })
    el.addEventListener("click", onClick)
    h.destroy = () => { el.removeEventListener("pointerenter", warmUp); el.removeEventListener("touchstart", warmUp); el.removeEventListener("click", onClick); h.run?.close() }
    return h
  }

  window.kbubbleOpen = { bind, play, prefetch, DEF, userTuning, setUserTuning, TUNE_KEY,
                         get running(){ return running } }
  if(window.kbubble) window.kbubble.open = play   // convenience for pages already using the border
})()

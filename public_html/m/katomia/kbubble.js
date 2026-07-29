// kbubble.js — ENTRY-BUBBLE1 (user brainstorm 2026-07-29): the "bubble border"
// micro-interaction. An element's border is drawn as a closed elastic loop (a 1D wave
// equation running around the perimeter of a rounded rect). Hovering blows at the
// bubble — a ripple runs around the border from the pointer; clicking is a harder
// puff. The idea: a brand-unique liquidity gesture (soft, alive, organic) instead of
// a stock CSS hover.
//
// Plain 2D canvas, no WebGL needed at this scale (a few hundred points per element).
// Progressive enhancement: attach() returns null (and touches nothing) when canvas is
// unavailable or the user prefers reduced motion — the element keeps its CSS border,
// so pages must treat the effect as optional garnish. On success the element gains
// class "kbubble-on" (page CSS can then drop its native border).
//
// API:
//   kbubble.attach(el, opts?) -> handle|null
//     opts: bleed(px canvas margin, 20) · radius(corner px, from computed style)
//           style: 'ink' | 'glow' | 'iridescent' (default 'ink')
//           color(css, for ink/glow) · width(px, 1.6) · points(140) · blur(px, per-style)
//           tension(28) · spring(14) · damp(2.2) · ambient(0.35) · puff(26)
//           spread(0..1, 0.12): puff radius — how LOCAL the pointer's effect is.
//             0 = pinpoint ripple at the pointer; 1 = the whole border responds as
//             one (hover anywhere ≈ hover everywhere), pointer position subliminal.
//           iters(1..10, 1): wave speed/wavelength — how fast disturbance spreads.
//             1 = slinky string; high = stiff ring, long slow warps.
//           smooth(0..1, 0): low-pass on the shape — kills granular ripples so only
//             wide flexes survive (steel/plastic ring feel). Combines with iters.
//           offsetX/offsetY(px, 0): draw offset of the loop relative to the element —
//             0,0 sits ON the border (v2 FIX: v1 sat high-left at dpr>1, the canvas
//             translation was in CSS px not device px); nonzero is a deliberate
//             floating-halo look.
//   kbubble.detach(handle)
//   handle.puff(strength?) — programmatic pulse (e.g. on form success)
//   handle.opts — live options object (demo sliders mutate it directly)

(() => {
  if (window.kbubble) return

  const reduced = matchMedia?.("(prefers-reduced-motion: reduce)").matches

  // Sample the rounded-rect perimeter: base points + outward normals, even spacing.
  function buildLoop(w, h, r, N){
    r = Math.max(2, Math.min(r, w / 2, h / 2))
    const segs = []   // [len, fn(t)->{x,y,nx,ny}]
    const line = (x0, y0, x1, y1, nx, ny) => {
      const len = Math.hypot(x1 - x0, y1 - y0)
      segs.push([len, t => ({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, nx, ny })])
    }
    const arc = (cx, cy, a0, a1) => {
      const len = Math.abs(a1 - a0) * r
      segs.push([len, t => {
        const a = a0 + (a1 - a0) * t
        const nx = Math.cos(a), ny = Math.sin(a)
        return { x: cx + nx * r, y: cy + ny * r, nx, ny }
      }])
    }
    const H = Math.PI / 2
    line(r, 0, w - r, 0, 0, -1);        arc(w - r, r, -H, 0)
    line(w, r, w, h - r, 1, 0);         arc(w - r, h - r, 0, H)
    line(w - r, h, r, h, 0, 1);         arc(r, h - r, H, 2 * H)
    line(0, h - r, 0, r, -1, 0);        arc(r, r, 2 * H, 3 * H)
    const total = segs.reduce((s, [l]) => s + l, 0)
    const pts = []
    let si = 0, sOff = 0
    for(let i = 0; i < N; i++){
      let dist = i / N * total
      while(dist - sOff > segs[si][0]){ sOff += segs[si][0]; si++ }
      pts.push(segs[si][1]((dist - sOff) / segs[si][0]))
    }
    return pts
  }

  const handles = new Set()

  function attach(el, opts = {}){
    if(reduced) return null
    const cv = document.createElement("canvas")
    const ctx = cv.getContext && cv.getContext("2d")
    if(!ctx) return null

    const o = Object.assign({ bleed: 20, style: "ink", color: "", width: 1.6, points: 140,
                              tension: 28, spring: 14, damp: 2.2, ambient: 0.35, puff: 26,
                              spread: 0.12, iters: 1, smooth: 0, offsetX: 0, offsetY: 0, blur: null }, opts)
    if(getComputedStyle(el).position === "static") el.style.position = "relative"
    cv.style.cssText = `position:absolute;inset:${-o.bleed}px;width:calc(100% + ${o.bleed * 2}px);height:calc(100% + ${o.bleed * 2}px);pointer-events:none;`
    el.appendChild(cv)
    el.classList.add("kbubble-on")

    const st = { el, cv, ctx, o, d: null, v: null, pts: null, w: 0, h: 0, phase: [], last: 0,
                 hover: false, px: 0, py: 0, raf: 0, dead: false }

    function rebuild(){
      const rect = el.getBoundingClientRect()
      st.w = rect.width; st.h = rect.height
      if(!st.w || !st.h) return
      const dpr = Math.min(devicePixelRatio || 1, 2)
      cv.width = (st.w + o.bleed * 2) * dpr
      cv.height = (st.h + o.bleed * 2) * dpr
      // translation is in DEVICE px (v1 bug: passing CSS px here shifted the loop
      // high-left by bleed/2 on dpr-2 screens — the user's "offset to its high left")
      ctx.setTransform(dpr, 0, 0, dpr, (o.bleed + o.offsetX) * dpr, (o.bleed + o.offsetY) * dpr)
      const r = o.radius ?? (parseFloat(getComputedStyle(el).borderRadius) || 10)
      st.pts = buildLoop(st.w, st.h, r, o.points)
      if(!st.d){ st.d = new Float32Array(o.points); st.v = new Float32Array(o.points)
                 st.phase = Array.from({ length: o.points }, () => Math.random() * 7) }
    }
    rebuild()
    const onResize = () => rebuild()
    addEventListener("resize", onResize)

    const nearest = (x, y) => {
      let best = 0, bd = 1e9
      for(let i = 0; i < st.pts.length; i++){
        const dx = st.pts[i].x - x, dy = st.pts[i].y - y, d2 = dx * dx + dy * dy
        if(d2 < bd){ bd = d2; best = i }
      }
      return best
    }
    // a puff pushes the border INWARD around a point; the wave does the rest.
    // spread widens the puff from pinpoint to whole-border (v2): sigma grows with
    // spread until, near 1, every point gets the same push and pointer position
    // stops mattering visibly. Energy is normalised so widening the puff doesn't
    // multiply the total kick.
    function impulse(idx, strength){
      if(!st.pts) return
      const N = st.pts.length
      const spread = Math.min(Math.max(o.spread, 0), 1)
      if(spread >= 0.97){
        for(let i = 0; i < N; i++) st.v[i] -= strength * 0.3 * 0.22
        return
      }
      const sigma = 2 + spread * N * 0.45
      const win = Math.min(Math.ceil(sigma * 3), Math.floor(N / 2))
      const norm = 2 / Math.sqrt(sigma)   // keeps perceived kick roughly constant
      for(let k = -win; k <= win; k++){
        const g = Math.exp(-k * k / (2 * sigma * sigma))
        st.v[(idx + k + N) % N] -= strength * 0.3 * g * norm
      }
    }
    const local = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
    const onEnter = e => { st.hover = true; const [x, y] = local(e); impulse(nearest(x, y), o.puff * 0.45) }
    const onMove  = e => { const [x, y] = local(e)
      const sp = Math.hypot(x - st.px, y - st.py); st.px = x; st.py = y
      if(st.hover && sp > 1) impulse(nearest(x, y), Math.min(sp, 14) * 0.28) }
    const onLeave = () => { st.hover = false }
    const onDown  = e => { const [x, y] = local(e); impulse(nearest(x, y), o.puff) }
    el.addEventListener("pointerenter", onEnter)
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerleave", onLeave)
    el.addEventListener("pointerdown", onDown)

    function frame(now){
      window.__kbFrames = (window.__kbFrames || 0) + 1   // debug probe
      if(st.dead) return
      const dt = Math.min((now - (st.last || now)) / 1000, 1 / 30)
      st.last = now
      const { d, v, pts, o: op } = st
      if(pts){
        // Classic stable ripple integration (per-frame semantics): spread rate k must
        // stay < 0.5 or the highest spatial mode diverges — the first cut used
        // dt-scaled gains ~30x past that limit and the whole array went NaN in
        // under a second (found via the __kbFrames/__kbState probes).
        const N = pts.length, t = now / 1000
        const k = Math.min(op.tension / 60, 0.49)
        const s = op.spring / 600
        const decay = Math.exp(-op.damp * Math.max(dt, 1 / 120))
        const lim = op.bleed * 0.75
        // iters (v2): re-running the neighbour coupling raises the effective wave
        // speed — disturbances travel the loop faster and read as longer wavelengths
        // (stiff ring), while each sub-step stays under the k<0.5 stability limit.
        const iters = Math.max(1, Math.min(Math.round(op.iters), 10))
        for(let it = 0; it < iters; it++){
          const last = it === iters - 1
          for(let i = 0; i < N; i++){
            const lap = d[(i + N - 1) % N] + d[(i + 1) % N] - 2 * d[i]
            const acc = k * lap - (last ? s * d[i] - op.ambient * 0.05 * Math.sin(t * 1.3 + st.phase[i]) : 0)
            v[i] = (v[i] + acc) * (last ? decay : 1)
          }
          for(let i = 0; i < N; i++){
            d[i] += v[i] / iters
            if(d[i] > lim) d[i] = lim; else if(d[i] < -lim) d[i] = -lim
          }
        }
        // smooth (v2): low-pass the shape — box-average blend kills granular ripples
        // so only wide flexes survive (plastic/steel-ring feel).
        const sm = Math.min(Math.max(op.smooth, 0), 1)
        if(sm > 0){
          const r = 1 + Math.round(sm * 7), tmp = st.tmp || (st.tmp = new Float32Array(N))
          for(let i = 0; i < N; i++){
            let sum = 0
            for(let k2 = -r; k2 <= r; k2++) sum += d[(i + k2 + N) % N]
            tmp[i] = sum / (2 * r + 1)
          }
          const a = sm * 0.65
          for(let i = 0; i < N; i++) d[i] += (tmp[i] - d[i]) * a
        }
        ctx.clearRect(-op.bleed, -op.bleed, st.w + op.bleed * 2, st.h + op.bleed * 2)
        const P = i => { const p = pts[i % N]; const k = d[i % N]; return [p.x + p.nx * k, p.y + p.ny * k] }
        ctx.lineWidth = op.width
        ctx.lineCap = "round"
        if(op.style === "iridescent"){
          // soap film: short segments, hue walks the loop and drifts with time
          for(let i = 0; i < N; i++){
            const [x0, y0] = P(i), [x1, y1] = P(i + 1)
            ctx.strokeStyle = `hsla(${(i / N * 360 + t * 40) % 360}, 85%, 66%, .9)`
            ctx.shadowColor = ctx.strokeStyle
            ctx.shadowBlur = op.blur ?? 4
            ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
          }
          ctx.shadowBlur = 0
        } else {
          if(op.style === "glow"){ ctx.shadowColor = op.color || "rgba(47,111,237,.8)"; ctx.shadowBlur = op.blur ?? 7 }
          else if(op.blur > 0){ ctx.shadowColor = op.color || "rgba(29,35,42,.65)"; ctx.shadowBlur = op.blur }
          ctx.strokeStyle = op.color || "rgba(29,35,42,.65)"
          ctx.beginPath()
          let [mx, my] = P(0), [nx2, ny2] = P(1)
          ctx.moveTo((mx + nx2) / 2, (my + ny2) / 2)
          for(let i = 1; i <= N; i++){
            const [cx2, cy2] = P(i), [ex, ey] = P(i + 1)
            ctx.quadraticCurveTo(cx2, cy2, (cx2 + ex) / 2, (cy2 + ey) / 2)
          }
          ctx.stroke()
          ctx.shadowBlur = 0
        }
      }
      st.raf = requestAnimationFrame(frame)
    }
    st.raf = requestAnimationFrame(frame)
    el.__kbState = st   // debug probe

    const handle = {
      el,
      opts: o,   // live — demo sliders mutate this directly (geometry opts need rebuild())
      rebuild,
      puff: (s = o.puff) => impulse(Math.floor(Math.random() * o.points), s),
      destroy(){
        st.dead = true; cancelAnimationFrame(st.raf); removeEventListener("resize", onResize)
        el.removeEventListener("pointerenter", onEnter); el.removeEventListener("pointermove", onMove)
        el.removeEventListener("pointerleave", onLeave); el.removeEventListener("pointerdown", onDown)
        cv.remove(); el.classList.remove("kbubble-on")
        handles.delete(handle)
      }
    }
    handles.add(handle)
    return handle
  }

  window.kbubble = { attach, detach: h => h?.destroy?.(), _handles: handles }
})()

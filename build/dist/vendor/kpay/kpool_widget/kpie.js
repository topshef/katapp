// kpie.js — standalone threshold pie widget: the ORBIT picture, plain SVG, no deps.
//
// Usage:
//   <script src="kpie.js"></script>
//   await window.kpie.render(containerEl, { keyInfo, signedPubkeys, neutral })
//   window.kpie.wireHover(scopeEl)   // hover a wedge or a key row → both light
//
// KPIE-ORBIT1 (2026-09-11): replaces the amCharts + d3 family tree. Same picture
// as KPOP (kpos public_html/sign/kpop/js/kring.js orbit()), re-cut for signing:
//   inner ring   the threshold: m black wedges of n, the rest grey — what the
//                chain requires, nothing else
//   outer ring   one wedge per MEMBER, in the key's own order, clockwise from
//                12 o'clock:  green  signed
//                             orange still needed — unsigned, and its group is
//                                    not met yet
//                             grey   spare — unsigned, but its group is already
//                                    met, so it is not needed
//                a nested group's wedge is green when the group is met, else
//                orange / grey by the same rule as a key
//   moons        each nested group is its own pie hung off the midpoint of its
//                wedge, straight outward; its wedges start on the side facing
//                its parent and run clockwise; its own groups hang off it the
//                same way. The picture grows out from the root, so a branch
//                sits where its wedge is, at every depth.
// neutral (account shown for reference, no signature needed): the same shapes
// in two-tone grey, so nothing reads as pending.
// Every wedge carries data-leaf (a key's normalized hex) or data-group (an
// index path, '0.2' = third member of the first member) + data-leaves (the
// hexes under it), so the key list can light a key, or a whole branch, and back.
// The old family-tree layout only ever drew one level of nesting and a branch
// sat nowhere near its wedge; the amCharts appear() animation is replaced by a
// CSS scale-in per pie, moons a beat after their parent.

;(function(global) {
  'use strict'

  // keynorm.js is the canonical normalizer shared by model.js + view.js (SIGN-NORM1).
  // kpie is a STANDALONE, dependency-free widget (classic <script>, not an ES module),
  // so it keeps this local copy by design. view.js feeds an already-normalized tree +
  // signedPubkeys, so this is a defensive idempotent second pass. Keep these prefixes
  // in sync with keynorm.KEY_PREFIXES.
  const KEY_DER_PREFIXES = [
    '302a300506032b6570032100',                          // ED25519
    '302d300706052b8104000a032200',                      // ECDSA secp256k1 DER
    '3036301006072a8648ce3d020106052b8104000a032200',    // ECDSA secp256k1 SPKI
  ]
  function normalizeKey(key) {
    if (!key) return key
    let k = String(key).toLowerCase()
    for (const p of KEY_DER_PREFIXES) if (k.startsWith(p)) { k = k.slice(p.length); break }
    return k
  }

  // ── key tree → nodes ───────────────────────────────────────────────────────
  // { hex } for a key; { m, n, kids, signed, met } for a group. A KeyList has
  // threshold null/absent = ALL must sign. Member order is the key's own.
  function toNode(keyNode) {
    if (keyNode == null) return null
    if (typeof keyNode === 'string') return { hex: normalizeKey(keyNode) }
    if (!Array.isArray(keyNode.keys)) {
      const raw = keyNode.key ?? keyNode.ed25519 ?? keyNode.ECDSASecp256k1 ?? null
      return raw != null ? { hex: normalizeKey(String(raw)) } : null
    }
    const kids = keyNode.keys.map(toNode).filter(Boolean)
    return { m: keyNode.threshold ?? kids.length, n: kids.length, kids }
  }
  const isLeaf = n => typeof n.hex === 'string'
  const leavesOf = n => isLeaf(n) ? [n.hex] : n.kids.flatMap(leavesOf)

  // signed count and met flag on every group, bottom-up
  function score(node, signed) {
    if (isLeaf(node)) { node.signed = signed.has(node.hex); return node.signed }
    let c = 0
    for (const k of node.kids) if (score(k, signed)) c++
    node.signedCount = c
    node.met = c >= node.m
    return node.met
  }
  // a member's colour: signed / needed / spare — needed only while its group is
  // not met; once the group is met, the rest are spare
  const stateOf = (kid, parent) => (isLeaf(kid) ? kid.signed : kid.met) ? 'signed' : parent.met ? 'spare' : 'needed'

  const FILL = {
    live:    { signed: '#56c857', needed: '#f5a623', spare: '#F0F0F0', m: '#000000', rest: '#D9D9D9' },
    neutral: { signed: '#a1a1aa', needed: '#dadade', spare: '#F0F0F0', m: '#000000', rest: '#D9D9D9' },
  }
  const BG = '#ffffff'   // hairline between wedges — the card is white

  // ── SVG ────────────────────────────────────────────────────────────────────
  const NS = 'http://www.w3.org/2000/svg'
  const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e }

  // an annular wedge from a0 to a1 (radians, clockwise from 12 o'clock)
  function wedge(cx, cy, r0, r1, a0, a1, fill) {
    const p = (r, a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]
    if (a1 - a0 >= 2 * Math.PI - 1e-6) {   // a full ring: two arcs, or the path collapses
      const d = `M${p(r1, 0)} A${r1},${r1} 0 1 1 ${p(r1, Math.PI)} A${r1},${r1} 0 1 1 ${p(r1, 2 * Math.PI)} ` +
        (r0 ? `M${p(r0, 0)} A${r0},${r0} 0 1 0 ${p(r0, Math.PI)} A${r0},${r0} 0 1 0 ${p(r0, 2 * Math.PI)}` : '')
      return svgEl('path', { d, fill, 'fill-rule': 'evenodd', stroke: BG, 'stroke-width': 1 })
    }
    const large = a1 - a0 > Math.PI ? 1 : 0
    const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0)
    const d = r0 ? `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`
      : `M${cx},${cy} L${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} Z`
    return svgEl('path', { d, fill, stroke: BG, 'stroke-width': 1 })
  }
  const title = (el, text) => { const t = document.createElementNS(NS, 'title'); t.textContent = text; el.appendChild(t) }
  const WORD = { signed: 'signed', needed: 'still needed', spare: 'not needed — its group is already met' }

  // one node's pie into `g` at (cx, cy) with outer radius R; wedge 0 starts at
  // `start` (radians clockwise from 12 o'clock); `path` is the node's index path
  function pie(g, node, cx, cy, R, start, path, fill, level) {
    const grp = svgEl('g', { class: 'kpie-pie', style: `transform-origin:${cx}px ${cy}px; animation-delay:${level * 140}ms` })
    const n = isLeaf(node) ? 1 : node.n, m = isLeaf(node) ? 1 : node.m
    const kids = isLeaf(node) ? [node] : node.kids
    const TAU = 2 * Math.PI, from = i => start + i / n * TAU, to = i => start + (i + 1) / n * TAU
    const leaves = isLeaf(node) ? '' : leavesOf(node).join(' ')
    // inner: threshold m of n — hovering it is hovering this group
    for (let i = 0; i < n; i++) {
      const w = wedge(cx, cy, 0, R * 0.58, from(i), to(i), i < m ? fill.m : fill.rest)
      if (!isLeaf(node)) { w.setAttribute('data-group', path); w.setAttribute('data-leaves', leaves); title(w, `${m} of ${n} must sign · ${node.signedCount} signed${node.met ? ' · met' : ''}`) }
      grp.appendChild(w)
    }
    // outer: one wedge per member, in order
    kids.forEach((k, i) => {
      const st = isLeaf(node) ? (k.signed ? 'signed' : 'needed') : stateOf(k, node)
      const w = wedge(cx, cy, R * 0.66, R, from(i), to(i), fill[st])
      if (isLeaf(k)) { w.setAttribute('data-leaf', k.hex); title(w, `…${k.hex.slice(-4)} · ${WORD[st]}`) }
      else { w.setAttribute('data-group', path ? `${path}.${i}` : `${i}`); w.setAttribute('data-leaves', leavesOf(k).join(' ')); title(w, `group ${k.m} of ${k.n} · ${k.met ? 'met' : WORD[st]}`) }
      grp.appendChild(w)
    })
    grp.appendChild(svgEl('circle', { cx, cy, r: R, fill: 'none', stroke: '#e5e7eb', 'stroke-width': 1 }))
    grp.appendChild(svgEl('circle', { cx, cy, r: R * 0.58, fill: 'none', stroke: '#e5e7eb', 'stroke-width': 1 }))
    g.appendChild(grp)
  }

  // the orbit: root at (0, 0) starting at 12 o'clock; each nested group a moon
  // off the midpoint of its wedge, half its parent's size, and no wider than
  // the gap between neighbouring moons allows; the viewBox fits whatever grew
  function orbit(node, { size = 96, neutral = false } = {}) {
    const R = size / 2 - 2, TAU = 2 * Math.PI, GAP = 5
    const pies = [], spokes = []
    function place(n, cx, cy, r, start, path, level) {
      pies.push({ n, cx, cy, r, start, path, level })
      if (isLeaf(n)) return
      const k = n.n
      n.kids.forEach((kid, i) => {
        if (isLeaf(kid)) return
        const mid = start + (i + 0.5) / k * TAU
        let rm = r * 0.5
        if (k > 1) { const sn = Math.sin(Math.PI / k); rm = Math.min(rm, ((r + GAP) * sn - 1.5) / (1 - sn)) }   // neighbours' moons must not touch
        rm = Math.max(rm, 7)
        const d = r + GAP + rm, sx = Math.sin(mid), cs = Math.cos(mid)
        const mx = cx + d * sx, my = cy - d * cs
        spokes.push([cx + r * sx, cy - r * cs, mx - rm * sx, my + rm * cs])
        place(kid, mx, my, rm, mid + Math.PI, path ? `${path}.${i}` : `${i}`, level + 1)
      })
    }
    place(node, 0, 0, R, 0, '', 0)
    const x0 = Math.min(...pies.map(p => p.cx - p.r)) - 2, x1 = Math.max(...pies.map(p => p.cx + p.r)) + 2
    const y0 = Math.min(...pies.map(p => p.cy - p.r)) - 2, y1 = Math.max(...pies.map(p => p.cy + p.r)) + 2
    const svg = svgEl('svg', { viewBox: `${x0} ${y0} ${x1 - x0} ${y1 - y0}`, class: 'kpie-orbit', role: 'img' })
    const fill = neutral ? FILL.neutral : FILL.live
    for (const p of pies) pie(svg, p.n, p.cx, p.cy, p.r, p.start, p.path, fill, p.level)
    for (const [a, b, c, d] of spokes) svg.appendChild(svgEl('path', { d: `M${a},${b} L${c},${d}`, fill: 'none', stroke: '#ccc', 'stroke-width': 1.5, class: 'kpie-link' }))
    return svg
  }

  // ── hover ──────────────────────────────────────────────────────────────────
  // Anything in `scope` with data-leaf (a wedge, a key row) lights every element
  // with that hex; a data-group wedge lights every wedge of that group and every
  // leaf under it. The outline is an overlay path appended last to each svg —
  // the hovered wedge is never moved in the DOM (moving the element under the
  // pointer leaves some browsers without a mouseout, and the highlight sticks).
  // One thing lit at a time, all of it cleared on leaving the scope.
  function wireHover(scope) {
    if (!scope || scope._kpieHover) return
    scope._kpieHover = true
    const clear = () => { scope.querySelectorAll('.kpie-hi').forEach(x => x.classList.remove('kpie-hi')); scope.querySelectorAll('path.kpie-hl').forEach(x => x.remove()) }
    const mark = sel => { for (const x of scope.querySelectorAll(sel)) { x.classList.add('kpie-hi'); if (x.tagName === 'path') x.ownerSVGElement.appendChild(svgEl('path', { d: x.getAttribute('d'), class: 'kpie-hl' })) } }
    const light = t => {
      clear()
      if ('leaf' in t.dataset) return mark(`[data-leaf="${t.dataset.leaf}"]`)
      mark(`[data-group="${t.dataset.group}"]`)
      for (const hex of (t.dataset.leaves || '').split(' ').filter(Boolean)) mark(`[data-leaf="${hex}"]`)
    }
    const hit = e => e.target.closest && e.target.closest('[data-leaf],[data-group]')
    scope.addEventListener('mouseover', e => { const t = hit(e); if (t) light(t) })
    scope.addEventListener('mouseout', e => { const t = hit(e); if (t && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-leaf],[data-group]') === t)) clear() })
    scope.addEventListener('mouseleave', clear)
  }

  function injectCSS() {
    if (document.getElementById('kpie-css')) return
    const s = document.createElement('style')
    s.id = 'kpie-css'
    s.textContent = `
      .kpie-orbit { display: block; width: 100%; height: auto; overflow: visible }
      .kpie-orbit path[data-leaf], .kpie-orbit path[data-group] { cursor: pointer }
      .kpie-orbit path.kpie-hl { fill: none; stroke: #ffd600; stroke-width: 2.5; pointer-events: none }
      .kpie-pie { animation: kpie-in .55s cubic-bezier(.2,.8,.3,1) both }
      @keyframes kpie-in { from { opacity: 0; transform: scale(.55) } to { opacity: 1; transform: scale(1) } }
      @media (prefers-reduced-motion: reduce) { .kpie-pie { animation: none } }
    `
    document.head.appendChild(s)
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  //   hoverScope  an ancestor holding the pie AND the key rows (rows carry
  //               data-leaf = normalized hex): hover is wired across it
  async function render(container, { keyInfo, signedPubkeys = [], neutral = false, hoverScope = null }) {
    if (!keyInfo) return
    const node = toNode(keyInfo)
    if (!node) return
    score(node, new Set(signedPubkeys.map(normalizeKey)))
    injectCSS()
    container.innerHTML = ''
    container.style.overflow = 'visible'
    container.style.height = 'auto'
    container.appendChild(orbit(node, { size: 96, neutral }))
    wireHover(hoverScope || container)
  }

  global.kpie = { render, wireHover }

})(window)

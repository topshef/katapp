// TRAILUTURN1 — the geometry, on the exact layout from the operator's screenshot: one sender at
// the bottom, four receivers stacked above. Every curve must be monotone along its own S→D
// axis (no U-turn), bow no more than the cap, and 1→1 must stay a straight line.
import { throughPoint } from '../public_html/vendor/kpay/kpool_widget/txflow.js'
let failed = 0
const ok = (c, m, x) => { if (c) console.log('  PASS ' + m); else { failed++; console.log('  FAIL ' + m + (x !== undefined ? ' — ' + x : '')) } }
const centroid = pts => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })
const bez = (S, C, D, t) => ({ x: (1-t)*(1-t)*S.x + 2*(1-t)*t*C.x + t*t*D.x, y: (1-t)*(1-t)*S.y + 2*(1-t)*t*C.y + t*t*D.y })
const ctrlOf = (S, D, M) => ({ x: 2*M.x - (S.x+D.x)/2, y: 2*M.y - (S.y+D.y)/2 })
// project a point onto the S→D axis, as a fraction of its length
const along = (S, D, P) => { const vx=D.x-S.x, vy=D.y-S.y; return ((P.x-S.x)*vx + (P.y-S.y)*vy) / (vx*vx+vy*vy) }
const across = (S, D, P) => { const vx=D.x-S.x, vy=D.y-S.y, len=Math.hypot(vx,vy); return ((P.x-S.x)*(-vy) + (P.y-S.y)*vx) / len }

// the screenshot: sender chip at bottom-left, receiver chips at right, 4 rows above
const S = { x: 240, y: 1850 }
const Ds = [{ x: 660, y: 910 }, { x: 610, y: 1145 }, { x: 610, y: 1380 }, { x: 610, y: 1620 }]
const G = centroid([S, ...Ds])
console.log('the screenshot geometry (1→4)')
console.log('  centroid G at y=' + Math.round(G.y) + ' — above two of the four targets, which is what caused the loops')
const oldCtrl = (S, D) => ({ x: 2*G.x - (S.x+D.x)/2, y: 2*G.y - (S.y+D.y)/2 })
let oldLoops = 0
Ds.forEach(D => { let mx = -1; for (let t = 0; t <= 1; t += 0.02) mx = Math.max(mx, along(S, D, bez(S, oldCtrl(S, D), D, t))); if (mx > 1.01) oldLoops++ })
ok(oldLoops > 0, 'the OLD rule really did overshoot on this layout (reproduced: ' + oldLoops + ' of 4 curves went past their target)')

Ds.forEach((D, i) => {
  const M = throughPoint(S, D, G), C = ctrlOf(S, D, M)
  let prev = -1, mono = true, maxAlong = -1, maxAcross = 0
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const P = bez(S, C, D, t), a = along(S, D, P)
    if (a < prev - 1e-9) mono = false
    prev = a; maxAlong = Math.max(maxAlong, a); maxAcross = Math.max(maxAcross, Math.abs(across(S, D, P)))
  }
  const len = Math.hypot(D.x-S.x, D.y-S.y)
  ok(mono, `curve ${i+1}: never turns back along its own axis`)
  ok(maxAlong <= 1.0001, `curve ${i+1}: never goes past its target`, maxAlong.toFixed(3))
  ok(maxAcross <= 0.35 * len + 1e-6, `curve ${i+1}: bows no more than 35% of its length`, (maxAcross/len).toFixed(3))
})

console.log('1→1 stays a straight line')
{
  const A = { x: 100, y: 500 }, B = { x: 400, y: 200 }, G1 = centroid([A, B])
  const M = throughPoint(A, B, G1), C = ctrlOf(A, B, M)
  let maxAcross = 0
  for (let t = 0; t <= 1; t += 0.05) maxAcross = Math.max(maxAcross, Math.abs(across(A, B, bez(A, C, B, t))))
  ok(maxAcross < 1e-6, 'zero sideways excursion — a straight glide, as before', maxAcross)
}

console.log('a split payment (2→3) — the other case you saw twist')
{
  const Ss = [{ x: 240, y: 1600 }, { x: 240, y: 1850 }]
  const Ds2 = [{ x: 640, y: 900 }, { x: 640, y: 1150 }, { x: 640, y: 1400 }]
  const G2 = centroid([...Ss, ...Ds2])
  let bad = 0
  for (let j = 0; j < 3; j++) {
    const s = Ss[j % 2], d = Ds2[j % 3], M = throughPoint(s, d, G2), C = ctrlOf(s, d, M)
    let prev = -1
    for (let t = 0; t <= 1.0001; t += 0.01) { const a = along(s, d, bez(s, C, d, t)); if (a < prev - 1e-9 || a > 1.0001) bad++; prev = a }
  }
  ok(bad === 0, 'no leg overshoots or reverses', bad)
}
console.log(failed ? `\n${failed} failed` : '\nall U-turn geometry checks passed')
process.exit(failed ? 1 : 0)

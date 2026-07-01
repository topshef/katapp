// txflow.js — asset-movement animation (TX-FLOW-ANIM1 v1).
//
// One CONTINUOUS ghost per travelling asset: it clones a source chip and glides the whole
// way S→D on a single quadratic Bézier — no stop, no pause. The control point
//   ctrl = 2·G − (S+D)/2   ⟹   B(0.5) = G exactly,
// so the curve passes THROUGH the pool centroid G at its midpoint. For 1→1, G is the midpoint
// of S,D so ctrl becomes that midpoint and the quadratic collapses to a perfectly straight,
// uniform line (clean glide, no arc, no pop). For N→M every ghost bows through the SHARED
// centroid, so they converge/diverge at the same instant without ever stopping.
//
// Extras: a very subtle PARALLEL pool "puff" at the midpoint time (never blocks; skipped for
// 1→1), and a fading/shrinking blurred TRAIL behind each ghost (cloud/vapour-trail feel).
// Asset flows are STAGGERED so you can read each asset separately. No invented per-pair
// routing — ghosts are round-robined source↔dest; identity is scrambled at the pool.
//
// Motion via WAAPI keyframes sampling the Bézier; trail via getBoundingClientRect sampling
// of the in-flight ghost. Over a .txflow-layer overlay; ports drawTradeLine's coordinates.

// ── ONE speed knob for the MOTION (hard-coded for development; drop toward 1 for production) ──
const SLOW = 2.25
const TRAVEL_MS  = 540 * SLOW    // per-asset glide (~1.2s in dev)
const FRIZZ_MS   = 160 * SLOW    // pool puff
const STAGGER_MS = 220 * SLOW    // gap between asset flows (~0.5s in dev)
// Trail lifetime is DECOUPLED from SLOW on purpose (per user): we want the dotted trajectory
// to linger well past the glide so you see the whole path as a fading dotted line. Exaggerated
// for now — dial back later. Bump for an even longer-lived line.
const TRAIL_MS   = 5000
const TRAIL_EVERY = 55           // ms between trail samples (constant → denser trail)
const LIFT = 0.06                // subtle midpoint scale lift (NOT a shrink)
const FRIZZ_OPACITY = 0.14       // very soft puff

const centerOf = (el, base) => {
	const r = el.getBoundingClientRect()
	return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top }
}
const centroid = pts => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })

function ensureLayer(container) {
	let layer = [...container.children].find(c => c.classList?.contains('txflow-layer'))
	if (!layer) { layer = document.createElement('div'); layer.className = 'txflow-layer'; container.appendChild(layer) }
	layer.innerHTML = ''
	return layer
}

// A fading, shrinking, blurred glow dropped at the ghost's current position — the vapour
// trail. (Simple glow for now; a blurred chip clone would be the richer version later.)
function trailMark(layer, base, ghost) {
	const r = ghost.getBoundingClientRect()
	const mark = document.createElement('div')
	mark.className = 'txflow-trail'
	mark.style.left = (r.left + r.width / 2 - base.left) + 'px'
	mark.style.top = (r.top + r.height / 2 - base.top) + 'px'
	layer.appendChild(mark)
	// hold the mark at full opacity for a while so the whole trajectory reads as a solid dotted
	// line, THEN fade + shrink slowly — the line lingers and dissipates rather than fading fast.
	mark.animate([
		{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0.4 },
		{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0.4, offset: 0.4 },
		{ transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 }
	], { duration: TRAIL_MS, easing: 'ease-out' }).onfinish = () => mark.remove()
}

// One continuous ghost gliding A→B along quadratic A,ctrl,B, dropping a trail as it goes.
// ease-in-out ⇒ fastest through the middle, so the centroid is never a pause.
function travel(layer, base, chip, A, B, ctrl, onDone) {
	return new Promise(res => {
		const ghost = chip.cloneNode(true)
		ghost.className = 'txcard-chip txflow-ghost'
		ghost.removeAttribute('data-asset-key')
		ghost.style.width = chip.getBoundingClientRect().width + 'px'
		layer.appendChild(ghost)

		const steps = 24, frames = []
		for (let i = 0; i <= steps; i++) {
			const t = i / steps, mt = 1 - t
			const x = mt * mt * A.x + 2 * mt * t * ctrl.x + t * t * B.x
			const y = mt * mt * A.y + 2 * mt * t * ctrl.y + t * t * B.y
			const s = 1 + LIFT * Math.sin(Math.PI * t)
			const op = t < 0.12 ? t / 0.12 : t > 0.88 ? (1 - t) / 0.12 : 1
			frames.push({ transform: `translate(${x}px,${y}px) translate(-50%,-50%) scale(${s.toFixed(3)})`, opacity: op, offset: t })
		}
		const trail = setInterval(() => trailMark(layer, base, ghost), TRAIL_EVERY)
		const anim = ghost.animate(frames, { duration: TRAVEL_MS, easing: 'ease-in-out', fill: 'forwards' })
		anim.onfinish = () => { clearInterval(trail); try { onDone?.() } finally { ghost.remove(); res() } }
	})
}

// The parallel "exhaust" puff at G — soft, low-opacity, non-blocking. Never awaited.
function frizz(layer, G, count) {
	const el = document.createElement('div')
	el.className = 'txflow-frizz'
	el.style.left = G.x + 'px'; el.style.top = G.y + 'px'
	layer.appendChild(el)
	const mag = Math.min(2, 0.8 + count * 0.1)
	const a = el.animate([
		{ transform: 'translate(-50%,-50%) scale(0.3)', opacity: FRIZZ_OPACITY },
		{ transform: `translate(-50%,-50%) scale(${mag})`, opacity: FRIZZ_OPACITY * 0.45, offset: 0.6 },
		{ transform: `translate(-50%,-50%) scale(${(mag * 1.4).toFixed(2)})`, opacity: 0 }
	], { duration: FRIZZ_MS, easing: 'ease-out' })
	a.onfinish = () => el.remove()
}

function solidify(chip) {
	chip.classList.add('txflow-landed')
	setTimeout(() => chip.classList.remove('txflow-landed'), 700)
}

async function animateAsset(layer, base, send, receive) {
	if (!send.length || !receive.length) return   // one-sided (e.g. operator HBAR fee) — nothing to travel to
	const src = send.map(c => centerOf(c, base))
	const dst = receive.map(c => centerOf(c, base))
	const G = centroid([...src, ...dst])

	// only a real many-to-* flow gets the (subtle, parallel) pool puff — 1→1 stays a clean glide
	if (send.length > 1 || receive.length > 1)
		setTimeout(() => frizz(layer, G, send.length + receive.length), TRAVEL_MS * 0.5)

	// one continuous ghost per max(sources, dests), round-robined so every source AND every
	// destination is touched; each glides its own S→D curve through the shared centroid.
	const k = Math.max(send.length, receive.length)
	await Promise.all(Array.from({ length: k }, (_, j) => {
		const S = src[j % src.length], D = dst[j % dst.length]
		const ctrl = { x: 2 * G.x - (S.x + D.x) / 2, y: 2 * G.y - (S.y + D.y) / 2 }
		return travel(layer, base, send[j % send.length], S, D, ctrl, () => solidify(receive[j % receive.length]))
	}))
}

// Run across every asset flow, STAGGERED (asset-by-asset), so each asset reads separately.
// Guarded against re-entry.
export async function flowTravel(container) {
	if (container._flowRunning || typeof container.querySelectorAll !== 'function') return
	container._flowRunning = true
	try {
		const layer = ensureLayer(container)
		const base = container.getBoundingClientRect()
		const byAsset = new Map()
		container.querySelectorAll('.txcard-chip[data-asset-key]').forEach(chip => {
			if (chip.classList.contains('txflow-ghost')) return
			const key = chip.dataset.assetKey
			const side = chip.closest('.txcard-send') ? 'send' : chip.closest('.txcard-receive') ? 'receive' : null
			if (!key || !side) return
			const g = byAsset.get(key) || { send: [], receive: [] }
			g[side].push(chip)
			byAsset.set(key, g)
		})
		const assets = [...byAsset.values()]
		await Promise.all(assets.map((g, i) =>
			new Promise(res => setTimeout(() => animateAsset(layer, base, g.send, g.receive).then(res), i * STAGGER_MS))
		))
		// NB: do NOT remove the layer here — the trail marks outlive the glide (TRAIL_MS) and
		// self-remove; the (then-empty) layer is reused and cleared on the next preview.
	} finally {
		container._flowRunning = false
	}
}

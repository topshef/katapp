// txflow.js — asset-movement animation (TX-FLOW-ANIM1 v1).
//
// One CONTINUOUS ghost per travelling asset: it clones a source chip, rises slightly and
// glides all the way to a destination along a single smooth quadratic Bézier — no stop, no
// pause. The curve is built so it passes THROUGH the pool centroid G at its midpoint:
//   ctrl = 2·G − (S+D)/2   ⟹   B(0.5) = G exactly.
// For a 1→1 transfer G is just the midpoint of S,D, so ctrl becomes that midpoint and the
// quadratic collapses to a perfectly straight, uniform line S→D (smooth glide, no arc, no
// pop). For N→M every ghost's curve bows through the SHARED centroid, so they visually
// converge and diverge at the same instant — the "merge" reads without ever stopping.
//
// The pool "puff" (a car's exhaust cloud, not a wall it hits) is a SEPARATE, very subtle,
// parallel effect fired at the midpoint time — it never holds up the chips. Skipped entirely
// for true 1→1. No invented per-pair routing: ghosts are round-robined source↔dest purely to
// have something to carry; identity is meant to be scrambled at the pool (fungibility).
//
// Motion via WAAPI keyframes sampling the Bézier (no offset-path quirks), over a .txflow-layer
// overlay; ports drawTradeLine's coordinate approach.

// ── tuning (slowed ~3× for development — tighten once the feel is agreed) ──
const TRAVEL_MS = 1600
const FRIZZ_MS = 700
const LIFT = 0.06        // subtle scale bump at midpoint ("rise toward viewer"); NOT a shrink
const FRIZZ_OPACITY = 0.14   // very soft puff

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

// One continuous ghost gliding A→B along quadratic A,ctrl,B. Fades in at the start, out at the
// end (as the destination solidifies); a tiny scale lift at the midpoint. ease-in-out keeps it
// fastest through the middle, so the centroid is never a pause.
function travel(layer, chip, A, B, ctrl, onDone) {
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
		const anim = ghost.animate(frames, { duration: TRAVEL_MS, easing: 'ease-in-out', fill: 'forwards' })
		anim.onfinish = () => { try { onDone?.() } finally { ghost.remove(); res() } }
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

	// only a real many-to-* flow gets a (subtle, parallel) pool puff — 1→1 stays a clean glide
	if (send.length > 1 || receive.length > 1)
		setTimeout(() => frizz(layer, G, send.length + receive.length), TRAVEL_MS * 0.5)

	// one continuous ghost per max(sources, dests), round-robined so every source AND every
	// destination is touched; each glides its own S→D curve through the shared centroid.
	const k = Math.max(send.length, receive.length)
	await Promise.all(Array.from({ length: k }, (_, j) => {
		const S = src[j % src.length], D = dst[j % dst.length]
		const ctrl = { x: 2 * G.x - (S.x + D.x) / 2, y: 2 * G.y - (S.y + D.y) / 2 }
		return travel(layer, send[j % send.length], S, D, ctrl, () => solidify(receive[j % receive.length]))
	}))
}

// Run across every asset flow concurrently. Guarded against re-entry.
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
		await Promise.all([...byAsset.values()].map(g => animateAsset(layer, base, g.send, g.receive)))
		layer.remove()
	} finally {
		container._flowRunning = false
	}
}

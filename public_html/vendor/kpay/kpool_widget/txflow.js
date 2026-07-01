// txflow.js — asset-movement animation (TX-FLOW-ANIM1 v1).
//
// One CONTINUOUS ghost per travelling asset: it clones a source chip and glides the whole
// way S→D on a single quadratic Bézier — no stop, no pause. The control point
//   ctrl = 2·G − (S+D)/2   ⟹   B(0.5) = G exactly,
// so the curve passes THROUGH the pool centroid G at its midpoint. For 1→1, G is the midpoint
// of S,D so ctrl becomes that midpoint and the quadratic collapses to a perfectly straight,
// uniform line (clean glide). For N→M every ghost bows through the SHARED centroid, so they
// converge/diverge at the same instant without ever stopping.
//
// Layering (fixes dots-over-chips): the TRAIL layer sits ABOVE the card bodies but BELOW the
// chips (chips get z-index:2, trail z-index:1) and the chips are OPAQUE — so the dotted trail
// reads across the card body yet is cleanly obscured by any chip it passes under. Travelling
// ghosts + the pool puff are on a FRONT layer (z-index:3), topmost.
//
// Source→ghost / dest→solid: as an asset departs, its SOURCE chips turn to ghosts and each
// DESTINATION solidifies on landing — so the preview ends swapped (which is also how a real
// consensus should end). The swap is held briefly then reverted so the preview is replayable.
//
// Per-asset trail COLOUR: a stable hue derived from the asset key (HBAR stays blue) so each
// asset's trajectory is distinguishable. Swap for a lookup table later if brand colours wanted.

// ── ONE speed knob for the MOTION (hard-coded for dev; drop toward 1 for production) ──
const SLOW = 1
const TRAVEL_MS  = 540 * SLOW    // per-asset glide
const FRIZZ_MS   = 160 * SLOW    // pool puff
const STAGGER_MS = 220 * SLOW    // gap between asset flows
const HOLD_MS    = 800 * SLOW    // how long the swapped end-state holds before reverting (replayable preview)
// Trail lifetime is DECOUPLED from SLOW on purpose (per user): the dotted trajectory lingers
// well past the glide so you see the whole path. Exaggerated for now — dial back later.
const TRAIL_MS   = 5000
const TRAIL_EVERY = 3            // ms between trail samples — very dense (~10× denser). NB density × TRAIL_MS = many live nodes; fine for a preview.
const LIFT = 0.06                // subtle midpoint scale lift (NOT a shrink)
const FRIZZ_OPACITY = 0.14       // very soft puff

const centerOf = (el, base) => {
	const r = el.getBoundingClientRect()
	return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top }
}
const centroid = pts => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })

// Stable hue per asset (HBAR keeps the familiar blue). Simple + zero-maintenance.
function assetHue(key) {
	if (key === 'tinybar') return 217
	let h = 0
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
	return h % 360
}

function mkLayer(container, cls) {
	let layer = [...container.children].find(c => c.classList?.contains(cls))
	if (!layer) { layer = document.createElement('div'); layer.className = cls; container.appendChild(layer) }
	layer.innerHTML = ''
	return layer
}

// A tiny, barely-blurred, per-asset-coloured dot dropped at the ghost's current position — the
// dotted trajectory. Held at full opacity a while (so the whole line reads) then fades slowly.
function trailMark(back, base, ghost, hue) {
	const r = ghost.getBoundingClientRect()
	const mark = document.createElement('div')
	mark.className = 'txflow-trail'
	mark.style.left = (r.left + r.width / 2 - base.left) + 'px'
	mark.style.top = (r.top + r.height / 2 - base.top) + 'px'
	mark.style.background = `radial-gradient(circle, hsl(${hue} 80% 62% / .6) 0%, hsl(${hue} 80% 62% / 0) 70%)`
	back.appendChild(mark)
	mark.animate([
		{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0.45 },
		{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0.45, offset: 0.4 },
		{ transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 }
	], { duration: TRAIL_MS, easing: 'ease-out' }).onfinish = () => mark.remove()
}

// One continuous ghost (front layer) gliding A→B along quadratic A,ctrl,B, dropping a coloured
// trail (trail layer) as it goes. ease-in-out ⇒ fastest through the middle (centroid never pauses).
function travel(front, back, base, chip, A, B, ctrl, hue, onDone) {
	return new Promise(res => {
		const ghost = chip.cloneNode(true)
		ghost.className = 'txcard-chip txflow-ghost'
		ghost.removeAttribute('data-asset-key')
		ghost.style.width = chip.getBoundingClientRect().width + 'px'
		front.appendChild(ghost)

		const steps = 24, frames = []
		for (let i = 0; i <= steps; i++) {
			const t = i / steps, mt = 1 - t
			const x = mt * mt * A.x + 2 * mt * t * ctrl.x + t * t * B.x
			const y = mt * mt * A.y + 2 * mt * t * ctrl.y + t * t * B.y
			const s = 1 + LIFT * Math.sin(Math.PI * t)
			const op = t < 0.12 ? t / 0.12 : t > 0.88 ? (1 - t) / 0.12 : 1
			frames.push({ transform: `translate(${x}px,${y}px) translate(-50%,-50%) scale(${s.toFixed(3)})`, opacity: op, offset: t })
		}
		const trail = setInterval(() => trailMark(back, base, ghost, hue), TRAIL_EVERY)
		const anim = ghost.animate(frames, { duration: TRAVEL_MS, easing: 'ease-in-out', fill: 'forwards' })
		anim.onfinish = () => { clearInterval(trail); try { onDone?.() } finally { ghost.remove(); res() } }
	})
}

// The parallel "exhaust" puff at G — soft, low-opacity, non-blocking. Never awaited.
function frizz(front, G, count) {
	const el = document.createElement('div')
	el.className = 'txflow-frizz'
	el.style.left = G.x + 'px'; el.style.top = G.y + 'px'
	front.appendChild(el)
	const mag = Math.min(2, 0.8 + count * 0.1)
	const a = el.animate([
		{ transform: 'translate(-50%,-50%) scale(0.3)', opacity: FRIZZ_OPACITY },
		{ transform: `translate(-50%,-50%) scale(${mag})`, opacity: FRIZZ_OPACITY * 0.45, offset: 0.6 },
		{ transform: `translate(-50%,-50%) scale(${(mag * 1.4).toFixed(2)})`, opacity: 0 }
	], { duration: FRIZZ_MS, easing: 'ease-out' })
	a.onfinish = () => el.remove()
}

// landing: the destination chip stops being a ghost (solidifies) + a brief flash.
function land(chip) {
	chip.classList.remove('txcard-chip-ghost')
	chip.classList.add('txflow-landed')
	setTimeout(() => chip.classList.remove('txflow-landed'), 700)
}

async function animateAsset(front, back, base, send, receive, hue) {
	if (!send.length || !receive.length) return   // one-sided (e.g. operator HBAR fee) — nothing to travel to
	send.forEach(c => c.classList.add('txcard-chip-ghost'))   // sources empty out as their asset departs
	const src = send.map(c => centerOf(c, base))
	const dst = receive.map(c => centerOf(c, base))
	const G = centroid([...src, ...dst])

	// only a real many-to-* flow gets the (subtle, parallel) pool puff — 1→1 stays a clean glide
	if (send.length > 1 || receive.length > 1)
		setTimeout(() => frizz(front, G, send.length + receive.length), TRAVEL_MS * 0.5)

	// one continuous ghost per max(sources, dests), round-robined so every source AND every
	// destination is touched; each glides its own S→D curve through the shared centroid.
	const k = Math.max(send.length, receive.length)
	await Promise.all(Array.from({ length: k }, (_, j) => {
		const S = src[j % src.length], D = dst[j % dst.length]
		const ctrl = { x: 2 * G.x - (S.x + D.x) / 2, y: 2 * G.y - (S.y + D.y) / 2 }
		return travel(front, back, base, send[j % send.length], S, D, ctrl, hue, () => land(receive[j % receive.length]))
	}))
}

// Run across every asset flow, STAGGERED (asset-by-asset). Guarded against re-entry.
export async function flowTravel(container) {
	if (container._flowRunning || typeof container.querySelectorAll !== 'function') return
	container._flowRunning = true
	try {
		const back = mkLayer(container, 'txflow-layer-trail')   // trail — above card bodies, below chips
		const front = mkLayer(container, 'txflow-layer')        // ghosts + puff — topmost
		const base = container.getBoundingClientRect()

		// snapshot ghost state so we can restore after the preview (it ends source↔dest swapped)
		const chips = [...container.querySelectorAll('.txcard-chip')].filter(c => !c.classList.contains('txflow-ghost'))
		const wasGhost = new Map(chips.map(c => [c, c.classList.contains('txcard-chip-ghost')]))

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
		const entries = [...byAsset.entries()]
		await Promise.all(entries.map(([key, g], i) =>
			new Promise(res => setTimeout(() => animateAsset(front, back, base, g.send, g.receive, assetHue(key)).then(res), i * STAGGER_MS))
		))

		// hold the swapped end-state (source ghost / dest solid) briefly — that's how consensus
		// will end — then revert so the preview is replayable. Trail marks self-expire (TRAIL_MS).
		await new Promise(r => setTimeout(r, HOLD_MS))
		chips.forEach(c => { c.classList.toggle('txcard-chip-ghost', !!wasGhost.get(c)); c.classList.remove('txflow-landed') })
	} finally {
		container._flowRunning = false
	}
}

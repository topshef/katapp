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
// Trail lifetime is DECOUPLED from SLOW on purpose (per user): the dotted trajectory lingers
// well past the glide so you see the whole path. Exaggerated for now — dial back later.
const TRAIL_MS   = 5000
const DOT_SPACING = 3            // px between trail dots ALONG the path (spatial, so spacing stays even at any speed; smaller = denser). NB density × TRAIL_MS = many live nodes; fine for a preview.
const LIFT = 0.06                // subtle midpoint scale lift (NOT a shrink)
const FRIZZ_OPACITY = 0.14       // very soft puff

const centerOf = (el, base) => {
	const r = el.getBoundingClientRect()
	return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top }
}
const centroid = pts => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })
// ease-in-out-cubic: slow start → fastest at the middle → soft landing.
const easeInOut = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2

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

// A tiny, barely-blurred, per-asset-coloured dot at (x,y) (layer-relative) — the dotted
// trajectory. Held at full opacity a while (so the whole line reads) then fades slowly.
function trailMark(back, x, y, hue) {
	const mark = document.createElement('div')
	mark.className = 'txflow-trail'
	mark.style.left = x + 'px'; mark.style.top = y + 'px'
	mark.style.background = `radial-gradient(circle, hsl(${hue} 80% 62% / .6) 0%, hsl(${hue} 80% 62% / 0) 70%)`
	back.appendChild(mark)
	mark.animate([
		{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0.45 },
		{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0.45, offset: 0.4 },
		{ transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 }
	], { duration: TRAIL_MS, easing: 'ease-out' }).onfinish = () => mark.remove()
}

// One continuous ghost (front layer) gliding A→B along quadratic A,ctrl,B. Positions are
// sampled at the EASED curve parameter with LINEAR playback, so the WHOLE glide accelerates to
// the middle and decelerates to land. A dense, even (DOT_SPACING px) coloured trail is laid on
// the trail layer by sampling the ghost each frame and interpolating between frames.
function travel(front, back, base, chip, A, B, ctrl, hue, onDone) {
	return new Promise(res => {
		const ghost = chip.cloneNode(true)
		ghost.className = 'txcard-chip txflow-ghost'
		ghost.removeAttribute('data-asset-key')
		ghost.style.width = chip.getBoundingClientRect().width + 'px'
		front.appendChild(ghost)

		const steps = 30, frames = []
		for (let i = 0; i <= steps; i++) {
			const tau = i / steps, p = easeInOut(tau), mp = 1 - p
			const x = mp * mp * A.x + 2 * mp * p * ctrl.x + p * p * B.x
			const y = mp * mp * A.y + 2 * mp * p * ctrl.y + p * p * B.y
			const s = 1 + LIFT * Math.sin(Math.PI * tau)
			const op = tau < 0.12 ? tau / 0.12 : tau > 0.88 ? (1 - tau) / 0.12 : 1
			frames.push({ transform: `translate(${x}px,${y}px) translate(-50%,-50%) scale(${s.toFixed(3)})`, opacity: op, offset: tau })
		}
		const anim = ghost.animate(frames, { duration: TRAVEL_MS, easing: 'linear', fill: 'forwards' })

		// even-spaced trail: each frame, drop dots every DOT_SPACING px between the last and
		// current ghost centre (so density stays even however fast the eased motion is going).
		let last = null, raf = 0
		const tick = () => {
			const r = ghost.getBoundingClientRect()
			const cur = { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top }
			if (!last) { trailMark(back, cur.x, cur.y, hue); last = cur }
			else {
				const dx = cur.x - last.x, dy = cur.y - last.y, dist = Math.hypot(dx, dy)
				const n = Math.floor(dist / DOT_SPACING)
				for (let i = 1; i <= n; i++) trailMark(back, last.x + dx * (i / n), last.y + dy * (i / n), hue)
				if (n >= 1) last = cur
			}
			raf = requestAnimationFrame(tick)
		}
		raf = requestAnimationFrame(tick)

		anim.onfinish = () => { cancelAnimationFrame(raf); try { onDone?.() } finally { ghost.remove(); res() } }
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

// Group animatable chips by asset + side. Excludes the operator HBAR fee chip (not part of the
// transfer) and any in-flight ghost clones.
function groupChips(container) {
	const byAsset = new Map()
	container.querySelectorAll('.txcard-chip[data-asset-key]').forEach(chip => {
		if (chip.classList.contains('txflow-ghost') || chip.classList.contains('txcard-chip--fee')) return
		const key = chip.dataset.assetKey
		const side = chip.closest('.txcard-send') ? 'send' : chip.closest('.txcard-receive') ? 'receive' : null
		if (!key || !side) return
		const g = byAsset.get(key) || { send: [], receive: [] }
		g[side].push(chip)
		byAsset.set(key, g)
	})
	return byAsset
}

// Set the swap state WITHOUT animating. after=true → sources ghosted / dests solid (the settled
// "after consensus" state); after=false → the original resting state (send solid / receive
// ghost). Only two-sided flows swap (fee excluded). Also syncs the preview toggle label.
export function setFlowState(container, after) {
	for (const g of groupChips(container).values()) {
		if (!g.send.length || !g.receive.length) continue
		g.send.forEach(c => c.classList.toggle('txcard-chip-ghost', after))
		g.receive.forEach(c => c.classList.toggle('txcard-chip-ghost', !after))
		;[...g.send, ...g.receive].forEach(c => c.classList.remove('txflow-landed'))
	}
	// the operator HBAR fee chip isn't animated, but gray it in the 'after' state too so it
	// matches the other (ghosted) send chips stylistically (per user).
	container.querySelectorAll('.txcard-chip--fee').forEach(c => c.classList.toggle('txcard-chip-ghost', after))
	container.dataset.flowState = after ? 'after' : 'before'
	container.querySelector('.txcards-preview')?.setAttribute('data-state', after ? 'after' : 'before')
}

// Revert to "before" and clear the overlays (the preview toggle's off press).
export function revertFlow(container) {
	setFlowState(container, false)
	container.querySelectorAll('.txflow-layer, .txflow-layer-trail').forEach(l => l.innerHTML = '')
}

// Play the animation and STICK at the "after" state (sources left as ghosts on the left). Used
// by the preview toggle (on) and by consensus. Guarded against re-entry / re-entry while running.
export async function flowTravel(container) {
	if (container._flowRunning || typeof container.querySelectorAll !== 'function') return
	container._flowRunning = true
	try {
		const back = mkLayer(container, 'txflow-layer-trail')   // trail — above card bodies, below chips
		const front = mkLayer(container, 'txflow-layer')        // ghosts + puff — topmost
		const base = container.getBoundingClientRect()
		const entries = [...groupChips(container).entries()]
		await Promise.all(entries.map(([key, g], i) =>
			new Promise(res => setTimeout(() => animateAsset(front, back, base, g.send, g.receive, assetHue(key)).then(res), i * STAGGER_MS))
		))
		setFlowState(container, true)   // STICK: leave sources ghosted / dests solid (no auto-revert)
		front.innerHTML = ''            // ghosts done; the trail lingers on the back layer and self-expires
	} finally {
		container._flowRunning = false
	}
}

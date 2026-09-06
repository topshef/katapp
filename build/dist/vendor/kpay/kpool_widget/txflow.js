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
// TRAILUTURN1 (operator, 2026-09-06, with a screenshot): "the trailing lines show the path for
// funds, but if there's a sudden U-turn it looks a bit weird … I think the issue might be how
// funds merge and then split out again." Exactly that. Forcing every curve THROUGH the one
// shared centroid G is fine when G lies between a curve's ends, but in a 1→4 fan-out G is the
// average of five points and sits well past the nearer targets along their own S→D line — so
// those curves overshoot the target, turn round, and come back. The fix keeps G's pull but
// never lets a curve's through-point leave its own segment: see throughPoint().
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
// Trail COLOUR: ONE hue for every asset (TRAILHUE1, feedback c5786027 2026-09-05 — "too many
// colours being drawn… the animation lines should just be one colour… not green or red or
// orange which have meanings otherwise… a cloudy blue would be fine"). This used to derive a
// stable hue per asset key so each trajectory was distinguishable; on a real transfer that put
// four or five saturated hues on screen at once, and two of them collided with the meanings
// the rest of this modal spends its time establishing — green is settled, red is the send
// side, orange is a warning. The lines say WHERE something went, not WHAT it was; the chips at
// each end already say what. So they are all the same muted blue, chosen to carry no meaning.

// ── MOTION timings — these ARE the production values (the animation runs at this speed, which
// the user signed off as right). For slow-mo DEBUGGING only, temporarily raise TIME_SCALE; 1 = normal. ──
const TIME_SCALE = 1
const TRAVEL_MS  = 540 * TIME_SCALE    // per-asset glide
const FRIZZ_MS   = 160 * TIME_SCALE    // pool puff
const STAGGER_MS = 220 * TIME_SCALE    // gap between asset flows
// TRAIL_MS is only used by the (currently disabled) trail fade in trailMark — the lines are kept
// drawn now, so it has no effect unless that fade is re-enabled.
const TRAIL_MS   = 5000
const DOT_SPACING = 3            // px between trail dots ALONG the path (spatial, even spacing; smaller = denser)
const LIFT = 0.06                // subtle midpoint scale lift (NOT a shrink)
const FRIZZ_OPACITY = 0.14       // very soft puff

const centerOf = (el, base) => {
	const r = el.getBoundingClientRect()
	return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top }
}
const centroid = pts => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })
// ease-in-out-cubic: slow start → fastest at the middle → soft landing.
const easeInOut = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2

// One trail colour, for every asset. 213 is the muted blue HBAR already used (217) pulled a
// few degrees cooler; the saturation drop is in trailMark, where the dot is painted.
const TRAIL_HUE = 213

function mkLayer(container, cls) {
	// skip .txflow-hover layers — those are the hover-replay's own throwaway/fading
	// overlays (TX-FLOW-HOVER1); grabbing one here would wipe or orphan it mid-fade.
	let layer = [...container.children].find(c => c.classList?.contains(cls) && !c.classList.contains('txflow-hover'))
	if (!layer) { layer = document.createElement('div'); layer.className = cls; container.appendChild(layer) }
	layer.innerHTML = ''
	return layer
}

// A tiny, barely-blurred, per-asset-coloured dot at (x,y) (layer-relative) — the dotted
// trajectory. Held at full opacity a while (so the whole line reads) then fades slowly.
function trailMark(back, x, y, hue = TRAIL_HUE) {
	const mark = document.createElement('div')
	mark.className = 'txflow-trail'
	mark.style.left = x + 'px'; mark.style.top = y + 'px'
	// 80% saturation was right when the hue itself was the information; with one colour it
	// only shouts. 46% reads as the cloudy blue asked for and sits behind the chips.
	mark.style.background = `radial-gradient(circle, hsl(${hue} 46% 58% / .55) 0%, hsl(${hue} 46% 58% / 0) 70%)`
	back.appendChild(mark)
	// NO fade-out (per user): the dotted trajectory is a genuinely useful record of where each
	// asset came from / went to, so we LEAVE the lines drawn. They persist until the state is
	// reverted to 'before' (revertFlow clears the trail layer) or a new preview redraws them.
	// (Previously each mark faded + self-removed over TRAIL_MS — kept commented in case we ever
	// want them to dissipate again. The dot is centred via CSS transform now.)
	// mark.animate([{opacity:.45},{opacity:.45,offset:.4},{transform:'scale(.4)',opacity:0}], { duration: TRAIL_MS, easing:'ease-out' }).onfinish = () => mark.remove()
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

	// one continuous ghost per max(sources, dests), round-robined so every source AND every
	// destination is touched; each glides its own S→D curve through the shared centroid.
	const k = Math.max(send.length, receive.length)
	const legs = Array.from({ length: k }, (_, j) => {
		const S = src[j % src.length], D = dst[j % dst.length]
		const M = throughPoint(S, D, G)
		return { j, S, D, M, ctrl: { x: 2 * M.x - (S.x + D.x) / 2, y: 2 * M.y - (S.y + D.y) / 2 } }
	})
	// the puff sits where the curves actually cross the pool moment — the centroid of their
	// through-points — not at G, which the curves no longer necessarily visit
	if (send.length > 1 || receive.length > 1)
		setTimeout(() => frizz(front, centroid(legs.map(l => l.M)), send.length + receive.length), TRAVEL_MS * 0.5)
	await Promise.all(legs.map(({ j, S, D, ctrl }) =>
		travel(front, back, base, send[j % send.length], S, D, ctrl, hue, () => land(receive[j % receive.length]))))
}

// TRAILUTURN1: the point one curve passes through at its midpoint. G is the shared pool
// centroid and its pull is what makes a many-to-many flow read as one movement — but a curve
// must never travel past its own destination to reach it. So:
//   · ALONG S→D, use G's projection onto the segment, clamped to the middle half [0.25, 0.75].
//     The control point then lies within the segment along that axis, which makes the curve
//     monotone along it — it cannot overshoot and turn back. Ever.
//   · ACROSS S→D, keep G's sideways offset, capped at 35% of the segment length: a bow toward
//     the pool, not a hook.
// 1→1: G is the midpoint, its projection is the midpoint, the sideways offset is zero — a
// straight line, exactly as before.
export function throughPoint(S, D, G) {
	const vx = D.x - S.x, vy = D.y - S.y
	const len2 = vx * vx + vy * vy
	if (len2 < 1) return { x: (S.x + D.x) / 2, y: (S.y + D.y) / 2 }
	const len = Math.sqrt(len2)
	const t = Math.min(0.75, Math.max(0.25, ((G.x - S.x) * vx + (G.y - S.y) * vy) / len2))
	const px = S.x + vx * t, py = S.y + vy * t          // G projected onto S→D, kept inside it
	const nx = -vy / len, ny = vx / len                  // unit normal to S→D
	const side = (G.x - px) * nx + (G.y - py) * ny       // G's signed sideways offset
	const cap = 0.35 * len
	const sw = Math.max(-cap, Math.min(cap, side))
	return { x: px + nx * sw, y: py + ny * sw }
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

// TX-FLOW-HOVER1: replay the glide for ONE asset — an ephemeral preview, not a state
// change. Chip ghost/solid classes are snapshotted and restored (animateAsset empties
// sources and lands destinations as it goes). The trail draws on its OWN layer (tagged
// .txflow-hover so mkLayer never grabs it), stacked over whatever trail is already
// there — an existing sticky 'after' line is untouched, the hover line just paints on
// top. The layer PERSISTS while the hover holds; fadeHoverTrail() (hover-out) fades and
// removes it — echoing the old trailMark fade (see the commented animate() above),
// which we dropped for the sticky before/after record but want back for hover.
// Guarded per-asset and against a full flowTravel run.
export async function flowAssetOnce(container, assetKey) {
	if (typeof container?.querySelectorAll !== 'function' || container._flowRunning) return
	container._assetFlows ||= new Set()
	if (container._assetFlows.has(assetKey)) return
	const g = groupChips(container).get(assetKey)
	if (!g?.send.length || !g?.receive.length) return
	container._assetFlows.add(assetKey)
	const layer = cls => { const l = document.createElement('div'); l.className = cls; container.appendChild(l); return l }
	const front = layer('txflow-layer txflow-hover'), back = layer('txflow-layer-trail txflow-hover')
	// registered UP FRONT so a hover-out mid-flight still finds the layer to fade
	;(container._hoverTrails ||= new Map()).set(assetKey, back)
	const prior = [...g.send, ...g.receive].map(c => [c, c.classList.contains('txcard-chip-ghost')])
	try {
		await animateAsset(front, back, container.getBoundingClientRect(), g.send, g.receive, TRAIL_HUE)
	} finally {
		prior.forEach(([c, was]) => { c.classList.toggle('txcard-chip-ghost', was); c.classList.remove('txflow-landed') })
		front.remove()
		container._assetFlows.delete(assetKey)
	}
}

// Hover ended: fade the hover trail(s) away — quick but soft (per user), then remove.
// No assetKey = fade them all (e.g. pointer left the whole card area).
export function fadeHoverTrail(container, assetKey) {
	const trails = container?._hoverTrails
	if (!trails) return
	const keys = assetKey != null ? [assetKey] : [...trails.keys()]
	for (const k of keys) {
		const l = trails.get(k)
		trails.delete(k)
		if (!l) continue
		l.style.transition = 'opacity .45s ease'
		l.style.opacity = '0'
		setTimeout(() => l.remove(), 500)
	}
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
			new Promise(res => setTimeout(() => animateAsset(front, back, base, g.send, g.receive, TRAIL_HUE).then(res), i * STAGGER_MS))
		))
		setFlowState(container, true)   // STICK: leave sources ghosted / dests solid (no auto-revert)
		front.innerHTML = ''            // ghosts done; the trail lingers on the back layer and self-expires
	} finally {
		container._flowRunning = false
	}
}

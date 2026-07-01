// txflow.js — asset-movement "gather → merge → scatter" animation (TX-FLOW-ANIM1 v1).
//
// ONE generic engine per asset flow. For each asset (data-asset-key) we take its SEND chips
// (sources) and RECEIVE chips (destinations), compute a pool point G (centroid), then:
//   A. gather  — a ghost clone of each source rises off its card and travels S→G
//   B. merge   — the gathered ghosts fade into G with a small "frizz" burst
//   C. scatter — a ghost is born at G for each destination and travels G→D, landing (the
//                real receive chip briefly solidifies = "arrived")
// Incoming ghosts DIE at G and outgoing are BORN at G — the merge is symmetric, so no ghost
// is followed through the bend (no angle-kink) and none is singled out to vanish.
//
// DEFLECTION scales the effect for free: the spatial arc + frizz are driven by the chips'
// PERPENDICULAR spread around the flow axis. A 1→1 transfer has zero perpendicular spread,
// so S/G/D are collinear and it renders as a plain straight glide (with a gentle rise/land
// scale) — same code, no conditionals. No invented per-pair routing (PROJECT_RULES): it
// shows conservation + fungibility (identity scrambled at the pool).
//
// Positions are computed relative to the cards container; a .txflow-layer overlay hosts the
// ghosts (absolute). Motion via WAAPI keyframes sampling a quadratic Bézier — robust and
// GPU-friendly, no offset-path quirks, no rAF loop.

const centerOf = (el, base) => {
	const r = el.getBoundingClientRect()
	return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top }
}
const centroid = pts => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 })
const avg = xs => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)

function ensureLayer(container) {
	let layer = [...container.children].find(c => c.classList?.contains('txflow-layer'))
	if (!layer) { layer = document.createElement('div'); layer.className = 'txflow-layer'; container.appendChild(layer) }
	layer.innerHTML = ''
	return layer
}

// Sample a quadratic Bézier A→ctrl→B into WAAPI keyframes. Scale pulses up at the midpoint
// (rise toward viewer, then land). Opacity: gather fades OUT at G; scatter fades IN from G.
function travel(layer, chip, A, B, ctrl, phase, onDone) {
	return new Promise(res => {
		const ghost = chip.cloneNode(true)
		ghost.className = 'txcard-chip txflow-ghost'
		ghost.removeAttribute('data-asset-key')
		ghost.style.width = chip.getBoundingClientRect().width + 'px'
		layer.appendChild(ghost)

		const steps = 16, frames = []
		for (let i = 0; i <= steps; i++) {
			const t = i / steps, mt = 1 - t
			const x = mt * mt * A.x + 2 * mt * t * ctrl.x + t * t * B.x
			const y = mt * mt * A.y + 2 * mt * t * ctrl.y + t * t * B.y
			const s = 0.9 + 0.28 * Math.sin(Math.PI * t)
			const op = phase === 'gather' ? (t < 0.82 ? 1 : 1 - (t - 0.82) / 0.18)
				: (t > 0.18 ? 1 : t / 0.18)
			frames.push({ transform: `translate(${x}px,${y}px) translate(-50%,-50%) scale(${s.toFixed(3)})`, opacity: op, offset: t })
		}
		const anim = ghost.animate(frames, { duration: 540, easing: 'ease-in-out', fill: 'forwards' })
		anim.onfinish = () => { try { onDone?.() } finally { ghost.remove(); res() } }
	})
}

function frizz(layer, G, count, spread) {
	return new Promise(res => {
		const el = document.createElement('div')
		el.className = 'txflow-frizz'
		el.style.left = G.x + 'px'; el.style.top = G.y + 'px'
		layer.appendChild(el)
		const mag = Math.min(2.2, 0.8 + count * 0.12 + spread * 0.01)
		const a = el.animate([
			{ transform: 'translate(-50%,-50%) scale(0.2)', opacity: 0.9 },
			{ transform: `translate(-50%,-50%) scale(${mag})`, opacity: 0.45, offset: 0.6 },
			{ transform: `translate(-50%,-50%) scale(${(mag * 1.4).toFixed(2)})`, opacity: 0 }
		], { duration: 320, easing: 'ease-out' })
		a.onfinish = () => { el.remove(); res() }
	})
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

	// perpendicular spread around the flow axis = deflection. 0 for 1→1 (collinear) → no arc.
	const cs = centroid(src), cd = centroid(dst)
	const ax = cd.x - cs.x, ay = cd.y - cs.y, al = Math.hypot(ax, ay) || 1
	const ux = ax / al, uy = ay / al
	const perp = avg([...src, ...dst].map(p => Math.abs((p.x - G.x) * -uy + (p.y - G.y) * ux)))
	const arc = Math.min(70, perp * 0.8)   // upward bow, scaled by deflection (→0 for 1→1)
	const ctrl = (A, B) => ({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 - arc })

	await Promise.all(send.map((c, i) => travel(layer, c, src[i], G, ctrl(src[i], G), 'gather')))
	await frizz(layer, G, send.length + receive.length, perp)
	await Promise.all(receive.map((c, i) => travel(layer, c, G, dst[i], ctrl(G, dst[i]), 'scatter', () => solidify(c))))
}

// Run the animation across every asset flow concurrently. Guarded against re-entry.
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

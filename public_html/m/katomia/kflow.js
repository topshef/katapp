// kflow.js — flow-fingerprint checkpoints (KFLOW1).
//
// Seeds user-flow gateway markers: window.kflow(checkpoint, variant, detail).
//   checkpoint  colon-namespaced name, the GROUP level ('acct:add:pick')
//   variant     enum discriminator only, the DETAIL level ('wc'|'typed') — never
//               amounts/ids/timestamps; buckets, not values
//   detail      free troubleshooting payload — NEVER part of the fingerprint;
//               only sent while kdiag remote is on (privacy tag, same precedence)
//
// Events beacon to /kflow (kflow.php → logs/kflow/kflow.{date}.jsonl) tagged with
// a per-pageload run id, seq, tier 'fe', a non-reversible player hash and the
// frontend commit. ALWAYS ON — deliberately independent of kdiag's
// DIAG_DEFAULT_ON (DIAG-OFF1 will flip that; fingerprints must keep flowing).
// Design: tasks/KFLOW1-DESIGN-20260707.md in the katomia workspace.

(() => {
	if(window.kflow) return

	const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => b.toString(16).padStart(2, "0")).join("")
	const RUN = rand()
	// visit id: stable across reloads in THIS tab (sessionStorage) — runs die at
	// reload but real tests legitimately span reloads (exit → refresh → assert).
	const VISIT = (() => { try { let v = sessionStorage.getItem("kflow_visit"); if(!v){ v = rand(); sessionStorage.setItem("kflow_visit", v) } return v } catch { return "" } })()
	const COMMIT = window.KFLOW_COMMIT || ""
	// FEEDBACK-COMMENTARY1 finding (user 2026-07-16, session delta-sierra-46):
	// this only ever matched /game/<id> — board pages route as /board/<id>
	// (BOARD-UI1), so every kflow event's top-level `game` field has been
	// BLANK for the whole life of the board skin. It surfaced when the user
	// asked to thread two browsers' activity in the same game and had to fall
	// back to "you can see it's the same game from context" — the field that
	// should have made that trivial was silently empty. detail.gameId (set on
	// join/state checkpoints) still carried the truth, which is how this got
	// spotted at all.
	const gameOf = () => { try { return (location.pathname.match(/\/(?:game|board)\/([\w-]+)/) || [])[1] || "" } catch { return "" } }
	let seq = 0
	const Q = []
	let timer = null

	// detail/identity payloads ride only while kdiag remote is on — mirror diag.js
	// precedence (url param > localStorage > default ON during rapid-iteration)
	const detailOn = (() => {
		const p = new URLSearchParams(location.search).get("kdiag")
		if(p === "1") return true
		if(p === "0") return false
		try { const ls = localStorage.getItem("kdiag_remote"); if(ls === "1") return true; if(ls === "0") return false } catch {}
		return true // tracks DIAG_DEFAULT_ON in diag.js
	})()

	// non-reversible player tag: p_ + sha256(playerToken)[:10] — identifies a tester
	// across runs without ever logging the raw auth token. Backend flowlog.js MUST
	// use the identical derivation so fe/be events correlate.
	let userTag = ""
	async function computeUserTag(){
		try {
			const token = localStorage.getItem("katomiaPlayerToken")
			if(!token) return
			const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
			userTag = "p_" + Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("").slice(0, 10)
		} catch {}
	}
	computeUserTag()

	function safe(v){ try { return JSON.parse(JSON.stringify(v)) } catch { return String(v) } }

	// ── state-fingerprint helpers ──────────────────────────────────────────────
	// Variants must stay ENUM/BUCKET shaped; these build canonical variants FROM
	// state so call sites never invent ad-hoc encodings. Used for both start-state
	// snapshots (state:* checkpoints) and data-derived variants (set of assets picked).
	const fnv = s => { let h = 0x811c9dc5; for(const c of s){ h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) } return (h >>> 0).toString(16).padStart(8, "0").slice(0, 6) }
	// fpSet(['0.0.9','0.0.5']) -> '0.0.5+0.0.9' (order-free); hashes when long -> 'n7~a1b2c3'
	function fpSet(arr){ const a = [...new Set((arr || []).map(String))].sort(); const s = a.join("+"); return !a.length ? "none" : s.length <= 40 ? s : `n${a.length}~${fnv(s)}` }
	// fpCounts({wc:2, g:1}) -> 'g1·wc2' (key-sorted counts crosstab)
	function fpCounts(obj){ return Object.keys(obj || {}).sort().map(k => `${k}${obj[k]}`).join("·") || "none" }

	function kflow(checkpoint, v, detail){
		const ev = { t: new Date().toISOString(), run: RUN, visit: VISIT, seq: ++seq, tier: "fe", checkpoint, v: v || "", commit: COMMIT, game: gameOf(), page: location.pathname }
		// FEEDBACK-COMMENTARY1: while a feedback session is active (kfw_session
		// in localStorage -- deliberately localStorage, NOT sessionStorage: it
		// crosses TABS, so the board tab's events thread to a session started
		// from any other tab), every checkpoint carries the session slug.
		try { const s = JSON.parse(localStorage.getItem("kfw_session") || "null"); if(s?.slug) ev.session = s.slug } catch {}
		if(detailOn && detail !== undefined) ev.detail = safe(detail)
		Q.push(ev)
		if(!timer) timer = setTimeout(flush, 2000)
		try { console.debug("[kflow]", checkpoint + (v ? "#" + v : ""), detail ?? "") } catch {}
		try { globalThis.glog?.("kflow:" + checkpoint, { v, detail }) } catch {}
		return ev
	}

	function flush(){
		timer = null
		if(!Q.length) return
		const batch = Q.splice(0, 200)
		batch.forEach(ev => { ev.user = userTag })  // set late — hash may not be ready at event time
		const blob = new Blob([JSON.stringify({ events: batch })], { type: "application/json" })
		if(navigator.sendBeacon?.("/kflow", blob)) return
		fetch("/kflow", { method: "POST", body: blob, keepalive: true }).catch(() => {})
	}

	window.addEventListener("pagehide", flush)

	window.kflow = Object.assign(kflow, { run: RUN, visit: VISIT, flush, fpSet, fpCounts })
	kflow("page:load")
})()

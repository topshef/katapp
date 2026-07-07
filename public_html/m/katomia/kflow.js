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

	const RUN = Array.from(crypto.getRandomValues(new Uint8Array(5)), b => b.toString(16).padStart(2, "0")).join("")
	const COMMIT = window.KFLOW_COMMIT || ""
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

	function kflow(checkpoint, v, detail){
		const ev = { t: new Date().toISOString(), run: RUN, seq: ++seq, tier: "fe", checkpoint, v: v || "", commit: COMMIT, page: location.pathname }
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

	window.kflow = Object.assign(kflow, { run: RUN, flush })
	kflow("page:load")
})()

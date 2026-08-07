// TXSTATUS-CONSOLIDATE1 S1 (2026-08-07): ONE controller for transaction/wallet
// status reporting. Today at least five things can independently put tx state
// in front of the user (board vanish+mirror confirm, tx-receipt socket, pending
// isFinalStatus scan, board sign watchdogs, KWC typed errors) and none of them
// know what the others have done — the cross-reporter invariant ("one truth per
// tx, announced once, never before it is known") can't be enforced by any single
// reporter, which is why the same class of bug keeps returning. This module owns
// per-txid state; reporters feed report(), presentation subscribes.
//
// S1 is deliberately a THIN PASS-THROUGH — behaviour must be identical to
// pre-S1 (dedup still lives in boardShowResult's ack set). The six enforcement
// rules (terminal-is-terminal, settle window before negatives, txid-scoped
// messages, supersede-cancels, tiered presentation, provenance) land in S2-S5
// as properties of THIS module, one stage at a time, benchmarked between each.
// Plan: servers/lincoln/docs/TXSTATUS-CONSOLIDATE1-PLAN.html
(() => {
  const diag = (msg, data) => { try { (typeof katomiaDiagSend === "function" ? katomiaDiagSend : (window.kdiag || (() => {})))(msg, data) } catch {} }
  const txs = new Map()   // txid -> { txid, network, expiry, phase, attempts, verdict, pendingNegative }
  const subs = new Set()
  let seq = 0
  const tx = txid => {
    let t = txs.get(txid)
    if(!t){ t = { txid, network: null, expiry: null, phase: "idle", attempts: new Map(), verdict: null, pendingNegative: null }; txs.set(txid, t) }
    return t
  }
  const emit = ev => subs.forEach(fn => { try { fn(ev) } catch(e){ diag("txstatus:subscriber-error", { error: String(e) }) } })

  window.katomiaTxStatus = {
    watch(txid, opts = {}){                       // register/adopt; expiry from the backend, never guessed
      if(!txid) return
      const t = tx(txid)
      if(opts.network) t.network = opts.network
      if(opts.expiry) t.expiry = opts.expiry
      if(t.phase === "idle") t.phase = "signing"
      diag("txstatus:watch", { txid, network: t.network, expiry: t.expiry })
    },
    attempt(txid, opts = {}){                     // a Sign tap; abort handle arrives in S4
      const id = "a" + (++seq)
      tx(txid).attempts.set(id, { startedAt: Date.now(), accountId: opts.accountId || null, abort: opts.abort || null })
      diag("txstatus:attempt", { txid, attemptId: id, accountId: opts.accountId || null })
      return id
    },
    attemptDone(attemptId){ txs.forEach(t => t.attempts.delete(attemptId)) },
    report(txid, { source, kind, detail, attemptId } = {}){   // the ONLY entry point for a signal
      if(!txid){ diag("txstatus:report-no-txid", { source, kind }); return }
      const t = tx(txid)
      diag("txstatus:report", { txid, source, kind, ...(detail ? { detail } : {}) })
      if(kind !== "success" && kind !== "failure") return     // progress/advice: recorded only, S2+ acts on them
      const ok = kind === "success"
      t.phase = "terminal"
      if(!t.verdict) t.verdict = { ok, at: Date.now(), provenance: source || null, detail: detail || null }
      // S1: emit every success/failure signal unmodified — dedup stays with the
      // subscriber (boardShowResult's ack set), exactly as before this module.
      emit({ type: "verdict", txid, ok, source: source || null, detail: detail || null })
    },
    subscribe(fn){ subs.add(fn); return () => subs.delete(fn) },
    snapshot(txid){ return txs.get(txid) || null }
  }
})()

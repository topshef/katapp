// TXSTATUS-CONSOLIDATE1 (2026-08-07): ONE controller for transaction/wallet
// status reporting. Today at least five things can independently put tx state
// in front of the user (board vanish+mirror confirm, tx-receipt socket, pending
// isFinalStatus scan, board sign watchdogs, KWC typed errors) and none of them
// know what the others have done — the cross-reporter invariant ("one truth per
// tx, announced once, never before it is known") can't be enforced by any single
// reporter, which is why the same class of bug keeps returning. This module owns
// per-txid state; reporters feed report(), presentation subscribes.
// Plan: servers/lincoln/docs/TXSTATUS-CONSOLIDATE1-PLAN.html
//
// S1 (17d739e): thin pass-through skeleton, reporters #1-#3 re-plumbed.
// S2: rules 1-3 enforced HERE —
//   1. TERMINAL IS TERMINAL. Once a txid has a verdict no later signal —
//      reconnect replay, watchdog, socket message, another page instance —
//      reopens it. The ack set (the same localStorage key boardShowResult has
//      always persisted) is re-read immediately before any verdict/advice goes
//      out, and a BroadcastChannel tells sibling instances the moment a verdict
//      lands — closing the duplicate-verdict hole (katomia-board.js built its
//      ack Set once at module load; two live instances held divergent Sets and
//      the 08:09/08:17 double verdict on 2026-08-07 was the result).
//   2. SETTLE WINDOW. Every negative (failure verdicts AND negative advice like
//      wallet-timeout toasts) waits SETTLE_MS before reaching the user; any
//      success arriving inside the window cancels it. This is the user's "wait
//      at least a second before reporting failure if it's then going to get
//      success a second later", applied to ALL negatives — BOARD-TXTRUTH1 only
//      covered the final verdict.
//   3. NO MESSAGE WITHOUT A TXID. report() requires one; signals for a terminal
//      txid are dropped silently and logged (txstatus:dropped-terminal), which
//      is what kills the "no response / SUCCESS / no response" ghost-toast
//      sequence: those were KWC-TIMEOUTs for an already-dead transaction.
// S3: rule 5 — PRESENTATION IS TIERED, SEPARATELY FROM DETERMINATION. Deciding
//      a verdict late is fine; playing a full-board wiper/confetti for a tx the
//      user has visibly moved on from is not (2026-08-07 08:09:14: the wiper
//      landed 1s into a NEW signing window, 62s after the tx it described).
//      Verdicts are classified at emit time:
//        live  — no newer signing window has opened since this tx was watched,
//                AND the tx left pending less than STALE_MS ago (or never did —
//                e.g. a receipt landing mid-window) → full celebration, as today
//        stale — anything else → quiet feed entry + toast, no board animation
//      (D4, user 2026-08-07: quiet, not loud-but-labelled.)
(() => {
  const diag = (msg, data) => { try { (typeof katomiaDiagSend === "function" ? katomiaDiagSend : (window.kdiag || (() => {})))(msg, data) } catch {} }
  const ACK_KEY = "katomia_board_success_acked"   // boardShowResult's persisted ack set — the cross-instance truth
  const SETTLE_MS = 1200
  const STALE_MS = 5000   // verdict landing this long after its tx left pending → quiet presentation
  let watchSeq = 0, lastWatch = null              // which txid most recently entered signing
  const txs = new Map()   // txid -> { txid, network, expiry, phase, attempts, verdict, pendingNegatives }
  const subs = new Set()
  let seq = 0
  const tx = txid => {
    let t = txs.get(txid)
    if(!t){ t = { txid, network: null, expiry: null, phase: "idle", attempts: new Map(), verdict: null, pendingNegatives: [] }; txs.set(txid, t) }
    return t
  }
  const emit = ev => subs.forEach(fn => { try { fn(ev) } catch(e){ diag("txstatus:subscriber-error", { error: String(e) }) } })
  const ackedInStorage = txid => { try { return JSON.parse(localStorage.getItem(ACK_KEY) || "[]").includes(txid) } catch { return false } }
  const isTerminal = t => !!t.verdict || ackedInStorage(t.txid)
  const clearNegatives = t => { t.pendingNegatives.forEach(n => clearTimeout(n.timer)); t.pendingNegatives = [] }

  // Sibling instances learn a verdict the moment it is emitted anywhere — they
  // mark the txid terminal SILENTLY (the user already saw it where it happened).
  let bc = null
  try {
    bc = new BroadcastChannel("katomia-txstatus")
    bc.onmessage = e => {
      const d = e.data
      if(d?.type !== "verdict" || !d.txid) return
      const t = tx(d.txid)
      if(t.verdict) return
      t.verdict = { ok: d.ok, at: Date.now(), provenance: d.source || null, remote: true }
      t.phase = "terminal"
      clearNegatives(t)
      diag("txstatus:remote-verdict", { txid: d.txid, ok: d.ok })
    }
  } catch {}

  const settleVerdict = (t, ok, source, detail) => {
    t.phase = "terminal"
    t.verdict = { ok, at: Date.now(), provenance: source || null, detail: detail || null }
    clearNegatives(t)
    // S4 / rule 4: terminal aborts any still-in-flight attempts on this tx
    t.attempts.forEach((a, id) => { try { a.abort?.() } catch {} ; diag("txstatus:attempt-aborted-terminal", { txid: t.txid, attemptId: id }) })
    t.attempts.clear()
    // rule 5: tier at emit time. Stale if the user has visibly moved on — a
    // newer signing window opened since this tx was watched — or the tx left
    // pending more than STALE_MS ago (a receipt mid-window never leaves pending
    // first, so the normal fast paths stay live).
    const superseded = lastWatch && lastWatch !== t.txid && (t.watchSeq || 0) < watchSeq
    const lingering = t.leftPendingAt && Date.now() - t.leftPendingAt > STALE_MS
    const tier = (superseded || lingering) ? "stale" : "live"
    diag("txstatus:verdict", { txid: t.txid, ok, source: source || null, tier, superseded: !!superseded, lingering: !!lingering })
    try { bc?.postMessage({ type: "verdict", txid: t.txid, ok, source: source || null }) } catch {}
    emit({ type: "verdict", txid: t.txid, ok, tier, source: source || null, detail: detail || null })
  }

  window.katomiaTxStatus = {
    watch(txid, opts = {}){                       // register/adopt; expiry from the backend, never guessed
      if(!txid) return
      const t = tx(txid)
      if(opts.network) t.network = opts.network
      if(opts.expiry) t.expiry = opts.expiry
      if(t.phase === "idle") t.phase = "signing"
      if(!t.watchSeq){ t.watchSeq = ++watchSeq; lastWatch = txid }   // first watch only — re-watches don't reset staleness
      diag("txstatus:watch", { txid, network: t.network, expiry: t.expiry })
    },
    attempt(txid, opts = {}){                     // a Sign tap
      const t = tx(txid)
      // S4 / rule 4: a new attempt on a txid supersedes the previous ones —
      // their watchdogs and in-flight wallet requests are aborted via the
      // handle each attempt registered, not left to fire minutes later.
      t.attempts.forEach((a, id) => { try { a.abort?.() } catch {} ; diag("txstatus:attempt-superseded", { txid, attemptId: id }) })
      t.attempts.clear()
      const id = "a" + (++seq)
      t.attempts.set(id, { startedAt: Date.now(), accountId: opts.accountId || null, abort: opts.abort || null })
      diag("txstatus:attempt", { txid, attemptId: id, accountId: opts.accountId || null })
      return id
    },
    attemptDone(attemptId){ txs.forEach(t => t.attempts.delete(attemptId)) },
    report(txid, { source, kind, detail, attemptId } = {}){   // the ONLY entry point for a signal
      if(!txid){ diag("txstatus:report-no-txid", { source, kind }); return }
      const t = tx(txid)
      diag("txstatus:report", { txid, source, kind, ...(detail ? { detail } : {}) })
      if(kind === "progress"){                                // recorded only
        if(detail?.event === "left-pending" && !t.leftPendingAt) t.leftPendingAt = Date.now()
        return
      }
      if(isTerminal(t)){ diag("txstatus:dropped-terminal", { txid, source, kind }); return }
      if(kind === "success"){ settleVerdict(t, true, source, detail); return }
      if(kind !== "failure" && kind !== "advice") return
      // negatives wait out the settle window; success inside it cancels them
      const negative = { kind, timer: setTimeout(() => {
        t.pendingNegatives = t.pendingNegatives.filter(n => n !== negative)
        if(isTerminal(t)){ diag("txstatus:dropped-terminal", { txid, source, kind, late: true }); return }
        if(kind === "failure") settleVerdict(t, false, source, detail)
        else emit({ type: "advice", txid, source: source || null, detail: detail || null })
      }, SETTLE_MS) }
      t.pendingNegatives.push(negative)
      diag("txstatus:negative-queued", { txid, source, kind, settleMs: SETTLE_MS })
    },
    subscribe(fn){ subs.add(fn); return () => subs.delete(fn) },
    snapshot(txid){ return txs.get(txid) || null }
  }
})()

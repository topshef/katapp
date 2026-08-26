// qa/harness/lib/qaenv.cjs — QA-ENVCOVERAGE1 (2026-08-26): one place for the environment
// wiring every harness duplicates, so a harness runs unchanged against lab1, prod, or pat.
//
// The single thing that differs between environments is the URL layout:
//   • Lincoln (lab1, prod=swap.kpay.live): the katomia app lives under /m/katomia
//   • GCP (pat.katomia.com, app.katomia.com): the app is served at ROOT, so the prefix is ""
// Board/qa pages must be built as `${BASE}${PREFIX}/...`; the /kflow and (on pat) /qa
// endpoints sit at the site root, so report to `${BASE}/kflow` and read `${BASE}${PREFIX}/qa`.
//
// Usage:
//   const { BASE, PREFIX, boardUrl, qaUrl, reportKflow, kwallet } = require('./lib/qaenv.cjs')('WCPATHS-01')
//   await page.goto(boardUrl(`/board/${GAME}?skin=ring16`))
//   await reportKflow('test:verdict', 'pass', { note })

module.exports = function qaenv(instance) {
  const BASE = (process.env.BASE || 'https://lab1.katlab.kpay.live').replace(/\/+$/, '')
  // /m/katomia on the Lincoln layout, "" on the GCP root layout. Override with BOARD_PREFIX.
  const PREFIX = process.env.BOARD_PREFIX != null
    ? process.env.BOARD_PREFIX
    : (/katlab|swap\.kpay\.live/.test(BASE) ? '/m/katomia' : '')
  const TRIGGER = process.env.TRIGGER || 'manual'
  const INSTANCE = instance || process.env.QA_INSTANCE || 'UNKNOWN-01'

  // build a katomia app URL (board pages etc.) honouring the env's path prefix
  const boardUrl = (p) => `${BASE}${PREFIX}${p.startsWith('/') ? p : '/' + p}`
  // a qa/ asset URL (results.php, data/*) — also prefix-aware
  const qaUrl = (p) => `${BASE}${PREFIX}/qa${p.startsWith('/') ? p : '/' + p}`

  let SITE_COMMIT = null
  async function reportKflow(checkpoint, v, detail) {
    try {
      if (SITE_COMMIT === null) {
        SITE_COMMIT = await fetch(qaUrl('/results.php?days=1'))
          .then(r => r.json()).then(d => d.commit || '').catch(() => '')
      }
      await fetch(`${BASE}/kflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: [{
          t: new Date().toISOString(), run: INSTANCE + ':' + Date.now().toString(36),
          seq: 1, tier: 'qa', checkpoint, v,
          detail: Object.assign({ instance: INSTANCE, source: 'auto', trigger: TRIGGER }, detail || {}),
          commit: SITE_COMMIT,
        }] }),
      })
    } catch (_) { /* reporting must never fail a test */ }
  }

  // signing is always the LOCAL kWallet on Lincoln, whatever frontend BASE is driven
  const kwallet = {
    account: process.env.KWALLET_ACCOUNT,
    token: process.env.KWALLET_TOKEN,
    network: process.env.KWALLET_NETWORK || 'testnet',
    port: process.env.KWALLET_PORT || '8790',
    base: `http://127.0.0.1:${process.env.KWALLET_PORT || '8790'}`,
  }

  return { BASE, PREFIX, TRIGGER, INSTANCE, boardUrl, qaUrl, reportKflow, kwallet }
}

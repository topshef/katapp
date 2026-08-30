
// import Localbase from 'localbase'
// const db = new Localbase('apiCache')

import { loadLocalbase } from './localbase-loader.js'

const glog = globalThis.glog ?? (() => {})


let db = null


// ── OBSERV-MIRROR1: shared-fetch observability (DETECTION ONLY) ───────────────
// Postmortem action for the 2026-06-29 mirror-flood (a per-row mirror fetch
// rate-limited the shared Hedera-mirror budget → add-account + order display broke
// with "mirror unavailable", and it was INVISIBLE). getData is the single chokepoint
// for every widget mirror/kpos call, so we count live (uncached) calls here and
// surface non-OK responses to /diag. Purely additive — no control-flow change. The
// throttle/containment half is a separate, opt-in step.
let _mirrorWin = { start: 0, n: 0, hosts: {} }

function mirrorHostPath(u) {
  try { const x = new URL(u); return x.host + x.pathname } catch { return String(u).slice(0, 80) }
}

function mirrorCallTick(url) {
  const now = Date.now()
  if (!_mirrorWin.start) _mirrorWin.start = now
  _mirrorWin.n++
  let host = 'other'; try { host = new URL(url).host } catch {}
  _mirrorWin.hosts[host] = (_mirrorWin.hosts[host] || 0) + 1
  // flush once per 60s window, OR early if a spike (>=120 live calls) signals a flood
  if (now - _mirrorWin.start >= 60000 || _mirrorWin.n >= 120) {
    const dur = (now - _mirrorWin.start) || 1
    try {
      globalThis.kdiag?.('mirror:rate', {
        windowMs: dur,
        calls: _mirrorWin.n,
        perMin: Math.round(_mirrorWin.n / (dur / 60000)),
        hosts: _mirrorWin.hosts,
        spike: _mirrorWin.n >= 120
      })
    } catch {}
    _mirrorWin = { start: now, n: 0, hosts: {} }
  }
}

// ┌─┐┌─┐┌┬┐  ╔╦╗┌┐ 
// │ ┬├┤  │    ║║├┴┐
// └─┘└─┘ ┴   ═╩╝└─┘
// get Db
export async function getDb() {
  if (db) return db

  const Localbase = await loadLocalbase()
  db = new Localbase('apiCache')
  return db
}


// export { db }

// ---------- helpers ----------

function generateCacheKey(url, params = {}) {
  return `${url}?${new URLSearchParams(params).toString()}`
}

// ┌─┐┌─┐┌┬┐  ╔═╗┬─┐┌─┐┌┬┐  ╔═╗┌─┐┌─┐┬ ┬┌─┐
// │ ┬├┤  │   ╠╣ ├┬┘│ ││││  ║  ├─┤│  ├─┤├┤ 
// └─┘└─┘ ┴   ╚  ┴└─└─┘┴ ┴  ╚═╝┴ ┴└─┘┴ ┴└─┘
// get From Cache
// ---------- URL-based cache ----------
export async function getFromCache(url, params = {}, expirySeconds = 'infinite') {
	const db = await getDb() 
  const key = generateCacheKey(url, params)
  const record = await db.collection('apiCache').doc(key).get()

  if (!record?.data) return null

  if (expirySeconds !== 'infinite') {
    const ageSeconds = (Date.now() - record.timestamp) / 1000
    if (ageSeconds > expirySeconds) return null
  }

  glog('🗄️ cache hit', key)
  return record.data
}

// ┌─┐┌─┐┬  ┬┌─┐  ╔╦╗┌─┐  ╔═╗┌─┐┌─┐┬ ┬┌─┐
// └─┐├─┤└┐┌┘├┤    ║ │ │  ║  ├─┤│  ├─┤├┤ 
// └─┘┴ ┴ └┘ └─┘   ╩ └─┘  ╚═╝┴ ┴└─┘┴ ┴└─┘
// save To Cache
export async function saveToCache(url, params = {}, data) {
  const db = await getDb() 
	const key = generateCacheKey(url, params)

  await db.collection('apiCache').doc(key).set({
    type: 'url',
    key,
    url,
    params,
    data,
    timestamp: Date.now()
  })
}

// ┌─┐┌─┐┌┬┐  ╔╦╗┌─┐┌┬┐┌─┐
// │ ┬├┤  │    ║║├─┤ │ ├─┤
// └─┘└─┘ ┴   ═╩╝┴ ┴ ┴ ┴ ┴
// get Data
export async function getData(url, params = {}, expirySeconds = 0, timeoutMs = 0) {
  if (expirySeconds) {
    const cached = await getFromCache(url, params, expirySeconds)
    if (cached) return cached
  }

  mirrorCallTick(url)   // OBSERV-MIRROR1: detection — count live (uncached) calls

  // optional per-call timeout (default 0 = off, so existing callers are unchanged).
  // Used to cap the slow COLD kpos getAccountInfo.php so the signer fails fast (the
  // caller's catch returns null) instead of hanging ~25s. On abort, fetch throws.
  const ctrl = timeoutMs ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null
  let response
  try {
    response = await fetch(`${url}?${new URLSearchParams(params)}`, ctrl ? { signal: ctrl.signal } : undefined)
  } finally {
    if (timer) clearTimeout(timer)
  }
  // OBSERV-MIRROR1: surface non-OK (esp. 429 rate-limit) on the shared mirror/kpos
  // layer so a flood/regression is visible in /diag. No control-flow change.
  if (!response.ok) {
    try { globalThis.kdiag?.(response.status === 429 ? 'mirror:429' : 'mirror:error',
      { url: mirrorHostPath(url), status: response.status }) } catch {}
  }
  const data = await response.json()

  glog('⚡ live call', url, params)

  if (data) await saveToCache(url, params, data)
  return data
}


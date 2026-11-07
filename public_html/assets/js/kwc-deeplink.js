// kwc-deeplink.js — WC-ANDROIDLINK1 (owner 2026-11-07): the "Pairing error - Error: Missing or
// invalid. pair() uri#relay-protocol" HashPack shows on Android, "a pre-existing issue that's
// been around forever". Loaded right after the KWC bundle (vendor/walletconnect/kwcScriptTag.php).
//
// WHERE IT COMES FROM (read in kwc.iife.js @4a3351b — WalletConnect Modal 2.7.0 + sign-client):
//  1. On Android the modal opens the raw pairing URI (wc:<topic>@2?symKey=…&relay-protocol=irn…)
//     so the OS picks a wallet, and records it as the user's "deep link choice" with the query
//     cut off: CoreUtil.setWalletConnectAndroidDeepLink → localStorage WALLETCONNECT_DEEPLINK_CHOICE
//     = { href: "wc:<topic>@2", name: "Android" }.
//  2. Every later request (sign, execute, authenticate) redirects to the wallet using that choice:
//     sign-client builds `${href}/wc?requestId=…&sessionTopic=…` → "wc:<topic>@2/wc?requestId=…".
//  3. Android hands any wc: link to HashPack, which reads it as a NEW pairing URI, finds no
//     relay-protocol, and shows the error. The request itself arrives over the relay regardless —
//     which is why it was benign.
//
// THE FIX: never let a wc: link be the redirect. Before a request (and on load, and when the tab
// comes back from the wallet) a wc: choice is replaced by the connected wallet's OWN link, taken
// from the session it published (peer.metadata.redirect.native / .universal) — the wallet's word,
// not a guess. A wallet that publishes no link gets a choice with no href, which the sign client
// treats as "no redirect" (it returns early when href is not a string). Each correction is a diag
// line (wc:deeplink:fixed), so what HashPack actually publishes shows up in the log.
//
// Every IndexedDB read is bounded (INTENTKEY-TIMEOUT1's lesson): nothing here can stall a page.
;(() => {
  const KEY = "WALLETCONNECT_DEEPLINK_CHOICE"
  const WC_DB = "WALLET_CONNECT_V2_INDEXED_DB", WC_STORE = "keyvaluestorage"
  const WRAP = ["signTx", "executeDeal", "authenticate", "connect"]

  const choice = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null") } catch { return null } }
  const isWcLink = c => !!c && typeof c.href === "string" && /^wc:/i.test(c.href)
  const timed = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))])
  const diag = (msg, data) => { try { window.kdiag?.(msg, data) } catch {} }

  // WalletConnect's sessions, as the sign client stored them: IndexedDB first (current versions),
  // then any localStorage copy (older ones). Read only — never opens a database that is not there.
  function idbSessions(){
    return new Promise(resolve => {
      if(!window.indexedDB) return resolve([])
      let req
      try { req = indexedDB.open(WC_DB) } catch { return resolve([]) }
      req.onupgradeneeded = () => { try { req.transaction.abort() } catch {} resolve([]) }   // did not exist
      req.onerror = () => resolve([])
      req.onsuccess = () => {
        const db = req.result
        try {
          if(!db.objectStoreNames.contains(WC_STORE)){ db.close(); return resolve([]) }
          const store = db.transaction(WC_STORE, "readonly").objectStore(WC_STORE)
          const keys = store.getAllKeys()
          keys.onsuccess = () => {
            const wanted = keys.result.filter(k => /\/\/session$/.test(String(k)))
            if(!wanted.length){ db.close(); return resolve([]) }
            const out = []; let left = wanted.length
            for(const k of wanted){
              const g = store.get(k)
              g.onsuccess = () => { try { const v = typeof g.result === "string" ? JSON.parse(g.result) : g.result; if(Array.isArray(v)) out.push(...v) } catch {} if(!--left){ db.close(); resolve(out) } }
              g.onerror = () => { if(!--left){ db.close(); resolve(out) } }
            }
          }
          keys.onerror = () => { db.close(); resolve([]) }
        } catch { try { db.close() } catch {} resolve([]) }
      }
    })
  }
  function lsSessions(){
    const out = []
    try { for(const k of Object.keys(localStorage)) if(/\/\/session$/.test(k)){ const v = JSON.parse(localStorage.getItem(k) || "[]"); if(Array.isArray(v)) out.push(...v) } } catch {}
    return out
  }

  let busy = null
  function fix(why){
    if(!isWcLink(choice())) return Promise.resolve(false)
    if(busy) return busy
    busy = (async () => {
      let sessions = []
      try { sessions = await timed(idbSessions(), 1500) } catch {}
      sessions = sessions.concat(lsSessions()).filter(s => s && s.peer && s.peer.metadata)
      // the most recently settled session is the wallet the user just connected
      const s = sessions.sort((a, b) => (b.expiry || 0) - (a.expiry || 0))[0]
      const meta = s ? s.peer.metadata : null
      const r = (meta && meta.redirect) || {}
      const link = typeof r.native === "string" && r.native ? r.native : (typeof r.universal === "string" && r.universal ? r.universal : null)
      const now = choice()
      if(!isWcLink(now)) return false                      // fixed meanwhile
      const next = link ? { href: link, name: meta.name || now.name || "wallet" }
                        : { href: null, name: now.name || "Android", note: "WC-ANDROIDLINK1: the wallet publishes no link; redirect skipped rather than sending a wc: pairing link" }
      try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
      diag("wc:deeplink:fixed", { why, wallet: meta ? meta.name : null, redirect: { native: r.native || null, universal: r.universal || null }, now: link ? "wallet link" : "no redirect" })
      return true
    })().finally(() => { busy = null })
    return busy
  }

  // before every request that can redirect to the wallet, and once more after it (a connect writes
  // the bad choice and settles the session in the same call)
  function wrapWC(){
    const WC = window.WC
    if(!WC || WC.__katomiaDeeplinkFix) return !!WC
    let wrapped = 0
    for(const name of WRAP){
      const f = WC[name]
      if(typeof f !== "function") continue
      try {
        WC[name] = async function(...args){
          await fix("before:" + name).catch(() => {})
          try { return await f.apply(this, args) }
          finally { fix("after:" + name).catch(() => {}) }
        }
        wrapped++
      } catch {}
    }
    try { WC.__katomiaDeeplinkFix = wrapped } catch {}
    return true
  }
  if(!wrapWC()){
    let tries = 0
    const t = setInterval(() => { if(wrapWC() || ++tries > 60) clearInterval(t) }, 250)   // up to 15s for the bundle to define WC
  }
  // coming back from the wallet after pairing is the moment the bad choice has just been written
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") fix("visible").catch(() => {}) })
  window.addEventListener("focus", () => fix("focus").catch(() => {}))
  fix("load").catch(() => {})

  window.katomiaFixWcDeepLink = fix   // for tests and the console
})()

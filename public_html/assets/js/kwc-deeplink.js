// kwc-deeplink.js — WC-ANDROIDLINK3 (owner 2026-11-07): on Android, send each wallet request's
// "bring the wallet forward" link to HashPack's own app link instead of a wc: link, and repair
// the stored link the first attempt broke. Nothing else. Loaded right after the KWC bundle
// (vendor/walletconnect/kwcScriptTag.php, katapp only).
//
// HOW A REQUEST REACHES THE WALLET (read in kwc.iife.js @4a3351b — WalletConnect Modal 2.7.0 +
// sign-client): after publishing a request to the relay, sign-client opens a redirect so the
// phone brings the wallet forward — `${choice.href}/wc?requestId=…&sessionTopic=…` through
// window.open (_self for an app scheme). choice is localStorage WALLETCONNECT_DEEPLINK_CHOICE; on
// Android the modal stores { href: "wc:<pairing topic>@2", name: "Android" } there. A wc: link
// does bring HashPack forward, which is what matters (a wallet in the background does not hear
// the relay), but HashPack reads it as a new pairing and shows "Pairing error - Error: Missing
// or invalid. pair() uri#relay-protocol". If the choice has no string href, sign-client opens
// nothing at all.
//
// HISTORY — keep it, it is the reason this file is this small:
//  - Baseline (before 7 Nov, katapp 7b041f7 — the revert target): no shim. wc: redirect, HashPack
//    forward with the error. The owner was used to it.
//  - WC-ANDROIDLINK1 (962a0c3): rewrote the choice to the wallet's published link, or href:null.
//    It read WalletConnect's sessions under "…//session"; the storage (unstorage normalizeKey)
//    holds them under "wc@2:client:0.3:session", so it never found one, stored href:null, and
//    REMOVED the redirect. Requests piled up until HashPack was opened by hand. Its test seeded
//    the key as the code names it, not as the storage writes it.
//  - WC-ANDROIDLINK2 (katapp edeafd5): redirect to hashpack://, a 1.8s
//    "did the wallet come forward?" check with a wc: fallback, and a board nudge at 8s. The diag
//    log (12:47–12:53Z, two phones) showed hashpack:// working — signatures back 1–4s after each
//    redirect, nobody opening HashPack by hand — but the check never could tell (every outcome
//    "unclear": focus left, page not yet hidden), and the nudge told the owner to open the wallet
//    on a connection that was DEAD, which was worse than saying nothing. The second phone's mess
//    was a tab loaded before the deploy, still running ANDROIDLINK1, nulling the shared choice
//    and then purging the shared session the newer tab was using.
//  - WC-ANDROIDLINK3 (this): the redirect swap and the repair, no check, no fallback, no nudge.
//
// WHAT IT DOES
//  1. A request redirect built from a wc: choice goes instead to the connected wallet's published
//     link (peer.metadata.redirect.native, then .universal) or, for HashPack (which publishes
//     none: metadata name "HashPack", url "https://localhost"), to hashpack:// — the mobile link
//     HashPack itself registers with WalletConnect (explorer-api.walletconnect.com, read
//     2026-11-07: mobile native "hashpack://", universal "https://link.hashpack.app"; Android app
//     app.hashpack.wallet.twa), i.e. what WalletConnect's own wallet picker opens. Any other wallet
//     keeps the wc: link. The pairing link the modal opens is never touched.
//  2. A stored choice with no usable href (ANDROIDLINK1's href:null) is rebuilt as the modal
//     writes it, from the newest session's pairing topic, so the redirect happens at all.
//  3. One diag line per redirect (wc:redirect) and per repair (wc:deeplink:healed).
// Only on Android, never inside a wallet's in-app browser (Android WebView, "; wv)").
//
// REVERTING THE CODE: `git checkout 7b041f7 -- public_html/vendor/walletconnect/kwcScriptTag.php`
// drops this file from the page (then rebuild dist). Do that only once no phone can still hold
// WC-ANDROIDLINK1's href:null, or keep this file with DEFAULT_MODE = "wc" (repair only).
// REVERTING (no deploy needed for one phone): open any lab1 page with ?wclink=wc and that phone
// is back to the baseline redirect (the repair in 2 still runs: without it a phone that held
// href:null would get no redirect at all); ?wclink=auto undoes it. For everyone: set
// DEFAULT_MODE = "wc" below, or drop the <script> in kwcScriptTag.php once no phone can still
// hold href:null.
// Every IndexedDB read is bounded and read-only (INTENTKEY-TIMEOUT1's lesson).
;(() => {
  const DEFAULT_MODE = "auto"                          // "auto": the wallet's own link; "wc": baseline
  const KEY = "WALLETCONNECT_DEEPLINK_CHOICE"
  const MODE_KEY = "katomia.wc.link"
  const WC_DB = "WALLET_CONNECT_V2_INDEXED_DB", WC_STORE = "keyvaluestorage"
  const HASHPACK_SCHEME = "hashpack://"
  const WRAP = ["signTx", "executeDeal", "authenticate", "connect"]
  // "wc@2:client:0.3//session" as the sign client names it, "wc@2:client:0.3:session" as the
  // storage holds it — match both
  const SESSION_KEY = /(^|[:/])session$/
  // the redirect sign-client builds from a wc: choice (Br$1 in the bundle)
  const REDIRECT = /^(wc:[^?#]*?)\/wc\?(requestId=\d+&sessionTopic=([^&#]+))$/i

  const ua = navigator.userAgent || ""
  const active = /android/i.test(ua) && !/; wv\)/.test(ua)
  const str = v => typeof v === "string" && v.length > 0
  const diag = (msg, data) => { try { window.kdiag?.(msg, data) } catch {} }
  const timed = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))])

  // the per-phone switch: ?wclink=wc | ?wclink=auto
  try {
    const q = new URLSearchParams(location.search).get("wclink")
    if(q === "wc" || q === "auto"){ localStorage.setItem(MODE_KEY, q); diag("wc:deeplink:mode", { set: q }) }
  } catch {}
  const mode = () => { try { const m = localStorage.getItem(MODE_KEY); return m === "wc" || m === "auto" ? m : DEFAULT_MODE } catch { return DEFAULT_MODE } }

  // ---- the wallet's sessions, kept in memory so the redirect can be chosen synchronously ----
  let sessions = []
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
            const wanted = keys.result.filter(k => SESSION_KEY.test(String(k)))
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
    try { for(const k of Object.keys(localStorage)) if(/^wc@2/.test(k) && SESSION_KEY.test(k)){ const v = JSON.parse(localStorage.getItem(k) || "[]"); if(Array.isArray(v)) out.push(...v) } } catch {}
    return out
  }
  let loading = null
  function refresh(){
    if(loading) return loading
    loading = (async () => {
      let got = []
      try { got = await timed(idbSessions(), 1500) } catch {}
      sessions = got.concat(lsSessions()).filter(s => s && s.topic && s.peer && s.peer.metadata)
        .sort((a, b) => (b.expiry || 0) - (a.expiry || 0))
      return sessions
    })().finally(() => { loading = null })
    return loading
  }

  // the link for a wallet, or null to keep the wc: link
  function linkFor(meta){
    const r = (meta && meta.redirect) || {}
    if(str(r.native) && !/^wc:/i.test(r.native)) return { href: r.native, via: "published:native" }
    if(str(r.universal)) return { href: r.universal, via: "published:universal" }
    if(meta && /hashpack/i.test(`${meta.name || ""} ${meta.url || ""}`)) return { href: HASHPACK_SCHEME, via: "hashpack-scheme" }
    return null
  }

  // ---- 1. the one place the redirect is changed ----
  const rawOpen = window.open
  function open(url, target, features){
    try {
      const m = active && typeof url === "string" ? REDIRECT.exec(url) : null
      if(m){
        const s = sessions.find(x => x.topic === m[3]) || null
        const meta = s ? s.peer.metadata : null
        const md = mode()
        const l = md === "auto" ? linkFor(meta) : null
        diag("wc:redirect", { wallet: meta ? meta.name || null : null, session: !!s, mode: md, via: l ? l.via : "wc" })
        if(l){
          const u = `${l.href.replace(/\/$/, "")}/wc?${m[2]}`          // the shape sign-client builds (Br$1)
          return rawOpen.call(window, u, /^https?:/i.test(u) ? "_blank" : (target || "_self"), features)
        }
      }
    } catch {}
    return rawOpen.apply(window, arguments)
  }
  try { window.open = open } catch {}

  // ---- 2. repair a stored choice with no usable href ----
  function heal(why){
    if(!active) return
    let c = null
    try { c = JSON.parse(localStorage.getItem(KEY) || "null") } catch {}
    if(!c || str(c.href)) return                     // nothing stored (desktop flow, or not connected), or fine
    const s = sessions[0]
    if(s && str(s.pairingTopic)){
      try { localStorage.setItem(KEY, JSON.stringify({ href: `wc:${s.pairingTopic}@2`, name: "Android" })) } catch {}
      diag("wc:deeplink:healed", { why, to: "wc", wallet: s.peer.metadata.name || null })
    } else {
      try { localStorage.removeItem(KEY) } catch {}
      diag("wc:deeplink:healed", { why, to: "removed" })
    }
  }
  async function look(why){
    if(!active) return
    await refresh()
    heal(why)
  }

  // sessions read before each request goes out, so its redirect can be chosen
  function wrapWC(){
    const WC = window.WC
    if(!WC || WC.__katomiaDeeplinkFix) return !!WC
    let wrapped = 0
    for(const name of WRAP){
      const f = WC[name]
      if(typeof f !== "function") continue
      try {
        WC[name] = async function(...args){
          if(active) { try { await timed(look("before:" + name), 1600) } catch {} }
          try { return await f.apply(this, args) }
          finally { if(active) look("after:" + name).catch(() => {}) }
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
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "visible") look("visible").catch(() => {}) })
  look("load").catch(() => {})

  window.katomiaFixWcDeepLink = look   // for tests and the console
})()

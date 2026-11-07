// kwc-deeplink.js — WC-ANDROIDLINK2 (owner 2026-11-07): on Android, every wallet request must WAKE
// the wallet, and should not show HashPack's "Pairing error - Error: Missing or invalid. pair()
// uri#relay-protocol" while doing it. Loaded right after the KWC bundle
// (vendor/walletconnect/kwcScriptTag.php).
//
// HOW A REQUEST REACHES THE WALLET (read in kwc.iife.js @4a3351b — WalletConnect Modal 2.7.0 +
// sign-client): after publishing a request to the relay, sign-client opens a "redirect" so the
// phone brings the wallet forward — `${choice.href}/wc?requestId=…&sessionTopic=…`, through
// window.open (target _self for an app scheme, _blank for https). choice is localStorage
// WALLETCONNECT_DEEPLINK_CHOICE. On Android the modal stores { href: "wc:<pairing topic>@2",
// name: "Android" } there, so the redirect is a wc: link: Android hands it to HashPack, which
// comes forward (good) and reads it as a new pairing with no relay-protocol (the error).
// Coming forward is the part that matters: on Android a wallet in the background does not hear
// the relay, so pings time out and requests sit until the wallet is opened by hand.
//
// WC-ANDROIDLINK1 (6 Nov) tried to fix the error by REWRITING the stored choice to the wallet's
// own link, and when it could not find one it stored href:null — no redirect at all. It never
// found one: it looked for sessions under "…//session", but WalletConnect's storage (unstorage)
// normalises keys to "wc@2:client:0.3:session". The diag log of 7 Nov (two Android phones) shows
// the result: "no redirect", 4s ping timeouts, KWC-TIMEOUT, and signatures arriving only after
// HashPack was opened by hand. The owner's words: "Hashpack isn't getting the push".
//
// WHAT THIS DOES NOW. It leaves the stored choice as WalletConnect writes it, so the redirect
// always happens, and changes only WHERE that one window.open goes:
//  1. the link the connected wallet publishes in its session (peer.metadata.redirect.native,
//     then .universal) — the wallet's own word;
//  2. for HashPack without one, its app scheme hashpack:// (UNCERTAIN: that HashPack registers
//     it — nobody has confirmed it, and the WalletConnect registry is not reachable from the
//     session that wrote this; step 3 is why a wrong guess cannot strand a request);
//  3. CHECKED, then FALL BACK: after opening an app link, if the page is still in front and
//     focused ~1.8s later, nothing answered it — the original wc: link is opened at once (the
//     wallet comes forward, with the old error) and that link is remembered as not working, so
//     the next request goes straight to the wc: link. A link that did bring the wallet forward
//     (the page went to the background) is remembered as working.
// Self-heal: a stored choice with no usable href (WC-ANDROIDLINK1's href:null) is put back as the
// modal would have written it, from the session's pairing topic. WC.resetWalletLink also forgets
// what was learned. Each step is a diag line (wc:deeplink:*, wc:redirect*), so the log says which
// link HashPack publishes and whether hashpack:// wakes it.
//
// Not on desktop, not inside a wallet's own in-app browser (an Android WebView, "; wv)"): there
// is nothing to bring forward, and an unknown scheme there could navigate the page away.
// Every IndexedDB read is bounded and read-only (INTENTKEY-TIMEOUT1's lesson).
;(() => {
  const KEY = "WALLETCONNECT_DEEPLINK_CHOICE"
  const MEMO = "katomia.wc.walletLinks"               // { [link]: { ok: bool, at } }
  const WC_DB = "WALLET_CONNECT_V2_INDEXED_DB", WC_STORE = "keyvaluestorage"
  const HASHPACK_SCHEME = "hashpack://"
  const WRAP = ["signTx", "executeDeal", "authenticate", "connect"]
  const CHECK_MS = 1800, CHECK_KNOWN_MS = 3000         // how long an app gets to come forward
  const RETRY_AFTER = 7 * 24 * 3600e3                   // a link that failed is tried again after a week
  // WalletConnect's session store: "wc@2:client:0.3//session" as written, "wc@2:client:0.3:session"
  // once unstorage has normalised it (slashes → colons, repeats collapsed)
  const SESSION_KEY = /(^|[:/])session$/
  // the redirect sign-client builds from a wc: choice (Br$1 in the bundle)
  const REDIRECT = /^(wc:[^?#]*?)\/wc\?(requestId=\d+&sessionTopic=([^&#]+))$/i

  const ua = navigator.userAgent || ""
  const android = /android/i.test(ua)
  const webview = /; wv\)/.test(ua)
  const active = android && !webview

  const read = k => { try { return JSON.parse(localStorage.getItem(k) || "null") } catch { return null } }
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
  const str = v => typeof v === "string" && v.length > 0
  const isWcHref = h => str(h) && /^wc:/i.test(h)
  const timed = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))])
  const diag = (msg, data) => { try { window.kdiag?.(msg, data) } catch {} }
  const scheme = h => str(h) ? (h.match(/^[a-z][a-z0-9+.-]*:(\/\/[^/?#]*)?/i) || [h])[0] : null

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
      got = got.concat(lsSessions()).filter(s => s && s.topic && s.peer && s.peer.metadata)
      if(got.length || !sessions.length) sessions = got.sort((a, b) => (b.expiry || 0) - (a.expiry || 0))
      return sessions
    })().finally(() => { loading = null })
    return loading
  }
  const sessionFor = topic => sessions.find(s => s.topic === topic) || sessions[0] || null
  const isHashPack = meta => !!meta && /hashpack/i.test(`${meta.name || ""} ${meta.url || ""}`)

  // ---- what has been learned about each link ----
  const memo = () => read(MEMO) || {}
  function known(href){
    const m = memo()[href]
    if(!m) return null
    if(m.ok === false && Date.now() - (m.at || 0) > RETRY_AFTER) return null
    return m.ok
  }
  function learn(href, ok){ const m = memo(); m[href] = { ok, at: Date.now() }; write(MEMO, m) }

  // the links worth trying for this wallet, best first; links known not to work are left out
  function candidates(meta){
    const r = (meta && meta.redirect) || {}, out = []
    if(str(r.native) && !isWcHref(r.native)) out.push({ href: r.native, source: "published:native" })
    if(str(r.universal)) out.push({ href: r.universal, source: "published:universal" })
    if(isHashPack(meta) && !out.length) out.push({ href: HASHPACK_SCHEME, source: "hashpack-scheme" })
    return out.filter(c => known(c.href) !== false)
  }
  // the same shape sign-client builds (Br$1): trailing slash dropped, then /wc?<query>
  const build = (base, q) => `${base.replace(/\/$/, "")}/wc?${q}`

  // After opening an app link: did the wallet come forward? A page sent to the background
  // (hidden / pagehide) means yes. Still in front AND focused at the deadline means nothing
  // answered it. Anything in between (focus went to some prompt) is left alone — no fallback.
  function check(c, ms, fallback){
    const t0 = Date.now()
    let hidden = false
    const onHide = () => { if(document.visibilityState === "hidden") hidden = true }
    const onPageHide = () => { hidden = true }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", onPageHide)
    setTimeout(() => {
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", onPageHide)
      const ms_ = Date.now() - t0
      if(hidden || document.visibilityState === "hidden"){
        learn(c.href, true)
        return diag("wc:redirect:result", { via: c.source, link: scheme(c.href), outcome: "wallet-opened", ms: ms_ })
      }
      let focused = true
      try { focused = document.hasFocus() } catch {}
      if(!focused) return diag("wc:redirect:result", { via: c.source, link: scheme(c.href), outcome: "unclear", ms: ms_ })
      learn(c.href, false)
      diag("wc:redirect:result", { via: c.source, link: scheme(c.href), outcome: "nothing-opened", ms: ms_, fallback: "wc" })
      fallback()
    }, ms)
  }

  // ---- the one place the redirect is changed ----
  const rawOpen = window.open
  function open(url, target, features){
    try {
      const m = active && typeof url === "string" ? REDIRECT.exec(url) : null
      if(m){
        const s = sessionFor(m[3]), meta = s ? s.peer.metadata : null
        const c = candidates(meta)[0]
        const base = { wallet: meta ? meta.name || null : null, sessions: sessions.length }
        if(c){
          const u = build(c.href, m[2])
          const https = /^https?:/i.test(u)
          const k = known(c.href)
          diag("wc:redirect", { ...base, via: c.source, link: scheme(c.href), known: k })
          const win = rawOpen.call(window, u, https ? "_blank" : (target || "_self"), features)
          // an https link that is the wallet's own word is trusted as it is: if Android has no app
          // for it, it opens the wallet's site, which says what to do — and "the page went to the
          // background" cannot tell those two apart
          if(!https) check(c, k === true ? CHECK_KNOWN_MS : CHECK_MS, () => rawOpen.call(window, url, target, features))
          return win
        }
        diag("wc:redirect", { ...base, via: "wc", link: "wc:", known: null,
          published: meta && meta.redirect ? { native: meta.redirect.native || null, universal: meta.redirect.universal || null } : null })
      }
    } catch {}
    return rawOpen.apply(window, arguments)
  }
  try { window.open = open } catch {}

  // ---- self-heal the stored choice ----
  // A choice whose href is not a string makes sign-client skip the redirect entirely
  // (`if(typeof href != "string") return`), which is what WC-ANDROIDLINK1 left on phones. Put it
  // back the way the modal writes it, from the newest session's pairing topic.
  function heal(why){
    if(!active) return
    const raw = localStorage.getItem(KEY)
    let c = null
    try { c = JSON.parse(raw || "null") } catch {}
    const s = sessions[0]
    if(c && str(c.href)) return
    if(!s || !str(s.pairingTopic)){
      if(c) { try { localStorage.removeItem(KEY) } catch {} diag("wc:deeplink:healed", { why, from: "unusable", to: "removed" }) }
      return
    }
    write(KEY, { href: `wc:${s.pairingTopic}@2`, name: "Android" })
    diag("wc:deeplink:healed", { why, from: c ? "unusable" : "missing", to: "wc", wallet: s.peer.metadata.name || null })
  }

  let reported = false
  async function look(why){
    if(!active) return
    await refresh()
    heal(why)
    if(reported || !sessions.length) return
    reported = true
    const meta = sessions[0].peer.metadata, r = meta.redirect || {}
    const c = candidates(meta)[0]
    diag("wc:deeplink:state", { why, sessions: sessions.length, wallet: meta.name || null, url: meta.url || null,
      published: { native: r.native || null, universal: r.universal || null },
      will: c ? c.source : "wc", known: c ? known(c.href) : null })
  }

  function wrapWC(){
    const WC = window.WC
    if(!WC || WC.__katomiaDeeplinkFix) return !!WC
    let wrapped = 0
    for(const name of WRAP){
      const f = WC[name]
      if(typeof f !== "function") continue
      try {
        WC[name] = async function(...args){
          // sessions in memory before the request goes out, so its redirect can be chosen
          if(active) { try { await timed(look("before:" + name), 1600) } catch {} }
          try { return await f.apply(this, args) }
          finally { if(active) look("after:" + name).catch(() => {}) }
        }
        wrapped++
      } catch {}
    }
    // "reset wallet link" also forgets the stored choice and what was learned about links
    const reset = WC.resetWalletLink
    if(typeof reset === "function"){
      try {
        WC.resetWalletLink = async function(...args){
          try { localStorage.removeItem(KEY); localStorage.removeItem(MEMO) } catch {}
          sessions = []; reported = false
          diag("wc:deeplink:reset", {})
          return reset.apply(this, args)
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

  // For the board's "open your wallet" nudge: a link known to bring the connected wallet forward
  // (it did before, or the wallet published it), or null. Never a wc: link — that is the error.
  window.katomiaWalletLink = () => {
    if(!active) return null
    const meta = sessions[0] ? sessions[0].peer.metadata : null
    const c = candidates(meta).find(x => x.source.startsWith("published") || known(x.href) === true)
    return c ? { href: c.href, name: (meta && meta.name) || "your wallet", source: c.source } : null
  }
  window.katomiaFixWcDeepLink = look   // for tests and the console
})()

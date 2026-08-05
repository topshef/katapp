
window.createOrderDirty = false
window.pendingCreateOrderAccount = null

// ── build markers + modal diagnostics ─────────────────────────────────────────
// Bump KATOMIA_JS_BUILD on every JS edit. The CSS build marker lives in
// katomia.css (:root --katomia-css-build). Both are surfaced in the diagnostics
// so we can tell, from the server-side kdiag logs, exactly which version of the
// code a given browser is running — and whether a cached (stale) asset is in play.
// CACHE-FRESH1: bump BOTH markers (this + katomia.css --katomia-css-build) with
// every user-visible ship — they went un-bumped for weeks, so the kdiag
// katomia:build event couldn't distinguish a stale device from a fresh one
// (2026-08-05 counter-flex incident: device reported July markers and proved nothing).
const KATOMIA_JS_BUILD = "20260805-orderui1"

// Self-contained diagnostics sender. window.kdiag (from the kpool widget) is
// lazy-loaded only when the signing widget mounts, so it is NOT available when
// the create-order modal opens. We therefore POST straight to /diag ourselves,
// using the exact payload shape diag.php expects.
//
// DEFAULT-ON for rapid iteration (2026-06-26). Remote logging is on for everyone
// unless explicitly disabled. To turn OFF: ?kdiag=0 in the URL, or localStorage
// kdiag_remote="0". When we leave rapid-iteration mode, flip DIAG_DEFAULT_ON back
// to false so it reverts to opt-in.
const DIAG_DEFAULT_ON = true
function katomiaDiagRemoteOn(){
  try {
    const p = new URLSearchParams(location.search).get("kdiag")
    if(p === "1"){ try { localStorage.setItem("kdiag_remote","1") } catch {} ; return true }
    if(p === "0"){ try { localStorage.setItem("kdiag_remote","0") } catch {} ; return false }
    const ls = localStorage.getItem("kdiag_remote")
    if(ls === "1") return true
    if(ls === "0") return false
    return DIAG_DEFAULT_ON
  } catch { return DIAG_DEFAULT_ON }
}

// ── KDIAG-TAG1 (user 2026-07-12): forensic feedback ticker + device slug ─────
// Voice feedback about animations needs a shared clock: "at tag 6/537 the
// glow popped" beats interpolating Otter transcription timestamps (the user's
// own conclusion — transcript stamps don't share a zero with the logs and
// drift). Two pieces, both shown in a small on-screen badge and stamped onto
// every katomiaDiagSend event:
//   TAG — a tick every 3 seconds, derived from WALL-CLOCK epoch (identical
//     across every device/browser at once, no sync handshake): displayed as
//     "6/537" — prefix digit rolls every 1000 ticks (~50 min), last three
//     digits every 3 s. The user quotes the full tag once, then just the
//     trailing digits ("…542"). Because it's pure epoch math, a quoted tag
//     also decodes back to a real 3-second window server-side.
//   DEV — a per-WINDOW slug ("AX372", sessionStorage — two Chrome windows get
//     different slugs) so multi-device/multi-window feedback is attributable:
//     "on Chrome AX372…" — and the kdiag log filters by the same slug.
// URL-gated, normally off: ?ktag=1 turns it on for the session (sticky via
// sessionStorage so in-tab navigation keeps it), ?ktag=0 turns it off.
// The widget's own kdiag (kpool diag.js) events don't carry these fields yet
// — board/game feedback flows through katomiaDiagSend, which does.
function ktagEnabled(){
  try {
    const p = new URLSearchParams(location.search).get("ktag")
    if(p === "1"){ sessionStorage.setItem("ktag_on", "1"); return true }
    if(p === "0"){ sessionStorage.removeItem("ktag_on"); return false }
    return sessionStorage.getItem("ktag_on") === "1"
  } catch { return false }
}
function ktagSlug(){
  try {
    let s = sessionStorage.getItem("ktag_slug")
    if(!s){
      const L = "ACDEFHJKLMNPRTUVWXYZ"   // easy to say aloud; no B/G/I/O/Q/S (sound/shape confusables)
      s = L[Math.floor(Math.random() * L.length)] + L[Math.floor(Math.random() * L.length)]
        + String(Math.floor(Math.random() * 900) + 100)
      sessionStorage.setItem("ktag_slug", s)
    }
    return s
  } catch { return "XX000" }
}
function ktagNow(){
  const tick = Math.floor(Date.now() / 3000)
  return (Math.floor(tick / 1000) % 10) + "/" + String(tick % 1000).padStart(3, "0")
}
const KTAG_ON = ktagEnabled()
if(KTAG_ON){
  const badge = document.createElement("div")
  badge.id = "ktagBadge"
  badge.style.cssText = "position:fixed;top:8px;left:8px;z-index:2147483000;" +
    "background:rgba(0,0,0,.72);color:#fff;font:600 13px/1.4 ui-monospace,monospace;" +
    "padding:4px 9px;border-radius:8px;pointer-events:none;letter-spacing:.5px"
  const paint = () => { badge.textContent = ktagSlug() + " · " + ktagNow() }
  paint()
  setInterval(paint, 500)
  const mount = () => document.body.appendChild(badge)
  if(document.body) mount()
  else document.addEventListener("DOMContentLoaded", mount)
  katomiaDiagSend("ktag:on", { dev: ktagSlug(), tag: ktagNow(), href: location.href })
}

function katomiaDiagSend(msg, data){
  // always mirror locally for live debugging
  try { console.debug("[katomiaDiag]", msg, data ?? "") } catch {}
  try { window.glog?.(msg, data) } catch {}
  try { window.kdiag?.(msg, data) } catch {}   // also feed widget buffer if present

  if(!katomiaDiagRemoteOn()) return

  const ev = { t: new Date().toISOString(), msg, data }
  if(KTAG_ON){ ev.tag = ktagNow(); ev.dev = ktagSlug() }   // KDIAG-TAG1: cross-ref with spoken feedback
  // FEEDBACK-COMMENTARY1: active feedback session (cross-tab, set by the
  // feedback widget) stamps kdiag too -- narration, kflow and kdiag all share
  // the session slug, so a narrated session threads every diagnostic under it.
  try { const s = JSON.parse(localStorage.getItem("kfw_session") || "null"); if(s?.slug) ev.session = s.slug } catch {}

  const payload = JSON.stringify({
    events: [ev],
    page:   location.pathname,
    ua:     navigator.userAgent.slice(0, 200)
  })
  try {
    const blob = new Blob([payload], { type: "application/json" })
    if(navigator.sendBeacon?.("/diag", blob)) return
    fetch("/diag", { method: "POST", body: blob, keepalive: true }).catch(() => {})
  } catch {}
}

// Pull the build string the browser ACTUALLY applied from the loaded stylesheet.
function readAppliedCssBuild(){
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--katomia-css-build")
    return (v || "").trim().replace(/^["']|["']$/g, "") || null
  } catch { return null }
}

// Fetch an asset bypassing the HTTP cache and pull a marker out of its text, so
// we can compare "what the server has now" against "what this browser applied".
// If they differ → the browser is running a cached/stale copy.
async function fetchFreshMarker(url, regex){
  try {
    const res = await fetch(url, { cache: "reload" })
    const txt = await res.text()
    const m = txt.match(regex)
    return {
      ok: res.ok,
      status: res.status,
      marker: m ? m[1] : null,
      lastModified: res.headers.get("last-modified"),
      etag: res.headers.get("etag")
    }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

// short locating path for an element: tag#id.firstclass > … (max 4 levels up)
function elPath(el){
  const parts = []
  let n = el, depth = 0
  while(n && n.nodeType === 1 && depth < 5){
    let s = n.tagName.toLowerCase()
    if(n.id) s += "#" + n.id
    else if(typeof n.className === "string" && n.className.trim())
      s += "." + n.className.trim().split(/\s+/)[0]
    parts.unshift(s)
    n = n.parentElement; depth++
  }
  return parts.join(" > ")
}

// Walk descendants of `root` and find any element whose right edge pokes past
// `limitRight` (the VISIBLE width), or that itself scrolls horizontally — the
// actual cause of "page/modal too wide". Returns the worst few, described enough
// to locate them in the DOM.
function findOverflowCulprits(root, limitRight){
  const out = []
  if(!root) return out
  const els = root.querySelectorAll("*")
  for(const el of els){
    // skip the modal's own subtree — it's fixed/full-screen and just mirrors the
    // (possibly inflated) layout viewport, masking the real page-level culprit
    if(el.closest && el.closest("#createOrderModal")) continue
    const r = el.getBoundingClientRect()
    const over = Math.round(r.right - limitRight)
    if(over > 1 || el.scrollWidth > el.clientWidth + 1){
      const cs = getComputedStyle(el)
      out.push({
        path: elPath(el),
        right: Math.round(r.right),
        width: Math.round(r.width),
        overBy: over,
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        cssWidth: cs.width, minWidth: cs.minWidth,
        whiteSpace: cs.whiteSpace, position: cs.position
      })
    }
  }
  // worst offenders first
  out.sort((a,b) => (b.overBy - a.overBy) || ((b.scrollW-b.clientW) - (a.scrollW-a.clientW)))
  return out.slice(0, 10)
}

// Snapshot of the create-order modal's real geometry + the styles that the
// mobile full-screen fix touches. Pushed to kdiag (→ /diag on the server when
// remote logging is on). Pass a short label for context (e.g. "open:simple-le").
// withCacheCheck: only the first snapshot of a sequence needs to do the (costly)
// fresh-fetch caching comparison.
function katomiaModalDiag(label = "manual", withCacheCheck = true){
  const card = document.querySelector("#createOrderModal .asset-modal-card")
  const vv = window.visualViewport

  const base = {
    label,
    jsBuild: KATOMIA_JS_BUILD,
    cssBuildApplied: readAppliedCssBuild(),
    href: location.href,
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
      visualW: vv ? Math.round(vv.width) : null,
      visualH: vv ? Math.round(vv.height) : null
    },
    media: {
      "max768": window.matchMedia("(max-width:768px)").matches,
      "max699": window.matchMedia("(max-width:699px)").matches,
      "max899": window.matchMedia("(max-width:899px)").matches
    },
    docOverflowX: document.scrollingElement
      ? (document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth)
      : null
  }

  if(card){
    const cs = getComputedStyle(card)
    const r  = card.getBoundingClientRect()
    base.card = {
      // computed styles the mobile fix controls
      width: cs.width, maxWidth: cs.maxWidth,
      height: cs.height, maxHeight: cs.maxHeight,
      borderRadius: cs.borderRadius,
      overflow: cs.overflow, overflowX: cs.overflowX, overflowY: cs.overflowY,
      boxSizing: cs.boxSizing, padding: cs.padding,
      // actual rendered box
      rect: { w: Math.round(r.width), h: Math.round(r.height),
              left: Math.round(r.left), right: Math.round(r.right),
              top: Math.round(r.top) },
      // overflow detection
      scrollW: card.scrollWidth, clientW: card.clientWidth,
      overflowsViewport: Math.round(r.right) > window.innerWidth + 1,
      horizScrolls: card.scrollWidth > card.clientWidth + 1
    }
    // verdict: at <=768 we expect full-screen (maxWidth:none, width≈innerWidth,
    // radius 0) and no horizontal overflow
    if(base.media.max768){
      base.verdict = {
        fullWidthOk: Math.abs(base.card.rect.w - window.innerWidth) <= 1,
        maxWidthNone: cs.maxWidth === "none",
        radiusZero: parseFloat(cs.borderRadius) === 0,
        noHorizOverflow: !base.card.overflowsViewport && !base.card.horizScrolls
      }
    }
    // The real bug: the layout viewport (window.innerWidth) gets stretched
    // wider than the VISIBLE area (visualViewport.width) by some element on the
    // PAGE behind the modal — the fixed full-screen modal then sizes to that
    // inflated layout viewport. So when layout > visual, scan the WHOLE document
    // against the visible width to name the page element forcing the overflow.
    const visualW = vv ? vv.width : window.innerWidth
    base.layoutOverflow = Math.round(window.innerWidth - visualW)
    if(base.layoutOverflow > 2 || base.card.horizScrolls || base.docOverflowX){
      base.culprits = findOverflowCulprits(document.body, visualW)
    }
  } else {
    base.card = null
  }

  katomiaDiagSend("modal:snapshot", base)

  if(!withCacheCheck) return base

  // async caching check — compare applied markers vs fresh server copies
  ;(async () => {
    const [css, js] = await Promise.all([
      fetchFreshMarker((window.KBASE||"") + "/katomia.css", /--katomia-css-build:\s*["']([^"']+)["']/),
      fetchFreshMarker((window.KBASE||"") + "/katomia-modals.js", /KATOMIA_JS_BUILD\s*=\s*["']([^"']+)["']/)
    ])
    const report = {
      label,
      css: { applied: base.cssBuildApplied, fresh: css.marker,
             lastModified: css.lastModified, etag: css.etag,
             stale: !!(css.marker && base.cssBuildApplied && css.marker !== base.cssBuildApplied) },
      js:  { running: KATOMIA_JS_BUILD, fresh: js.marker,
             lastModified: js.lastModified, etag: js.etag,
             stale: !!(js.marker && js.marker !== KATOMIA_JS_BUILD) }
    }
    report.cachingSuspected = report.css.stale || report.js.stale
    katomiaDiagSend("modal:cachecheck", report)
  })()

  return base
}

// expose for manual runs from a phone/desktop console: katomiaDiag()
window.katomiaDiag = katomiaModalDiag

// Fire a sequence of snapshots after the modal opens to catch transient layout
// — "too wide then jumps back". Phases: 0 (first paint), then 60ms / 250ms /
// 800ms / 1600ms to catch async reflows (e.g. currency dropdown populating).
// Only the first snapshot runs the caching check; the rest just measure geometry.
function katomiaModalDiagSequence(type){
  const delays = [0, 60, 250, 800, 1600]
  delays.forEach((ms, i) => {
    setTimeout(() => {
      try { katomiaModalDiag(`open:${type || "?"}@${ms}ms`, i === 0) } catch {}
    }, ms)
  })
  // also catch viewport/resize changes while the modal is open
  const onResize = () => { try { katomiaModalDiag(`resize:${type || "?"}`, false) } catch {} }
  window.addEventListener("resize", onResize)
  window.visualViewport?.addEventListener("resize", onResize)
  // detach when the modal closes (poll for the hidden class)
  const stop = setInterval(() => {
    const m = document.getElementById("createOrderModal")
    if(!m || m.classList.contains("hidden")){
      window.removeEventListener("resize", onResize)
      window.visualViewport?.removeEventListener("resize", onResize)
      clearInterval(stop)
    }
  }, 500)
}

// log the running build once at load so every session records its version,
// even if the modal is never opened
katomiaDiagSend("katomia:build", { jsBuild: KATOMIA_JS_BUILD, cssBuildApplied: readAppliedCssBuild(), href: location.href })

// Record which WalletConnect bundle is live, so a smoke test can be confirmed
// from the server-side kdiag logs. Two signals:
//  • scriptSrc — the kwc.iife.js URL, which carries the snapshot/version segment
//    (e.g. .../snapshots/eb6ac8a/...). Available immediately; works for the
//    ?kwc_version=… A/B override too.
//  • api/buildMeta — read off window.WC once the (deferred, lazy) bundle is ready;
//    apiNew confirms the step-0/1 surface (getNetwork + getAccounts) is present.
function katomiaDiagWcVersion(){
  const scriptEl = document.querySelector('script[src*="/walletconnect/"][src*="kwc"], script[src*="walletconnect-hedera"]')
  const scriptSrc = scriptEl?.getAttribute("src") || null
  const m = scriptSrc && scriptSrc.match(/\/(?:snapshots|releases)\/([^/]+)\//)
  const fromSrc = m ? m[1] : null

  let tries = 0
  const stop = setInterval(() => {
    const wc = window.WC
    if(wc || ++tries > 40){   // ~10s cap (250ms × 40)
      clearInterval(stop)
      katomiaDiagSend("wc:version", {
        scriptSrc,
        fromSrc,                                   // version/commit parsed from URL
        wcReady:   !!wc,
        version:   wc?.version ?? null,            // __BUILD_META__.commit (new bundles only)
        buildMeta: wc?.buildMeta ?? null,
        apiNew:    !!(wc && typeof wc.getNetwork === "function" && typeof wc.getAccounts === "function"),
        api: wc ? Object.keys(wc) : null
      })
    }
  }, 250)
}
katomiaDiagWcVersion()

function toDateTimeLocalValue(ts){
  if(!ts) return ""
  const d = new Date(ts)
  if(Number.isNaN(d.getTime())) return ""
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16)
}

function getCreateOrderExpiresAt(){
  const tif = document.getElementById("createOrderTif")?.value || "GTC"
  if(tif !== "GTD") return null

  const raw = document.getElementById("createOrderExpiresAt")?.value || ""
  if(!raw) return null

  const ts = new Date(raw).getTime()
  return Number.isFinite(ts) ? ts : null
}

function syncCreateOrderExpiryUI(){
  const tif = document.getElementById("createOrderTif")?.value || "GTC"
  const row = document.getElementById("createOrderExpiresAtRow")
  const input = document.getElementById("createOrderExpiresAt")
  if(!row || !input) return

  const show = tif === "GTD"
  row.style.display = show ? "" : "none"
  input.required = show
  if(!show) input.value = ""
}


function accountMatchesInput(account, input){
  return (
    account.label == input ||
    account.id == input ||
    account.id.endsWith(":" + input)
  )
}

function pollUntil(condition, callback, interval = 200, timeout = 10000, onTimeout = null){
  let settled = false
  const poll = setInterval(() => {
    if(condition()){
      settled = true
      clearInterval(poll)
      callback()
    }
  }, interval)
  setTimeout(() => {
    clearInterval(poll)
    if(!settled && onTimeout) onTimeout()
  }, timeout)
}

function refreshCreateOrderAccounts(selectedId = null){

  const accountSelect = document.getElementById("createOrderAccount")
  if(!accountSelect) return

  const currentSelected = selectedId || accountSelect.value
  accountSelect.innerHTML = ""

  getAccounts()
    .filter(account => isMyAccount(account))
    .forEach(account => {

      const option = document.createElement("option")
      option.value = account.id
      option.textContent = account.label || account.id
      accountSelect.appendChild(option)

      if(
        window.pendingCreateOrderAccount &&
        accountMatchesInput(account, window.pendingCreateOrderAccount)
      ){
        selectedId = account.id
        window.pendingCreateOrderAccount = null
      }

    })

  accountSelect.value = selectedId || currentSelected || accountSelect.value

  // Append any WalletConnect-connected accounts not already in the game (async).
  mergeWcAccountsIntoOrderPicklist(accountSelect)

  updateCreateOrderAuthHint()
}

// ORDER-AUTHBADGE1: pre-submit hint showing whether the selected account is reputation-
// bound (a published wallet binding). Purely informational (PROFILE-AUTH-PURPOSE1:
// reputation, not a gate). Reuses getAccountAuthState() from katomia-render-orders.js;
// the account select value is already the publicId:accountId the account view is keyed by.
async function updateCreateOrderAuthHint(){
  const el = document.getElementById("createOrderAuthHint")
  if(!el) return
  const val = document.getElementById("createOrderAccount")?.value || ""
  if(!val || val.startsWith(WC_ORDER_ADD_PREFIX)){ el.textContent = ""; el.className = "create-order-auth-hint"; return }
  const nerd = document.body.classList.contains("nerd")
  const auth = (typeof getAccountAuthState === "function") ? getAccountAuthState(val) : null
  if(!auth){
    el.textContent = nerd
      ? "Not reputation-bound — optionally bind your intent key to a wallet in Profile → Reputation binding to back your orders."
      : "Not reputation-bound (optional)"
    el.className = "create-order-auth-hint unbound"
    return
  }
  // ORDER-AUTHBADGE2: your orders are signed by the session order key — confirm the
  // account's (verified) binding actually covers THAT key, else it won't back these orders.
  let sessionKey = ""
  try { sessionKey = (typeof getKatomiaOrderPubkeyHex === "function") ? await getKatomiaOrderPubkeyHex() : "" } catch {}
  const norm = h => String(h || "").replace(/^0x/, "").toLowerCase()
  const keyMatch = !!(sessionKey && (auth.intentKeys || []).map(norm).includes(norm(sessionKey)))
  // guard against a stale async result if the selection changed while we awaited
  if((document.getElementById("createOrderAccount")?.value || "") !== val) return
  if(keyMatch){
    el.textContent = nerd
      ? `🔷 Reputation-bound & verified — this account published a wallet binding for your intent key (verified on the backend). Signed weight ${auth.weight}/${auth.threshold}.`
      : "🔷 Reputation-bound & verified"
    el.className = "create-order-auth-hint bound"
  } else {
    el.textContent = nerd
      ? "This account has a verified binding, but for a DIFFERENT intent key than this session's — re-raise the commitment (Profile → Reputation binding) so these orders are bound."
      : "Account bound to a different key — re-raise in Profile to back these orders"
    el.className = "create-order-auth-hint warn"
  }
}

// PROFILE-AUTH / ORDER-ASSETS: make a freshly WalletConnect-connected account orderable
// without re-typing it, by merging live WC accounts into this pick list.
//
// IMPLEMENTATION CHOICE — merge-on-form: we union live WC accounts here at build time
// rather than persisting them, so a WC-only account naturally DROPS from the list when
// the wallet is disconnected (nothing to clean up).
// ALTERNATIVE (not taken): remember connected accounts in localStorage (or auto-add
// them to the game on connect) so they persist across disconnects — cleaner if we want
// them to stick, but then removing an account from WalletConnect wouldn't clear it here.
//
// A WC-only account isn't a game account yet (no publicId, no seeded assets), and the
// order builder derives the id via value.split(":")[1] on a "publicId:accountId" value.
// So WC-only options carry a __wcadd__: sentinel; selecting one promotes it via
// addAccounts() (the same path as the ➕ button) so it becomes a real game account.
const WC_ORDER_ADD_PREFIX = "__wcadd__:"

// Ensure a WC account is a real game account (added + asset-seeded) before an order
// references it. Idempotent: resolves true immediately if already present. Returns a
// promise<boolean> so the order-submit gate can await it. addAccounts() seeds assets
// on the backend before the account appears in state, so once it lands it's orderable.
function ensureAccountInGame(accountId){
  return new Promise(resolve => {
    const mine = () => getAccounts().filter(a => isMyAccount(a))
    if(mine().some(a => a.label === accountId)) return resolve(true)
    const before = mine().length
    addAccounts(accountId)
    pollUntil(
      () => mine().length > before || mine().some(a => a.label === accountId),
      () => resolve(true),
      200,
      10000,
      () => resolve(false)
    )
  })
}

async function mergeWcAccountsIntoOrderPicklist(accountSelect){
  if(!accountSelect || typeof kauthWCAccounts !== "function" || !window.WC) return
  const network = gameMeta?.network || ""
  let wc = []
  try { wc = await kauthWCAccounts(network, false) } catch { return }   // false = don't rebuild the shared connector
  if(!wc.length) return
  // account ids already offered as game accounts (option value "publicId:accountId")
  const present = new Set(Array.from(accountSelect.options).map(o => (o.value || "").split(":").pop()))
  for(const id of wc){
    if(present.has(id)) continue
    const opt = document.createElement("option")
    opt.value = WC_ORDER_ADD_PREFIX + id
    opt.textContent = `➕ ${id}`   // pick = joins the game (user 2026-08-05: "add to game" wording retired)
    opt.dataset.wcOnly = "1"
    accountSelect.appendChild(opt)
  }
}

document.addEventListener("click", e => {

  const id = e.target.id
  const modal = document.getElementById("createOrderModal")
  const actions = ["createOrderSubmit","createOrderEdit","createOrderDelete"]

  if(id == "createOrderRateUp")   return stepOrderRate(+1)
  if(id == "createOrderRateDown") return stepOrderRate(-1)

  if(id == "createOrderAccountAdd"){
    // ORDER-ADDACCT1 (user 2026-08-05): the raw prompt() is retired — the shared
    // add-account composer opens in stripped-down mode (WC pick / connect / type;
    // no asset step — the account joins with everything). The picklist refreshes
    // and selects the newcomer when it lands; generous window because the user
    // may be pairing a wallet inside the composer.
    const idsBefore = new Set(getAccounts().filter(a => isMyAccount(a)).map(a => a.id))
    if(typeof openAddAccountModal === "function"){
      openAddAccountModal({ skipAssets: true })
      pollUntil(
        () => getAccounts().filter(a => isMyAccount(a)).length > idsBefore.size,
        () => {
          const newAccount = getAccounts().find(a => isMyAccount(a) && !idsBefore.has(a.id))
          refreshCreateOrderAccounts(newAccount?.id)
        },
        300, 120000)
    } else {
      const input = prompt("Enter account ID")   // fallback if the composer script failed to load
      if(input) addAccounts(input)
    }
    return
  }

  if(id == "createOrderAccountRemove"){
    const accountId = document.getElementById("createOrderAccount").value
    if(!accountId) return
    removeAccount(accountId)
    pollUntil(
      () => !getAccounts().some(a => a.id == accountId),
      () => refreshCreateOrderAccounts()
    )
    return
  }

  if(actions.includes(id) && window.createOrderContext?.orderId && !confirmOrderAction(id)){
    e.preventDefault()
    e.stopImmediatePropagation()
    return false
  }

  if(id == "createOrderClose" || id == "createOrderExit")
    return closeCreateOrderModal()

  if(e.target == modal && !window.createOrderDirty)
    closeCreateOrderModal()

}, true)


function computeAutoMinFill(offerRaw, requestRaw){
  const d = gcd(Math.abs(offerRaw), Math.abs(requestRaw))
  return d > 0 ? { numerator: 1, denominator: d } : null
}

// ORDER-CLONE1: round to 4 significant figures (kills the decimal-heavy noise a
// cloned rate carries; also cleans up floating-point remainders after a step).
function round4sig(x){
  if(!Number.isFinite(x) || x === 0) return x
  return parseFloat(Number(x).toPrecision(4))
}

// +/- rate stepper. Nudges the 4th significant figure so every step lands on a
// clean 4-sig-fig value regardless of the rate's magnitude, then recomputes the
// ratio / integer-math / auto min-fill so the order stays consistent.
function stepOrderRate(dir){
  const rateEl = document.getElementById("createOrderRate")
  if(!rateEl) return
  let cur = parseFloat(rateEl.value)
  if(!Number.isFinite(cur) || cur <= 0){
    cur = 1                                   // seed from a sane base when empty/invalid
  } else {
    const step = Math.pow(10, Math.floor(Math.log10(Math.abs(cur))) - 3)
    cur = round4sig(cur) + dir * step
    if(cur <= 0) cur = step                    // never step to zero / negative
  }
  rateEl.value = round4sig(cur)
  window.minFillWasAutoSet = true              // let min-fill re-auto-calc for the new rate
  validateOrderMath()
  const rawEl = document.getElementById("createOrderRaw")
  const _type = document.getElementById("createOrderType")?.value
  if(rawEl && _type === "simple-ft") rawEl.value = buildSimpleFxRaw()
}




function validateOrderMath(){
  const pairSelect   = document.getElementById("createOrderPair")
  const volumeEl     = document.getElementById("createOrderVolume")
  const rateEl       = document.getElementById("createOrderRate")
  const minFillEl    = document.getElementById("createOrderMinFill")
  const hintEl       = document.getElementById("createOrderIntHint")
  const rateHintEl   = document.getElementById("createOrderRateHint")
  const submitEl     = document.getElementById("createOrderSubmit")
  const side         = document.querySelector('[name="createOrderSide"]:checked')?.value

  const volume = parseFloat(volumeEl?.value)
  const rate   = parseFloat(rateEl?.value)

  // unit labels — always update when pair is selected
  const volumeUnitEl = document.getElementById("createOrderVolumeUnit")
  const rateUnitEl   = document.getElementById("createOrderRateUnit")
  if(pairSelect?.value){
    const pairData = getAcceptedPairs().find(p => p.value === pairSelect.value)
    if(pairData){
      if(volumeUnitEl) volumeUnitEl.textContent = `${pairData.baseLabel} (${pairData.baseDecimals} dp)`
      if(rateUnitEl)   rateUnitEl.textContent   = `${pairData.quoteLabel} (${pairData.quoteDecimals} dp)`
    }
  } else {
    if(volumeUnitEl) volumeUnitEl.textContent = ""
    if(rateUnitEl)   rateUnitEl.textContent   = ""
  }

  // rate hint — always update regardless of other fields
  if(rateHintEl){
    if(Number.isFinite(rate) && rate > 0 && pairSelect?.value){
      const pairData   = getAcceptedPairs().find(p => p.value === pairSelect.value)
      const baseLabel  = pairData?.baseLabel  || "base"
      const quoteLabel = pairData?.quoteLabel || "quote"
      rateHintEl.textContent =
        `1 ${baseLabel} = ${rate} ${quoteLabel}  |  1 ${quoteLabel} = ${(1/rate).toPrecision(6)} ${baseLabel}`
    } else {
      rateHintEl.textContent = ""
    }
  }

  if(!Number.isFinite(volume) || !Number.isFinite(rate) || !side || !pairSelect?.value){
    if(hintEl) hintEl.textContent = ""
    if(submitEl) submitEl.disabled = false
    return
  }

  const baseDecimalsRaw  = pairSelect.selectedOptions[0]?.dataset.baseDecimals
  const quoteDecimalsRaw = pairSelect.selectedOptions[0]?.dataset.quoteDecimals
  if(baseDecimalsRaw == null || quoteDecimalsRaw == null) return

  const baseScale  = 10 ** Number(baseDecimalsRaw)
  const quoteScale = 10 ** Number(quoteDecimalsRaw)

  const offerRaw   = side === "sell"
    ? Math.round(volume * baseScale)
    : Math.round(volume * rate * quoteScale)

  const requestRaw = side === "sell"
    ? Math.round(volume * rate * quoteScale)
    : Math.round(volume * baseScale)

  // auto-fill only when minFill field is NOT focused
  const minFillFocused = document.activeElement === minFillEl
  if((!minFillEl.value.trim() || window.minFillWasAutoSet) && !minFillFocused){
    const auto = computeAutoMinFill(offerRaw, requestRaw)
    if(auto){
      minFillEl.value = `${auto.numerator}/${auto.denominator}`
      window.minFillWasAutoSet = true
    }
  }

  const parts = minFillEl.value.trim().split("/")
  const n = parseInt(parts[0], 10)
  const d = parseInt(parts[1], 10)

  if(parts.length !== 2 || !Number.isInteger(n) || !Number.isInteger(d) || d <= 0){
    if(hintEl) hintEl.textContent = ""
    return
  }

  const valid   = offerRaw % d === 0 && requestRaw % d === 0
  const isDebug = gameMeta?.config?.tradingMode === 'debug'
  const blocked = !valid && !isDebug

  if(hintEl){
    hintEl.innerHTML = ""

    if(valid){
      hintEl.style.color = "#2ecc71"
      hintEl.textContent = "✅ integer math ok"
      if(isDebug)
        hintEl.textContent += `  |  offer: ${offerRaw}  req: ${requestRaw}  gcd: ${gcd(offerRaw, requestRaw)}`

    } else {
      hintEl.style.color = "#e74c3c"

      const nearestBaseRaw = Math.round(Math.round(volume * baseScale) / d) * d
      const nearestVolume  = parseFloat((nearestBaseRaw / baseScale).toFixed(Number(baseDecimalsRaw)))

      const msg = document.createTextNode(`⚠️ nearest valid volume: ${nearestVolume} `)
      const btn = document.createElement("button")
      btn.type = "button"
      btn.textContent = "use"
      btn.style.cssText = "font-size:10px;padding:1px 6px;background:#eee;color:#333;border:1px solid #ccc;border-radius:4px;cursor:pointer;margin-left:4px;"
      btn.onclick = () => {
        volumeEl.value = nearestVolume
        window.minFillWasAutoSet = false
        validateOrderMath()
        document.getElementById("createOrderRaw").value = buildSimpleFxRaw()
      }
      hintEl.appendChild(msg)
      hintEl.appendChild(btn)

      if(isDebug){
        hintEl.appendChild(document.createTextNode(
          `  [debug: submit allowed]  |  offer: ${offerRaw}  req: ${requestRaw}  d: ${d}  offer%d: ${offerRaw%d}  req%d: ${requestRaw%d}`
        ))
      }
    }
  }

  if(submitEl){
    submitEl.disabled      = blocked
    submitEl.style.opacity = blocked ? "0.4" : ""
    submitEl.title         = blocked ? "Adjust volume or min fill — integer math check failed" : ""
  }
}



function openCreateOrderModal(defaults = {}){
  
  
  const pairSelect = document.getElementById("createOrderPair")
  const accountSelect = document.getElementById("createOrderAccount")

  document.getElementById("createOrderRaw").value = ""

  pairSelect.innerHTML = ""
  accountSelect.innerHTML = ""

  getAcceptedPairs().forEach(pair => {

    const option = document.createElement("option")

    option.value = pair.value
    option.textContent = pair.label
    option.dataset.baseDecimals = pair.baseDecimals
    option.dataset.quoteDecimals = pair.quoteDecimals

    pairSelect.appendChild(option)

  })

  refreshCreateOrderAccounts(defaults.accountId)

  window.createOrderContext = defaults

  document.getElementById("createOrderTitle").textContent = defaults.orderId ? "Order" : "Create order"
  document.getElementById("createOrderContext").textContent = defaults.orderId ? `#${defaults.orderId}` : ""
  // document.getElementById("createOrderDev").style.display = defaults.orderId ? "none" : "" 
  document.getElementById("createOrderDev").style.display = ""


  document.getElementById("createOrderType").value = defaults.type || "simple-ft"
  syncOrderTypeUI()

  document.querySelector(
    `[name="createOrderSide"][value="${defaults.side || "sell"}"]`
  ).checked = true

  if(defaults.pair)
    pairSelect.value = defaults.pair

  document.getElementById("createOrderVolume").value = defaults.volume ?? ""
  document.getElementById("createOrderRate").value = defaults.rate != null
    ? parseFloat(Number(defaults.rate).toPrecision(10))
    : ""

  if(defaults.type === "simple-nft" || defaults.type === "simple-le"){
    const setVal = (id, v) => { const el = document.getElementById(id); if(el) el.value = v ?? "" }
    setVal("createCollectibleToken", defaults.token)
    setVal("createCollectibleSerial", defaults.serial)
    setVal("createCollectibleQty", defaults.qty ?? 1)
    const currSel = document.getElementById("createCollectibleCurrency")
    if(currSel && defaults.currency) currSel.value = defaults.currency
    setVal("createCollectiblePrice", defaults.price)
  }
    
  const minFillEl = document.getElementById("createOrderMinFill")
  if(minFillEl)
    minFillEl.value = defaults.minFill
      ? `${defaults.minFill.numerator}/${defaults.minFill.denominator}`
      : ""

  const tifEl = document.getElementById("createOrderTif")
  if(tifEl) tifEl.value = defaults.timeInForce || "GTC"

  const expiresAtEl = document.getElementById("createOrderExpiresAt")
  if(expiresAtEl) expiresAtEl.value = toDateTimeLocalValue(defaults.expiresAt)

  syncCreateOrderExpiryUI()

  // if opening existing order with saved minFill, treat as manual; otherwise allow auto-fill
  window.minFillWasAutoSet = !defaults.minFill

  const _openType = document.getElementById("createOrderType")?.value
  document.getElementById("createOrderRaw").value =
    (_openType === "simple-nft" || _openType === "simple-le") ? buildCollectibleBundle() : buildSimpleFxRaw()
  window.createOrderDirty = false
  renderCreateOrderActions(defaults)
  document.getElementById("createOrderModal").classList.remove("hidden")
  validateOrderMath()

  // capture modal geometry across several frames to catch transient "too wide
  // then jumps back" layout, plus build/caching diagnostics
  try { katomiaModalDiagSequence(_openType) } catch {}

}


function renderCreateOrderActions(defaults = {}){

  const el = document.getElementById("createOrderActions")
  if(!el) return

  el.innerHTML = ""

  const htmlActions = `
      <div class="order-actions">
      <button id="createOrderExit">◀ Back</button>
      </div>  
  `

  if(!defaults.orderId){
    el.innerHTML = `
      <div class="order-actions">
      <button id="createOrderSubmit" data-help="Create a new order">Create new order</button>
      </div>
      ${htmlActions}
    `
    
    return
  }

  const mine = defaults.playerId == currentPlayerId

  el.innerHTML = `
    <div id="orderActionHelp" class="order-action-help"></div>
    <div class="order-actions">
    ${mine ? `<button id="createOrderEdit" data-help="Replace existing order with edited version">Replace</button>` : ""}
    <button id="createOrderSubmit" data-help="Create a new order">Create order</button>
    ${mine ? `<button id="createOrderDelete" data-help="Cancel and remove this order">Delete</button>` : ""}
    </div>
    </div>
    ${htmlActions}  
  `
  //todo move truncate option next to volume ?    
  //  ${mine ? `<button id="createOrderTruncate" data-help="Reduce order to remaining unsettled amount (coming soon)">Truncate</button>` : ""}
  
}


function closeCreateOrderModal(){
  document.getElementById("createOrderModal").classList.add("hidden")
}





document.addEventListener("mouseover",e => {

  const btn = e.target.closest(".order-actions button")
  if(!btn) return

  const help = document.getElementById("orderActionHelp")
  if(help) help.textContent = btn.dataset.help || ""

})

document.addEventListener("mouseout",e => {

  const btn = e.target.closest(".order-actions button")
  if(!btn) return

  const help = document.getElementById("orderActionHelp")
  if(help) help.textContent = ""

})



function confirmOrderAction(action){

  const ctx = window.createOrderContext || {}

  const msg = {
    createOrderSubmit:`Create new order?`,
    createOrderEdit:`Replace order #${ctx.orderId} with edited values?`,
    createOrderDelete:`Delete order #${ctx.orderId}?`
  }

  return confirm(msg[action] || "Continue?")
}


function getCreateOrderData(){

  const raw = document.getElementById("createOrderRaw").value.trim()

  if(raw)
    return raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean)

  const type = document.getElementById("createOrderType")?.value
  const generated = (type === "simple-nft" || type === "simple-le") ? buildCollectibleBundle() : buildSimpleFxRaw()
  return generated ? [generated] : []
}

function syncOrderTypeUI(){
  const type = document.getElementById("createOrderType")?.value
  const isC = type === "simple-nft" || type === "simple-le"
  document.getElementById("simpleOrderPairRow").style.display = isC ? "none" : ""
  document.getElementById("simpleFtRateFields").style.display = isC ? "none" : ""
  document.getElementById("simpleCollectibleFields").style.display = isC ? "" : "none"
  if(!isC) return
  // clear stale FT pair value so validateOrderMath() early-returns and doesn't disable the button
  const pairEl = document.getElementById("createOrderPair")
  if(pairEl) pairEl.value = ""
  const submitEl = document.getElementById("createOrderSubmit")
  if(submitEl){ submitEl.disabled = false; submitEl.style.opacity = "" }
  const isNft = type === "simple-nft"
  document.getElementById("createCollectibleSerialRow").style.display = isNft ? "" : "none"
  document.getElementById("createCollectibleQtyRow").style.display = isNft ? "none" : ""
  populateCollectibleCurrencies()
  document.getElementById("createOrderRaw").value = buildCollectibleBundle()
}

function populateCollectibleCurrencies(){
  const sel = document.getElementById("createCollectibleCurrency")
  if(!sel) return
  const seen = new Set(["HBAR"])
  const opts = [{ id:"HBAR", label:"HBAR", decimals:8 }]
  getAcceptedPairs().forEach(p => {
    if(!seen.has(p.base)){ seen.add(p.base); opts.push({ id:p.base, label:p.baseLabel||p.base, decimals:p.baseDecimals??0 }) }
    if(!seen.has(p.quote)){ seen.add(p.quote); opts.push({ id:p.quote, label:p.quoteLabel||p.quote, decimals:p.quoteDecimals??0 }) }
  })
  sel.innerHTML = opts.map(o => `<option value="${o.id}" data-decimals="${o.decimals}">${o.label}</option>`).join("")
}

function detectCollectibleTokenType(tokenId){
  const hint = document.getElementById("createCollectibleTokenHint")
  if(!tokenId){ if(hint) hint.textContent = ""; return }
  const norm = id => id.includes(".") ? id : `0.0.${id}`
  const assetType = getAssetType(norm(tokenId))
  if(assetType === "UNKNOWN"){ if(hint) hint.textContent = ""; return }  // metadata not loaded yet
  const targetType = assetType === "NFT" ? "simple-nft" : assetType === "LE" ? "simple-le" : null
  if(!targetType){
    if(hint) hint.style.color = "#e74c3c", hint.textContent = `⚠️ Token is type ${assetType} — not a collectible`
    return
  }
  if(hint) hint.style.color = ""
  const typeEl = document.getElementById("createOrderType")
  if(typeEl?.value !== targetType){
    typeEl.value = targetType
    syncOrderTypeUI()
    const label = targetType === "simple-nft" ? "Simple NFT" : "Simple LE"
    if(hint) hint.textContent = `ℹ️ Type updated to ${label}`
  } else {
    if(hint) hint.textContent = ""
  }
}

function buildCollectibleBundle(){
  // TODO: before submit, verify getAssetType(token) matches the selected order type
  // e.g. reject an NFT token ID if type is simple-le (auto-correction was offered on input but user may have overridden)
  const type = document.getElementById("createOrderType")?.value
  const accountId = (document.getElementById("createOrderAccount")?.value || "").split(":")[1] || ""
  const tokenRaw = (document.getElementById("createCollectibleToken")?.value || "").trim()
  const side = document.querySelector('[name="createOrderSide"]:checked')?.value
  const currSel = document.getElementById("createCollectibleCurrency")
  const currency = currSel?.value
  const price = parseFloat(document.getElementById("createCollectiblePrice")?.value)
  if(!accountId || !tokenRaw || !side || !currency || !Number.isFinite(price) || price <= 0) return ""
  const norm = id => id.includes(".") ? id : `0.0.${id}`
  const token = norm(tokenRaw)
  const decimals = Number(currSel?.selectedOptions[0]?.dataset.decimals || 0)
  const priceRaw = Math.round(price * (10 ** decimals))
  if(type === "simple-nft"){
    const serial = (document.getElementById("createCollectibleSerial")?.value || "").trim()
    if(!serial) return ""
    const nft = `${token}#${serial}`
    return side === "sell"
      ? `${accountId};${nft};-1|${accountId};${currency};${priceRaw}`
      : `${accountId};${currency};-${priceRaw}|${accountId};${nft};1`
  }
  if(type === "simple-le"){
    const qty = parseInt(document.getElementById("createCollectibleQty")?.value || "0", 10)
    if(qty <= 0) return ""
    return side === "sell"
      ? `${accountId};${token};-${qty}|${accountId};${currency};${priceRaw}`
      : `${accountId};${currency};-${priceRaw}|${accountId};${token};${qty}`
  }
  return ""
}

function buildSimpleFxRaw(){

  const type = document.getElementById("createOrderType").value
  const accountId = (document.getElementById("createOrderAccount").value || "").split(":")[1] || ""
  const pairSelect = document.getElementById("createOrderPair")
  const pair = pairSelect.value
  const side = document.querySelector('[name="createOrderSide"]:checked')?.value
  const volume = parseFloat(document.getElementById("createOrderVolume").value)
  const rate = parseFloat(document.getElementById("createOrderRate").value)

  if(type != "simple-ft" || !accountId || !pair || !side) return ""
  if(!Number.isFinite(volume) || !Number.isFinite(rate)) return ""

  const [base, quote] = pair.split("/")
  const baseDecimalsRaw = pairSelect.selectedOptions[0]?.dataset.baseDecimals
  const quoteDecimalsRaw = pairSelect.selectedOptions[0]?.dataset.quoteDecimals

  if(baseDecimalsRaw == null || quoteDecimalsRaw == null){
    alert(`HJ39246 ORDER CREATION: missing decimals for pair ${pair} — baseDecimals=${baseDecimalsRaw} quoteDecimals=${quoteDecimalsRaw}`)
    return ""
  }

  const baseScale = 10 ** Number(baseDecimalsRaw)
  const quoteScale = 10 ** Number(quoteDecimalsRaw)
  
  
  const offerAsset = side == "sell" ? base : quote
  const requestAsset = side == "sell" ? quote : base
  const offerAmount = side == "sell" ? Math.round(volume * baseScale) : Math.round(volume * rate * quoteScale)
  const requestAmount = side == "sell" ? Math.round(volume * rate * quoteScale) : Math.round(volume * baseScale)

  return `${accountId};${offerAsset};${-offerAmount}|${accountId};${requestAsset};${requestAmount}`
}


document.addEventListener("input",e => {
  if(!e.target.closest("#createOrderModal")) return
  window.createOrderDirty = true
  if(e.target.id == "createOrderRaw") return
  if(e.target.id == "createOrderMinFill") window.minFillWasAutoSet = false
  if(e.target.id == "createOrderVolume" || e.target.id == "createOrderRate") window.minFillWasAutoSet = true
  if(e.target.id == "createOrderTif") syncCreateOrderExpiryUI()
  if(e.target.id === "createCollectibleToken") detectCollectibleTokenType(e.target.value)
  const _type = document.getElementById("createOrderType")?.value
  if(_type === "simple-ft") document.getElementById("createOrderRaw").value = buildSimpleFxRaw()
  else if(_type === "simple-nft" || _type === "simple-le") document.getElementById("createOrderRaw").value = buildCollectibleBundle()
  validateOrderMath()
})

document.addEventListener("change",e => {
  if(!e.target.closest("#createOrderModal")) return

  // Selecting a WC-only account (merge-on-form sentinel) promotes it into the game via
  // the same addAccounts() path as the ➕ button, then re-selects it once it lands.
  // NOTE: this fires only on a user-initiated change — an auto-selected sentinel (e.g.
  // it's the only option) does NOT fire change, so the submit gate in createOrderFromModal
  // is the reliable backstop that guarantees the account exists before the order is built.
  if(e.target.id == "createOrderAccount" && String(e.target.value).startsWith(WC_ORDER_ADD_PREFIX)){
    const accountId = e.target.value.slice(WC_ORDER_ADD_PREFIX.length)
    try { notify?.(`Adding account ${accountId}…`, "info", { timeout: 2500 }) } catch {}
    ensureAccountInGame(accountId).then(ok => {
      if(ok){
        const real = getAccounts().find(a => isMyAccount(a) && a.label === accountId)
        refreshCreateOrderAccounts(real?.id)
      } else {
        try { notify?.(`Couldn't add account ${accountId} — check the connection and try again`, "error", { timeout: 0 }) } catch {}
      }
    })
    return
  }

  window.createOrderDirty = true
  if(e.target.id == "createOrderAccount") updateCreateOrderAuthHint()   // ORDER-AUTHBADGE1
  if(e.target.id == "createOrderTif") syncCreateOrderExpiryUI()
  if(e.target.id == "createOrderType") syncOrderTypeUI()
  const _type = document.getElementById("createOrderType")?.value
  if(_type === "simple-nft" || _type === "simple-le") document.getElementById("createOrderRaw").value = buildCollectibleBundle()
  validateOrderMath()
})

// auto-fill minFill on blur if left empty
document.getElementById("createOrderMinFill")?.addEventListener("blur", () => {
  if(!document.getElementById("createOrderMinFill").value.trim())
    window.minFillWasAutoSet = true
  validateOrderMath()
})


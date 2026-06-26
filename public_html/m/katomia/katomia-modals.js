
window.createOrderDirty = false
window.pendingCreateOrderAccount = null

// ── build markers + modal diagnostics ─────────────────────────────────────────
// Bump KATOMIA_JS_BUILD on every JS edit. The CSS build marker lives in
// katomia.css (:root --katomia-css-build). Both are surfaced in the diagnostics
// so we can tell, from the server-side kdiag logs, exactly which version of the
// code a given browser is running — and whether a cached (stale) asset is in play.
const KATOMIA_JS_BUILD = "20260626-modalfix-3"

// Self-contained diagnostics sender. window.kdiag (from the kpool widget) is
// lazy-loaded only when the signing widget mounts, so it is NOT available when
// the create-order modal opens. We therefore POST straight to /diag ourselves,
// using the exact payload shape diag.php expects. Remote is gated by the same
// convention as kdiag: ?kdiag=1 URL param OR localStorage kdiag_remote === '1'.
function katomiaDiagRemoteOn(){
  try {
    const p = new URLSearchParams(location.search).get("kdiag")
    if(p === "1"){ try { localStorage.setItem("kdiag_remote","1") } catch {} ; return true }
    if(p === "0"){ try { localStorage.removeItem("kdiag_remote") } catch {} ; return false }
    return localStorage.getItem("kdiag_remote") === "1"
  } catch { return false }
}

function katomiaDiagSend(msg, data){
  // always mirror locally for live debugging
  try { console.debug("[katomiaDiag]", msg, data ?? "") } catch {}
  try { window.glog?.(msg, data) } catch {}
  try { window.kdiag?.(msg, data) } catch {}   // also feed widget buffer if present

  if(!katomiaDiagRemoteOn()) return

  const payload = JSON.stringify({
    events: [{ t: new Date().toISOString(), msg, data }],
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

// Snapshot of the create-order modal's real geometry + the styles that the
// mobile full-screen fix touches. Pushed to kdiag (→ /diag on the server when
// remote logging is on). Pass a short label for context (e.g. "open:simple-le").
function katomiaModalDiag(label = "manual"){
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
  } else {
    base.card = null
  }

  katomiaDiagSend("modal:snapshot", base)

  // async caching check — compare applied markers vs fresh server copies
  ;(async () => {
    const [css, js] = await Promise.all([
      fetchFreshMarker("/m/katomia/katomia.css", /--katomia-css-build:\s*["']([^"']+)["']/),
      fetchFreshMarker("/m/katomia/katomia-modals.js", /KATOMIA_JS_BUILD\s*=\s*["']([^"']+)["']/)
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

// log the running build once at load so every session records its version,
// even if the modal is never opened
katomiaDiagSend("katomia:build", { jsBuild: KATOMIA_JS_BUILD, cssBuildApplied: readAppliedCssBuild(), href: location.href })

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

function pollUntil(condition, callback, interval = 200, timeout = 10000){
  const poll = setInterval(() => {
    if(condition()){
      clearInterval(poll)
      callback()
    }
  }, interval)
  setTimeout(() => clearInterval(poll), timeout)
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
}

document.addEventListener("click", e => {

  const id = e.target.id
  const modal = document.getElementById("createOrderModal")
  const actions = ["createOrderSubmit","createOrderEdit","createOrderDelete"]

  if(id == "createOrderAccountAdd"){
    const input = prompt("Enter account ID")
    if(!input) return
    const idsBefore = new Set(getAccounts().filter(a => isMyAccount(a)).map(a => a.id))
    addAccounts(input)
    pollUntil(
      () => getAccounts().filter(a => isMyAccount(a)).length > idsBefore.size,
      () => {
        const newAccount = getAccounts().find(a => isMyAccount(a) && !idsBefore.has(a.id))
        refreshCreateOrderAccounts(newAccount?.id)
      }
    )
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

  // capture modal geometry + build/caching diagnostics once layout has settled
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { katomiaModalDiag(`open:${_openType || "?"}`) } catch {}
  }))

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
  window.createOrderDirty = true
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


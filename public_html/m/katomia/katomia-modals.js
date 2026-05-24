
window.createOrderDirty = false
window.pendingCreateOrderAccount = null

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

      const nearestOfferRaw = Math.round(offerRaw / d) * d
      const nearestVolume   = side === "sell"
        ? nearestOfferRaw / baseScale
        : nearestOfferRaw / quoteScale / rate

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


  document.getElementById("createOrderType").value = defaults.type || "simple-fx"

  document.querySelector(
    `[name="createOrderSide"][value="${defaults.side || "sell"}"]`
  ).checked = true

  if(defaults.pair)
    pairSelect.value = defaults.pair

  document.getElementById("createOrderVolume").value = defaults.volume ?? ""
  document.getElementById("createOrderRate").value = defaults.rate != null
    ? parseFloat(Number(defaults.rate).toPrecision(10))
    : ""
    
  const minFillEl = document.getElementById("createOrderMinFill")
  if(minFillEl)
    minFillEl.value = defaults.minFill
      ? `${defaults.minFill.numerator}/${defaults.minFill.denominator}`
      : ""

  const tifEl = document.getElementById("createOrderTif")
  if(tifEl) tifEl.value = defaults.timeInForce || "GTC"

  // if opening existing order with saved minFill, treat as manual; otherwise allow auto-fill
  window.minFillWasAutoSet = !defaults.minFill

  document.getElementById("createOrderRaw").value = buildSimpleFxRaw()
  window.createOrderDirty = false
  renderCreateOrderActions(defaults)
  document.getElementById("createOrderModal").classList.remove("hidden")
  validateOrderMath()
  
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

  const generated = buildSimpleFxRaw()

  return generated ? [generated] : []
}

function buildSimpleFxRaw(){

  const type = document.getElementById("createOrderType").value
  const accountId = (document.getElementById("createOrderAccount").value || "").split(":")[1] || ""
  const pairSelect = document.getElementById("createOrderPair")
  const pair = pairSelect.value
  const side = document.querySelector('[name="createOrderSide"]:checked')?.value
  const volume = parseFloat(document.getElementById("createOrderVolume").value)
  const rate = parseFloat(document.getElementById("createOrderRate").value)

  if(type != "simple-fx" || !accountId || !pair || !side) return ""
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
  document.getElementById("createOrderRaw").value = buildSimpleFxRaw()
  validateOrderMath()
})


document.addEventListener("change",e => {
  if(!e.target.closest("#createOrderModal")) return
  window.createOrderDirty = true
  validateOrderMath()
})

// auto-fill minFill on blur if left empty
document.getElementById("createOrderMinFill")?.addEventListener("blur", () => {
  if(!document.getElementById("createOrderMinFill").value.trim())
    window.minFillWasAutoSet = true
  validateOrderMath()
})


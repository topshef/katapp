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

  getAccounts().filter(account => isMyAccount(account)).forEach(account => {

    const option = document.createElement("option")

    option.value = account.id
    option.textContent = account.label || account.id

    accountSelect.appendChild(option)

  })



  window.createOrderContext = defaults

  document.getElementById("createOrderTitle").textContent = defaults.orderId ? "Order" : "Create order"
  document.getElementById("createOrderContext").textContent = defaults.orderId ? `#${defaults.orderId}` : ""
  document.getElementById("createOrderDev").style.display = defaults.orderId ? "none" : "" 


  document.getElementById("createOrderType").value = defaults.type || "simple-fx"

  document.querySelector(
    `[name="createOrderSide"][value="${defaults.side || "sell"}"]`
  ).checked = true

  if(defaults.pair)
    pairSelect.value = defaults.pair

  document.getElementById("createOrderVolume").value = defaults.volume ?? ""
  document.getElementById("createOrderRate").value = defaults.rate ?? ""

  document.getElementById("createOrderRaw").value = buildSimpleFxRaw()
  renderCreateOrderActions(defaults)
  document.getElementById("createOrderModal").classList.remove("hidden")
}


function renderCreateOrderActions(defaults = {}){

  const el = document.getElementById("createOrderActions")
  if(!el) return

  el.innerHTML = ""

  if(!defaults.orderId){
    el.innerHTML = `
    <div class="order-actions">
    <button id="createOrderSubmit" data-help="Create a new order">Create new order</button>
    </div>
    `
    
    return
  }

  const mine = defaults.playerId == currentPlayerId

  el.innerHTML = `
  <div id="orderActionHelp" class="order-action-help"></div>
  <div class="order-actions">
  ${mine ? `<button id="createOrderEdit" data-help="Replace existing order with edited version">Edit</button>` : ""}
  <button id="createOrderSubmit" data-help="Create a new copy of this order">Clone</button>
  ${mine ? `<button id="createOrderDelete" data-help="Cancel and remove this order">Delete</button>` : ""}
  ${mine ? `<button id="createOrderTruncate" data-help="Reduce order to remaining unsettled amount (coming soon)">Truncate</button>` : ""}
  </div>
  `
    
  
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


document.addEventListener("click", e => {
  if(e.target.id == "createOrderClose") closeCreateOrderModal()
})

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
  const baseScale = 10 ** Number(pairSelect.selectedOptions[0]?.dataset.baseDecimals || 0)
  const quoteScale = 10 ** Number(pairSelect.selectedOptions[0]?.dataset.quoteDecimals || 0)

  const offerAsset = side == "sell" ? base : quote
  const requestAsset = side == "sell" ? quote : base
  const offerAmount = side == "sell" ? Math.round(volume * baseScale) : Math.round(volume * rate * quoteScale)
  const requestAmount = side == "sell" ? Math.round(volume * rate * quoteScale) : Math.round(volume * baseScale)

  return `${accountId};${offerAsset};${-offerAmount}|${accountId};${requestAsset};${requestAmount}`
}

document.addEventListener("change", e => {

  if(!e.target.closest("#createOrderModal")) return
  if(e.target.id == "createOrderRaw") return

  document.getElementById("createOrderRaw").value = buildSimpleFxRaw()

})
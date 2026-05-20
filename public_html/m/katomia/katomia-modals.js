function openCreateOrderModal(defaults = {}){
  
  
  const pairSelect = document.getElementById("createOrderPair")
  const accountSelect = document.getElementById("createOrderAccount")

  document.getElementById("createOrderRaw").value = ""

  pairSelect.innerHTML = ""
  accountSelect.innerHTML = ""

  ;[
    {label:"KBRL/KCOP",value:"0.0.3842078/0.0.3841995",baseDecimals:6,quoteDecimals:3},
    {label:"XBAR/USDC",value:"0.0.731861/0.0.456858",baseDecimals:6,quoteDecimals:6},
    {label:"KGBP/USDC",value:"0.0.5850317/0.0.456858",baseDecimals:6,quoteDecimals:6},
    {label:"XBAR/KBRL",value:"0.0.731861/0.0.3842078",baseDecimals:6,quoteDecimals:6},
  ].forEach(pair => {

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
    el.innerHTML = `<button id="createOrderSubmit">Create</button><button id="createOrderCancel">Cancel</button>`
    return
  }

  el.innerHTML = `<button id="createOrderEdit">Edit</button><button id="createOrderSubmit">Clone</button><button id="createOrderDelete">Delete</button><button id="createOrderTruncate">Truncate</button><button id="createOrderCancel">Cancel</button>`
}


function closeCreateOrderModal(){
  document.getElementById("createOrderModal").classList.add("hidden")
}

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
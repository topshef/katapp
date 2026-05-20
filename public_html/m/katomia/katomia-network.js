
/* =========================
   CONTROLS
========================= */


function splitAccountLabels(input){
  const parts = []
  let start = 0
  let depth = 0

  for(let i = 0; i < input.length; i++){
    const ch = input[i]

    if(ch === "(") depth++
    else if(ch === ")") depth = Math.max(0, depth - 1)
    else if(ch === "," && depth === 0){
      const part = input.slice(start, i).trim()
      if(part) parts.push(part)
      start = i + 1
    }
  }

  const last = input.slice(start).trim()
  if(last) parts.push(last)

  return parts
}



addAccountBtn.onclick = () => {
  const raw = accountLabelInput.value.trim()
  if(!raw) return

  const labels = splitAccountLabels(raw)
  const playerToken = getOrCreatePlayerToken()

  const sendAll = () => {
    labels.forEach(label => {
      let out = label

      if(gameMeta.network === "testnet" || gameMeta.network === "mainnet"){
        if(/^\d+$/.test(out)){
          out = "0.0." + out
        }
      }

      socket.send(JSON.stringify({
        type: "game_addAccount",
        gameId,
        playerToken,
        label: out
      }))
    })
  }

  if(!socket || socket.readyState !== WebSocket.OPEN){
    connect(sendAll)
  } else {
    sendAll()
  }

  accountLabelInput.value = ""
}


cancelOrderBtn.onclick = () => {

  const input = prompt("Enter order Id(s)\n\nComma separated")
  if(!input) return

  input.split(",").map(x => x.trim()).filter(Boolean).forEach(orderId => cancelOrder(orderId))
}

createOrderBtn.onclick = () => {
  openCreateOrderModal()
}

document.addEventListener("click", e => {

  if(e.target.id == "createOrderCancel"){
    closeCreateOrderModal()
    return
  }

  if(e.target.id == "createOrderTruncate"){
    alert("Truncate not yet available")
    return
  }

  if(e.target.id == "createOrderDelete"){
    cancelOrder(window.createOrderContext?.orderId)
    closeCreateOrderModal()
    return
  }

  if(e.target.id == "createOrderEdit"){
    cancelOrder(window.createOrderContext?.orderId)
    createOrderFromModal()
    return
  }

  if(e.target.id == "createOrderSubmit"){
    createOrderFromModal()
    return
  }

})

function cancelOrder(orderId){

  if(!orderId) return

  socket.send(JSON.stringify({
    type:"game_orderCancel",
    gameId,
    orderId
  }))
}

function createOrderFromModal(){

  getCreateOrderData().forEach(line => {

    const bundle = normaliseOrder(line)
    const order = {bundle}

    socket.send(JSON.stringify({
      type:"game_orderCreate",
      gameId,
      order
    }))

  })

  closeCreateOrderModal()
}

function normaliseOrder(input){
  try {
    const records = input.split('|').filter(Boolean)
    const result = []

    for (const record of records){
      const [a,b,c] = record.split(';')

      if(!a || !b || c === undefined){
        throw new Error(`Bad record: ${record}`)
      }

      const norm = v => v.includes('.') ? v : `0.0.${v}`

      result.push({
        accountId: norm(a),
        asset: norm(b),
        amount: Number(c)
      })
    }

    return result

  } catch (err) {
    return {
      raw: input,
      error: err.message
    }
  }
}

const showTradingAccounts = document.getElementById("showTradingAccounts")
const showTradedAssets = document.getElementById("showTradedAssets")

viewToggle.onchange = e => {
  viewMode = e.target.checked ? "columns" : "merged"
  render()
}

showTradingAccounts.onchange = e => {

  showActiveOnly = e.target.checked

  // if user unticks trading accounts, traded-only cannot stay active
  if(!showActiveOnly){
    showTradedOnly = false
    showTradedAssets.checked = false
  }

  render()
}

showTradedAssets.onchange = e => {

  showTradedOnly = e.target.checked
  showTradingAccounts.checked = e.target.checked

  // if the trading-accounts checkbox is hidden just sync the state
  if(showTradingAccounts.offsetParent === null)
    showActiveOnly = e.target.checked

  render()
}

/* =========================
   NETWORK
========================= */

function connect(onOpenAction){

  if(socket && socket.readyState === WebSocket.OPEN){
    onOpenAction && onOpenAction()
    return
  }

  if(socket && socket.readyState === WebSocket.CONNECTING){
    onOpenAction && socket.addEventListener("open", onOpenAction, { once:true })
    return
  }

  const WS_URL = "wss://" + window.CONFIG.HAPI_BASE + "/ws"
  console.log({WS_URL})
  socket = new WebSocket(WS_URL)
  

  socket.onopen = () => {

		const payload = {
      type: "game_join",
      gameId,
      playerToken: getOrCreatePlayerToken(),
      playerName: "anon"
    }
	
    socket.send(JSON.stringify(payload))
		glog("payload for game_join", payload)
		
    onOpenAction && onOpenAction()
  }

	
	const alertTimeouts = {warning: 3000, error: 0, info: 3000, success: 4000, event: 5000}
	socket.onmessage = async msg => {

		const data = JSON.parse(msg.data)
		console.log("websocket data received", data)
		
			
		if (data.messages)
			for (const m of data.messages) 
				notify(m.message,m.type, { timeout: alertTimeouts[m.type] ?? 0 }) // persistent
		if(data.type === "game_error") return  // errors included in notify
				
		
		if(data.type !== "game_state") glog(`websocket data IGNORED for type=${data.type}`, data)
		if(data.type !== "game_state") return

    gameMeta = data.meta || null
    state = data.state
    currentPlayerId = data.myPlayerId || null

    if(window.pendingAutoload && accountLabelInput && !accountLabelInput.value){
      accountLabelInput.value = window.pendingAutoload
      window.pendingAutoload = null
      addAccountBtn.click()
    }

		glog(`state received for ${currentPlayerId}`, {gameMeta, state})

		render()
    await enrichVisibleAccounts()
		await enrichVisibleAssets()
		await loadThumbCache()
		render()

	}
	
}



function exitGame(){

	if(socket){
		const playerToken = getOrCreatePlayerToken()

		socket.send(JSON.stringify({
			type: "game_exit",
			gameId,
			playerToken
		}))

		socket.close()
	}

	socket = null
	// currentPlayer = null  //stale
	gameMeta= null
	state = null
	clearSelection()
	gameEl.innerHTML = ""
}



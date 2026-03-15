
/* =========================
   CONTROLS
========================= */

addAccountBtn.onclick = () => {

  let label = accountLabelInput.value.trim()
  if(!label) return

	// allow integer account shorthand
	if(game?.network === "testnet" || game?.network === "mainnet"){
		if(/^\d+$/.test(label)){
			label = "0.0." + label
		}
	}
  const playerToken = getOrCreatePlayerToken()

  const sendAdd = () => {
    socket.send(JSON.stringify({
      type: "game_addAccount",
      gameId,
      playerToken,
      label
    }))
  }

  if(!socket || socket.readyState !== WebSocket.OPEN){
    connect(sendAdd)
  }
  else{
    sendAdd()
  }

  accountLabelInput.value = ""
}

const tradedOnlyCheckbox = document.getElementById("tradedOnly")

viewToggle.onchange = e => {
  viewMode = e.target.checked ? "columns" : "merged"
  render()
}

activeOnlyCheckbox.onchange = e => {

  showActiveOnly = e.target.checked

  // if user unticks trading accounts, traded-only cannot stay active
  if(!showActiveOnly){
    showTradedOnly = false
    tradedOnlyCheckbox.checked = false
  }

  render()
}

tradedOnlyCheckbox.onchange = e => {

  showTradedOnly = e.target.checked

  // traded-only implies trading-accounts-only
  if(showTradedOnly && !activeOnlyCheckbox.checked){
    activeOnlyCheckbox.checked = true
    showActiveOnly = true
  }

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

  socket = new WebSocket("wss://hapi2.hbar.live/live/ws")

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


	socket.onmessage = async msg => {

		const data = JSON.parse(msg.data)
		console.log(data, "websocket data received")
		
		
		if(data.type !== "game_state") glog(`websocket data IGNORED for type=${data.type}`, data)
		if(data.type !== "game_state") return

		game = data.game || null
		state = data.state
		currentPlayerId = data.myPlayerId || null

		glog(`state received for ${currentPlayerId}`, {game, state})

		render()
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
	game = null
	state = null
	clearSelection()
	gameEl.innerHTML = ""
}



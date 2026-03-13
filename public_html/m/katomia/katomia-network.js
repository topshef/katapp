
/* =========================
   CONTROLS
========================= */

addAccountBtn.onclick = () => {

  const label = accountLabelInput.value.trim()
  if(!label) return

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

viewToggle.onchange = e => {
  viewMode = e.target.checked ? "columns" : "merged"
  render()
}

activeOnlyCheckbox.onchange = e => {
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

  socket = new WebSocket("wss://hapi2.hbar.live/live/ws")

  socket.onopen = () => {

    const playerToken = getOrCreatePlayerToken()

    socket.send(JSON.stringify({
      type: "game_join",
      gameId,
      playerToken,
      playerName: "anon"
    }))

    onOpenAction && onOpenAction()
  }

  socket.onmessage = msg => {

    const data = JSON.parse(msg.data)

    if(data.type !== "game_state") return

		game = data.game || null
    state = data.state
    currentPlayerId = data.myPlayerId || null

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



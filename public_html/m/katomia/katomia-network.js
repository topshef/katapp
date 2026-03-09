
/* =========================
   CONTROLS
========================= */

joinBtn.onclick = () => {
  const playerId = playerInput.value.trim()
  if(!playerId) return

  currentPlayer = playerId
  connect()
}

exitBtn.onclick = () => {

  const ok = confirm(
    "Leave the game?\n\nAll of your accounts and assets will be removed."
  )

  if(!ok) return

  exitGame()
}

addAccountBtn.onclick = () => {
  if(!socket || !currentPlayer) return

  const label = accountLabelInput.value.trim()
  if(!label) return

  const playerToken = getOrCreatePlayerToken()

  socket.send(JSON.stringify({
    type: "game_addAccount",
    gameId,
    playerToken,
    label
  }))

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

function connect(){
  if(socket){
    try{
      socket.close()
    }
    catch(err){}
  }

  socket = new WebSocket("wss://hapi2.hbar.live/live/ws")

  socket.onopen = () => {

		const playerToken = getOrCreatePlayerToken()

		socket.send(JSON.stringify({
			type: "game_join",
			gameId,
			playerToken,
			playerName: currentPlayer
		}))

  }

  socket.onmessage = msg => {
    const data = JSON.parse(msg.data)

    if(data.type === "game_state"){
      state = data.state
      render()
    }
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
	currentPlayer = null
	state = null
	clearSelection()
	gameEl.innerHTML = ""
}
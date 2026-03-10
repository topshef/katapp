
    /* =========================
       MODEL / APP STATE
    ========================= */

		const params = new URLSearchParams(window.location.search)
		const gameId = params.get("game") || "playground"

    let socket = null
    // let currentPlayer = null
		// let currentPlayerToken = null
		let currentPlayerId = null  //is this in use?
    let state = null
		let game = null

    let viewMode = window.innerWidth < 700 ? "merged" : "columns"
    let showActiveOnly = false

    let selectedAssetId = null
    let selectedFromAccountId = null
    let selectedFromBasketToAccountId = null


		function getOrCreatePlayerToken(){

			let token = localStorage.getItem("katomiaPlayerToken")

			if(!token){
				token = crypto.randomUUID()
				localStorage.setItem("katomiaPlayerToken", token)
			}

			return token
		}


    /* =========================
       DOM
    ========================= */

    const accountLabelInput = document.getElementById("accountLabelInput")
    const addAccountBtn = document.getElementById("addAccountBtn")
    const viewToggle = document.getElementById("viewToggle")
    const activeOnlyCheckbox = document.getElementById("activeOnly")
    const headerEl = document.getElementById("header")
    const gameEl = document.getElementById("game")

    viewToggle.checked = viewMode === "columns"

    /* =========================
       ACTIONS
    ========================= */

    function offerSelectedToAccount(targetAccountId){
      if(!selectedAssetId) return
      if(!selectedFromAccountId) return

      if(
        targetAccountId === selectedFromAccountId &&
        !selectedFromBasketToAccountId
      ){
        return
      }

      if(
        selectedFromBasketToAccountId &&
        targetAccountId === selectedFromBasketToAccountId
      ){
        return
      }

      if(selectedFromBasketToAccountId){
        socket.send(JSON.stringify({
          type: "game_withdraw",
          gameId,
          fromId: selectedFromAccountId,
          toId: selectedFromBasketToAccountId,
          assetId: selectedAssetId
        }))
      }

      socket.send(JSON.stringify({
        type: "game_offer",
        gameId,
        fromId: selectedFromAccountId,
        toId: targetAccountId,
        assetId: selectedAssetId
      }))

      clearSelection()
      render()
    }

    function setupDropTarget(el, targetAccount){
      el.classList.add("drop-target")

      el.ondragover = e => {
        e.preventDefault()
      }

      el.ondragenter = () => {
        if(!selectedFromAccountId) return
        if(targetAccount.id !== selectedFromAccountId || selectedFromBasketToAccountId){
          el.classList.add("drag-over")
        }
      }

      el.ondragleave = () => {
        el.classList.remove("drag-over")
      }

      el.ondrop = e => {
        e.preventDefault()
        el.classList.remove("drag-over")

        const assetId = e.dataTransfer.getData("assetId")
        const fromAccountId = e.dataTransfer.getData("fromAccountId")
        const fromBasketToAccountId = e.dataTransfer.getData("fromBasketToAccountId") || ""

        if(!assetId || !fromAccountId) return

        if(
          targetAccount.id === fromAccountId &&
          !fromBasketToAccountId
        ){
          return
        }

        if(
          fromBasketToAccountId &&
          targetAccount.id === fromBasketToAccountId
        ){
          return
        }

        if(fromBasketToAccountId){
          socket.send(JSON.stringify({
            type: "game_withdraw",
            gameId,
            fromId: fromAccountId,
            toId: fromBasketToAccountId,
            assetId
          }))
        }

        socket.send(JSON.stringify({
          type: "game_offer",
          gameId,
          fromId: fromAccountId,
          toId: targetAccount.id,
          assetId
        }))

        clearSelection()
        render()
      }

      el.onclick = e => {
        if(e.target !== el) return
        offerSelectedToAccount(targetAccount.id)
      }
    }

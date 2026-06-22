
    /* =========================
       MODEL / APP STATE
    ========================= */


		function getGameId(){

			const params = new URLSearchParams(location.search)
			const game = params.get("game")
			if(game) return game

			const parts = location.pathname.split("/").filter(Boolean)

			const i = parts.indexOf("game")
			if(i >= 0 && parts[i+1])
				return parts[i+1]

			return null
		}
		
		const gameId = getGameId() //|| "demo-playnet"
		

		// if(!gameId)  window.location.href = "contents.html"    // href    → adds history entry
		// if(!gameId)  window.location.replace = "contents.php"    // replace → user can't press Back to the broken page
		// if(!gameId)  window.location.href = "https://hapi2.hbar.live/live/katomia/games"  
		// moved to php

    let socket = null
    // let currentPlayer = null
		// let currentPlayerToken = null
		let currentPlayerId = null  //is this in use?
    let state = null
    let gameMeta = null

    let viewMode = window.innerWidth < 700 ? "merged" : "columns"
    let showActiveOnly = false  // show active accounts only - rows with traded assets
		let showTradedOnly = false  // show traded assets only (reserved/basket)

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


    // Stored as JWK (JSON) in localStorage — same pattern as playerToken
    const PLAYER_KEY_STORAGE = "katomiaPlayerKeypair"

    async function getOrCreatePlayerKeypair() {

      const stored = localStorage.getItem(PLAYER_KEY_STORAGE)

      if (stored) {
        try {
          const { publicKeyJwk, privateKeyJwk } = JSON.parse(stored)
          const privateKey = await crypto.subtle.importKey(
            "jwk", privateKeyJwk,
            { name: "Ed25519" }, false, ["sign"]
          )
          const publicKey = await crypto.subtle.importKey(
            "jwk", publicKeyJwk,
            { name: "Ed25519" }, true, ["verify"]
          )
          return { publicKey, privateKey, publicKeyJwk }
        } catch (err) {
          console.warn("Failed to restore keypair, regenerating", err)
        }
      }

      const keypair = await crypto.subtle.generateKey(
        { name: "Ed25519" }, true, ["sign", "verify"]
      )

      const publicKeyJwk  = await crypto.subtle.exportKey("jwk", keypair.publicKey)
      const privateKeyJwk = await crypto.subtle.exportKey("jwk", keypair.privateKey)

      localStorage.setItem(PLAYER_KEY_STORAGE, JSON.stringify({ publicKeyJwk, privateKeyJwk }))

      return { publicKey: keypair.publicKey, privateKey: keypair.privateKey, publicKeyJwk }
    }
    




    /* =========================
       DOM
    ========================= */

    const accountLabelInput = document.getElementById("accountLabelInput")
    const addAccountBtn  = document.getElementById("addAccountBtn")
    const createOrderBtn = document.getElementById("createOrderBtn")
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

			const accountMap = getAccountMap()
			const fromAccount = accountMap[selectedFromAccountId]

			const available = fromAccount?.assets?.[selectedAssetId] || 1

			const amount = getTransferAmount(selectedAssetId, available)
			if(amount === null) return

			socket.send(JSON.stringify({
				type: "game_offer",
				gameId,
				fromId: selectedFromAccountId,
				toId: targetAccountId,
				assetId: selectedAssetId,
				amount
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
				
				const available = parseInt(e.dataTransfer.getData("available") || "1",10)
				const amount = getTransferAmount(assetId, available)
				if(amount === null) return				
				
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
          assetId,
					amount
        }))

        clearSelection()
        render()
      }

      el.onclick = e => {
        if(e.target !== el) return
        offerSelectedToAccount(targetAccount.id)
      }
    }

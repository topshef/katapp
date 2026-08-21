
    /* =========================
       MODEL / APP STATE
    ========================= */

    // KAT-DEPLOY1b: app base path — "/m/katomia" on swap/labs, "" on a
    // standalone bundle domain where the app is the docroot. Use for every
    // absolute app URL (PHP twin: $katomiaBase in site-config.php).
    window.KBASE = location.pathname.startsWith("/m/katomia") ? "/m/katomia" : ""


		function getGameId(){

			const params = new URLSearchParams(location.search)
			const game = params.get("game")
			if(game) return game

			const parts = location.pathname.split("/").filter(Boolean)

			// BOARD-CLEANUP1: /board/<id> is a server-side-only rewrite
			// (.htaccess → board.php?game=$1) — the browser's address bar and
			// location.pathname/search never change, so this client-side
			// re-derivation has to recognize "board" too, or it returns null
			// here (both branches miss) and the backend rejects the socket
			// join with "Invalid game null".
			const marker = ["game", "board"].find(m => parts.indexOf(m) >= 0)
			const i = marker ? parts.indexOf(marker) : -1
			if(i >= 0 && parts[i+1])
				return parts[i+1]

			return null
		}
		
		const gameId = getGameId() //|| "demo-playnet"

		// TABTARGET1 R2 (user 2026-08-19, retest fail): chat links target a tab by circle
		// name (a.target = <circle id>, katomia-chat.js) — but named targeting only finds
		// a tab whose window.name MATCHES, and no board tab ever named itself, so every
		// click still opened a fresh tab ("t-prop opening a second time"). Name the tab
		// after its circle on EVERY load: set unconditionally, because window.name
		// survives same-tab navigations (the game_moved hop reuses the tab), so a stale
		// name would both miss reuse and let the wrong circle's link hijack this tab.
		if(gameId) try { window.name = decodeURIComponent(gameId) } catch { window.name = gameId }

		// TABTITLE1 (user 2026-08-19): the tab TITLE leads with the circle name too —
		// "katomia — board" told you nothing with several circles open. Circle name
		// first so narrow tabs keep the useful part; the favicon (kicon(), the donut
		// mark) carries the brand, so no emoji and no brand prefix here.
		if(gameId) try { document.title = window.name + " · katomia" } catch {}
		

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


    // Stored as JWK (JSON) in localStorage — same pattern as playerToken.
    // KEY ROTATION is deliberately NOT a feature (user decision 2026-07-07): clearing
    // the browser's site data deletes this key and a fresh one is minted on next load —
    // that IS the rotation path. Anonymous users churn identity that way for free;
    // wallet-bound users have no reason to (they'd just re-raise a binding anyway).
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

      // KATO-PERSONA1: a freshly minted keypair = a brand-new user (key scope IS
      // user scope here — see the rotation note above). Flag Kato's one-time
      // self-intro; katomia-chat.js delivers it in the first circle feed they
      // land in and sets katoIntroSeen. Existing browsers never enter this
      // branch, so no backfill (user decision 2026-08-21: new users only).
      try { if (localStorage.getItem("katoIntroSeen") !== "1") localStorage.setItem("katoIntroPending", "1") } catch (e) {}

      return { publicKey: keypair.publicKey, privateKey: keypair.privateKey, publicKeyJwk }
    }
    




    /* =========================
       DOM
    ========================= */

    const addAccountBtn  = document.getElementById("addAccountBtn")
    const createOrderBtn = document.getElementById("createOrderBtn")
    const viewToggle = document.getElementById("viewToggle")
    const activeOnlyCheckbox = document.getElementById("activeOnly")
    const headerEl = document.getElementById("header")
    const gameEl = document.getElementById("game")

    // Guarded: core is also loaded on non-game pages (index/create — PROFILE-INDEX1)
    // where the game controls don't exist.
    if(viewToggle) viewToggle.checked = viewMode === "columns"

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

			// board page: mark self-initiated so the flight animation skips me
			window.boardNoteLocalMove?.(targetAccountId, selectedFromAccountId, selectedAssetId)
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
        // legacy tap-to-offer completes a selection when one is armed; with no
        // selection (the board retired tap-to-offer, 2026-08-05) a bare felt
        // tap zooms into the player instead (PLAYER-MODAL1 — guarded: the
        // modal only exists where katomia-board.js is loaded).
        if(selectedAssetId){ offerSelectedToAccount(targetAccount.id); return }
        if(typeof boardPlayerModal === "function") boardPlayerModal(targetAccount.playerId)
      }
    }

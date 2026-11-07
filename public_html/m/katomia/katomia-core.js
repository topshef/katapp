
    /* =========================
       MODEL / APP STATE
    ========================= */

    // KAT-DEPLOY1b: app base path — "/m/katomia" on swap/labs, "" on a
    // standalone bundle domain where the app is the docroot. Use for every
    // absolute app URL (PHP twin: $katomiaBase in site-config.php).
    window.KBASE = location.pathname.startsWith("/m/katomia") ? "/m/katomia" : ""
    // ROOT-MOVE1: the same-origin Katomia API. At the root /hapi/<x> is the backend's whole
    // namespace, so Katomia names /hapi/katomia/ itself (site-config.php has the PHP twin).
    window.KAPI = window.KBASE ? window.KBASE + "/hapi" : "/hapi/katomia"

    // PREVIEW-FRAME1 (owner 2026-10-09, found chasing "you're in nearly everything"): the bubble
    // entry (kbubbleopen.js) PRE-LOADS a circle in a hidden full-size iframe the moment you hover
    // or touch its card, so the reveal is instant. That hidden board ran for real: it joined the
    // circle, auto-added your connected accounts (ENTRY-AUTOADD1), recorded a visit, and kept a
    // socket open for as long as the list page lived — so every card you merely brushed seated
    // you, and kept you "active" there. A board that knows it is a preview only paints:
    // katomia-network.js skips seating, restoring and the visit record, and lets the socket go
    // once the first state has painted. The real page (navigated to on click) is unaffected.
    window.KATOMIA_PREVIEW = (() => { try { return !!window.frameElement?.dataset?.kboWarm } catch(e){ return false } })()


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
		
		// SIDECIRCLE-SOFTSWAP1: `let`, not `const` — following a deal to its side circle now
		// re-points this tab in place (katomia-network.js switchGame) instead of reloading
		let gameId = getGameId() //|| "demo-playnet"

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


    // The intent keypair (INTENTKEY-SAFE1 below says where each half lives).
    // KEY ROTATION is deliberately NOT a feature (user decision 2026-07-07): clearing
    // the browser's site data deletes this key and a fresh one is minted on next load —
    // that IS the rotation path. Anonymous users churn identity that way for free;
    // wallet-bound users have no reason to (they'd just re-raise a binding anyway).
    const PLAYER_KEY_STORAGE = "katomiaPlayerKeypair"

    // INTENTKEY-SAFE1 (owner 2026-11-06; kmigrate SECURITY.md 2026-11-06): the PRIVATE half used
    // to sit in localStorage as a JWK, generated extractable — so any script running on the site
    // (an injected one, a compromised third-party file, an extension with page access) could copy
    // it and sign locks and orders as this player. Now the private key is a NON-EXTRACTABLE
    // CryptoKey kept in IndexedDB: it can still sign, and nothing — not even this code — can read
    // it out. localStorage keeps the PUBLIC half only ({ publicKeyJwk }), because two readers need
    // it synchronously (katomiaMyIntentKeyHex, create-game.php's host check).
    //   - an old browser's JWK is moved over once, on first use, and then deleted;
    //   - rotation is unchanged: clearing site data clears both stores and a new key is minted;
    //   - no IndexedDB (some private windows): the old localStorage JWK path, so signing never
    //     breaks; that case is logged and the key is still created non-extractable when it can be.
    const INTENT_DB = "katomia-keys", INTENT_STORE = "keys", INTENT_ID = "intent"
    // INTENTKEY-TIMEOUT1 (owner 2026-11-07: on lab1 "only the home page renders… when I tap into
    // a circle I get a blank page"). The circle's socket join waited on this key, and IndexedDB
    // can simply never answer (iOS Safari is known to leave indexedDB.open hanging) — so the join
    // was never sent and the board never drew. Every IndexedDB step is now bounded, and a store
    // that does not answer is NOT treated as a lost key (that would mint a new identity on a
    // mere stall): the caller gets an error, the join goes ahead keyless, the next call retries.
    const INTENT_DB_MS = 2000
    function intentTimed(p, what){
      return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("intent key store did not answer: " + what)), INTENT_DB_MS))])
    }
    function intentDb(){
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error("no IndexedDB"))
        const req = indexedDB.open(INTENT_DB, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(INTENT_STORE)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    }
    async function intentKeyGet(){
      const db = await intentDb()
      return new Promise((resolve, reject) => {
        const r = db.transaction(INTENT_STORE, "readonly").objectStore(INTENT_STORE).get(INTENT_ID)
        r.onsuccess = () => { resolve(r.result || null); db.close() }
        r.onerror = () => { reject(r.error); db.close() }
      })
    }
    async function intentKeyPut(privateKey){
      const db = await intentDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(INTENT_STORE, "readwrite")
        tx.objectStore(INTENT_STORE).put(privateKey, INTENT_ID)
        tx.oncomplete = () => { resolve(); db.close() }
        tx.onerror = () => { reject(tx.error); db.close() }
      })
    }

    let _playerKeypairPromise = null   // one key per tab, however many callers race for it
    function getOrCreatePlayerKeypair() {
      if (!_playerKeypairPromise)
        _playerKeypairPromise = loadOrCreatePlayerKeypair().catch(err => { _playerKeypairPromise = null; throw err })
      return _playerKeypairPromise
    }

    async function loadOrCreatePlayerKeypair() {
      let stored = null
      try { stored = JSON.parse(localStorage.getItem(PLAYER_KEY_STORAGE) || "null") } catch {}
      const publicOf = jwk => crypto.subtle.importKey("jwk", jwk, { name: "Ed25519" }, true, ["verify"])

      if (stored?.publicKeyJwk) {
        try {
          // 1. the current shape: public half here, private CryptoKey in IndexedDB. A store that
          //    does not answer throws (INTENTKEY-TIMEOUT1) — never mistaken for "no key".
          if (!stored.privateKeyJwk) {
            const held = await intentTimed(intentKeyGet(), "read")
            if (held)
              return { publicKey: await publicOf(stored.publicKeyJwk), privateKey: held, publicKeyJwk: stored.publicKeyJwk }
          }
          // 2. an older browser: move the JWK into a non-extractable key, then drop the JWK
          if (stored.privateKeyJwk) {
            const privateKey = await crypto.subtle.importKey("jwk", stored.privateKeyJwk, { name: "Ed25519" }, false, ["sign"])
            const publicKey = await publicOf(stored.publicKeyJwk)
            try {
              await intentTimed(intentKeyPut(privateKey), "move")   // the JWK is only deleted once stored
              localStorage.setItem(PLAYER_KEY_STORAGE, JSON.stringify({ publicKeyJwk: stored.publicKeyJwk }))
            } catch (err) {
              console.warn("[intent key] IndexedDB unavailable — the key stays in localStorage", err)
            }
            return { publicKey, privateKey, publicKeyJwk: stored.publicKeyJwk }
          }
          // 3. public half, and the store ANSWERED that it holds no private key (IndexedDB
          //    cleared on its own): a new key
          console.warn("[intent key] private key missing — minting a new one")
        } catch (err) {
          // INTENTKEY-TIMEOUT1: a stalled store is not a lost key — keep the identity, fail this call
          if (/did not answer/.test(err?.message || "")) throw err
          console.warn("Failed to restore keypair, regenerating", err)
        }
      }

      // mint: the private key is born non-extractable when IndexedDB can hold it
      let keypair = await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])
      const publicKeyJwk = await crypto.subtle.exportKey("jwk", keypair.publicKey)   // public keys always export
      try {
        await intentTimed(intentKeyPut(keypair.privateKey), "store")
        localStorage.setItem(PLAYER_KEY_STORAGE, JSON.stringify({ publicKeyJwk }))
      } catch (err) {
        // no IndexedDB: fall back to the old shape so the key survives a reload at all
        console.warn("[intent key] IndexedDB unavailable — falling back to localStorage", err)
        keypair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])
        const pub = await crypto.subtle.exportKey("jwk", keypair.publicKey)
        const priv = await crypto.subtle.exportKey("jwk", keypair.privateKey)
        localStorage.setItem(PLAYER_KEY_STORAGE, JSON.stringify({ publicKeyJwk: pub, privateKeyJwk: priv }))
        return finishMint(keypair, pub)
      }
      return finishMint(keypair, publicKeyJwk)
    }

    function finishMint(keypair, publicKeyJwk) {
      // KATO-PERSONA1: a freshly minted keypair = a brand-new user (key scope IS
      // user scope here — see the rotation note above). Flag Kato's one-time
      // self-intro; katomia-chat.js delivers it in the first circle feed they
      // land in and sets katoIntroSeen. Existing browsers never enter this
      // branch, so no backfill (user decision 2026-08-21: new users only).
      try { if (localStorage.getItem("katoIntroSeen") !== "1") localStorage.setItem("katoIntroPending", "1") } catch (e) {}

      return { publicKey: keypair.publicKey, privateKey: keypair.privateKey, publicKeyJwk }
    }


    // ed25519 over JSON.stringify(payload) — the one signing primitive every signed
    // artifact in Katomia uses (order intent signatures, PROP-LOCKSIGN1 lock
    // commitments). It lives HERE, beside the key it signs with, because of a bug
    // found by T:LOCKSCOPE-01 (2026-08-21): it used to live in
    // katomia-render-orders.js, which only game.php loads. buildLockCommitment
    // returns null when signOrder is missing — the deliberate "unsigned locks are
    // still allowed" fallback — so on board.php, the PROPOSAL-MODE page that
    // PROP-LOCKSIGN1 was built for, every lock had been silently unsigned since it
    // shipped. Nothing was broken loudly enough to notice: settlements carried
    // null-signature participants and looked like the pre-signing status quo.
    async function signOrder(signingPayload, privateKey, publicKeyJwk, includePubkey = true) {
      const sigBytes = new TextEncoder().encode(JSON.stringify(signingPayload))
      const sigRaw   = await crypto.subtle.sign("Ed25519", privateKey, sigBytes)
      const sig      = btoa(String.fromCharCode(...new Uint8Array(sigRaw)))
      const out      = { alg: "Ed25519", spec: signingPayload.specVersion, sig }
      if (includePubkey) {
        out.pubkeyHex = atob(publicKeyJwk.x.replace(/-/g, "+").replace(/_/g, "/"))
          .split("").map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
      }
      return out
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
        // PLAYER-MODAL2: this drop-target felt tap is the OTHER way into the modal
        // (setupDropTarget, shared with non-board views) and it names one account —
        // pass it so you land filtered, same as the ring's own felt tap.
        if(typeof boardPlayerModal === "function") boardPlayerModal(targetAccount.playerId, targetAccount.id)
      }
    }

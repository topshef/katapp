
    /* =========================
       VIEW HELPERS
    ========================= */
		
// simple IndexedDB fallback cache
const ThumbDB = (()=>{

  const DB = "thumbCache"
  const STORE = "thumbs"
  let dbPromise

  function open(){
    if(dbPromise) return dbPromise

    dbPromise = new Promise((resolve,reject)=>{
      const req = indexedDB.open(DB,1)

      req.onupgradeneeded = ()=>{
        req.result.createObjectStore(STORE)
      }

      req.onsuccess = ()=>resolve(req.result)
      req.onerror = ()=>reject(req.error)
    })

    return dbPromise
  }

  async function get(key){
    const db = await open()
    return new Promise(res=>{
      const tx = db.transaction(STORE)
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = ()=>res(req.result || null)
      req.onerror = ()=>res(null)
    })
  }

  async function set(key,val){
    const db = await open()
    const tx = db.transaction(STORE,"readwrite")
    tx.objectStore(STORE).put(val,key)
  }

  return {get,set}

})()



async function loadThumbCache(){

  // const urls = Object.values(window.assetDisplayCache || {})
    // .map(m => m?.token_asset_image_URL)
    // .filter(Boolean)


	const urls = [...new Set(
		Object.values(window.assetDisplayCache || {})
			.map(m => m?.token_asset_image_URL)
			.filter(Boolean)
	)]


  glog("thumb preload scan", urls.length)

  for(const url of urls){

    const thumb = await getThumbFromLocal(url)

    if(thumb){
      window.thumbCache[url] = thumb
      glog("thumb cache HIT", url)
    }else{
      glog("thumb cache MISS", url)
    }
  }

}


async function getThumbFromLocal(url){

  if(window.Kache?.getFromCache){
    const rec = await Kache.getFromCache("thumb",{url},"infinite")
    if(rec?.thumb) return rec.thumb
  }

  return await ThumbDB.get(url)
}


async function saveThumbToLocal(url,thumb){

  if(window.Kache?.saveToCache){
    try{
      await Kache.saveToCache("thumb",{url},{thumb})
      return
    }catch{}
  }

  await ThumbDB.set(url,thumb)
}


function isThumbableImage(url){

  if(!url) return false

  const u = String(url).toLowerCase()

  // skip formats we should not thumbnail
  if(
    u.includes(".gif") ||
    u.includes(".mp4") ||
    u.includes(".webm") ||
    u.includes(".mov") ||
    u.includes(".avi") ||
    u.includes(".mkv")
  ){
    return false
  }

  return true
}


// thumbnail cache
window.thumbCache ||= {}
window.thumbPending ||= {}

function getFastThumb(url, imgEl){

	// only thumbnail PNG/JPEG
  if(!isThumbableImage(url))
    return url
	
  if(window.thumbCache[url])
    return window.thumbCache[url]

  if(!window.thumbPending[url]){

    window.thumbPending[url] = true
    glog("generate thumb (new)", url)


    const img = new Image()
    img.crossOrigin = "anonymous"

    img.onload = () => {

      const canvas = document.createElement("canvas")
      canvas.width = 96
      canvas.height = 96

      const ctx = canvas.getContext("2d")
      ctx.drawImage(img,0,0,96,96)

      try{

        const thumb = canvas.toDataURL("image/webp",0.8)

        window.thumbCache[url] = thumb

        // update image already in DOM
        if(imgEl)
          imgEl.src = thumb

        // store in Localbase
        saveThumbToLocal(url, thumb)

      }catch(e){
        console.warn("thumb generation failed", url)
      }
    }

    img.src = url
  }

  return url
}


    function applyAssetClasses(assetEl, assetId, amount){

      const meta = getAssetMeta(assetId)
      if(!meta) return

      const decimals = Number(meta?.token_class?.decimals || 0)

      // LE = zero-decimal fungible with quantity
      if(decimals === 0 && amount > 1){
        assetEl.classList.add("asset-le")
        assetEl.dataset.qty = amount
        return
      }

      // future rules go here ↓
      // e.g. rare, legendary, etc

    }


		function makeAssetEl({
			text,
			assetId,
			ownerAccountId,
			ownerPlayerId,
			reserved = false,
			basket = false,
			clickable = false,
			selected = false
		}){

			const meta = getAssetMeta(assetId)
			const thumb = meta && getAssetThumb(meta)
			const useThumbnail = !!thumb

			const el = document.createElement("div")
			el.className = "asset"

			if(!useThumbnail)
				el.textContent = text

			// BOARD-ARRANGE1: every chip carries its asset id — pair-line lookups
			// and the physics' spawn-at-drop-point matching need it even for
			// assets with no metadata yet (HBAR on the demo board, un-enriched
			// tokens on a fresh join)
			el.dataset.assetId = assetId

			if(meta){
				el.dataset.assetName = text

				const { serial } = parseAssetId(assetId)
				el.dataset.assetName = serial ? text + " #" + serial : text

				el.dataset.assetSymbol = meta.token_class?.symbol || ""
				el.dataset.assetDescription = meta.token_instance_description || ""

				if(useThumbnail){
					el.dataset.thumbKey = thumb // todo change to tokenId-thumb
					el.classList.add("thumb-only")
                    
          const img = document.createElement("img")
          img.className = "asset-thumb"
          img.src = getFastThumb(thumb, img)
          img.decoding = "async"

          img.onerror = () => {
            img.onerror = null   // prevent loop
            img.src = "data:image/svg+xml;utf8,\
              <svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'>\
              <rect width='100%' height='100%' rx='12' fill='%23f2f2f2'/>\
              <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' \
              font-size='40' font-family='Arial, sans-serif' fill='%23bbb'>?</text>\
              </svg>"
            }
          
					el.prepend(img)

				}
			}

			el.dataset.ownerAccount = ownerAccountId || ""
			el.dataset.ownerPlayer = ownerPlayerId || ""

			if(reserved) el.classList.add("reserved")
			if(basket) {
				el.classList.add("basket")
				applyOwnerSleeve(el, ownerPlayerId)
			}

			if(clickable) el.classList.add("clickable")
			if(selected) el.classList.add("selected")

			
			if (useThumbnail) el.style.paddingLeft = "0"

			return el
		}


		/*
		Rendering supports duplicate asset IDs by treating store, reserved, and basket
		as independent sources of truth.

		- Store items come from account.assets (actual inventory).
		- Reserved items are reconstructed from other accounts' baskets (items offered out).
		- Basket items come from account.basket (items offered to this account).

		Because reserved assets are removed from account.assets by the backend, we never
		try to match or mark store items as "reserved". This avoids index/position issues
		duplicate counts rendered from asset map
		*/
		function renderStoreAsset(account, container){
      
      const network = gameMeta.network || ""

			const mine = isMyAccount(account)
			const rendered = []

			Object.entries(account.assets || {}).forEach(([assetId, amount]) => {
				const text = getAssetDisplay(assetId, amount)
				const meta = getAssetMeta(assetId)
				const thumb = meta && getAssetThumb(meta)

				rendered.push({
					assetId,
					amount,
					text,
					thumbKey: thumb || null
				})
			})

			const thumbGroups = {}


      rendered.sort((a, b) => {

        // 1. non-thumbnail first
        if(!a.thumbKey && b.thumbKey) return -1
        if(a.thumbKey && !b.thumbKey) return 1

        // 2. both non-thumb → stable by assetId
        if(!a.thumbKey && !b.thumbKey)
          return a.assetId.localeCompare(b.assetId)

        // 3. both have thumbs → group by thumb
        const t = a.thumbKey.localeCompare(b.thumbKey)
        if(t !== 0) return t

        // 4. fallback stable order inside group
        return a.assetId.localeCompare(b.assetId)
      })


			rendered.forEach(item => {
				if(!item.thumbKey) return

				thumbGroups[item.thumbKey] ||= []
				thumbGroups[item.thumbKey].push(item)
			})

			rendered.forEach(item => {
				const assetEl = makeAssetEl({
					text: item.text,
					assetId: item.assetId,
					ownerAccountId: account.id,
					ownerPlayerId: account.playerId,
					clickable: mine,
					selected: isSelected(item.assetId, account.id, null)
				})

        applyAssetClasses(assetEl, item.assetId, item.amount)

				const group = item.thumbKey ? thumbGroups[item.thumbKey] : null

				if(group && group.length > 1){
					const index = group.findIndex(x => x.assetId === item.assetId)

					assetEl.classList.add("thumb-stack-item")
					assetEl.dataset.stackSize = group.length
					assetEl.dataset.stackIndex = index

					if(index === 0)
						assetEl.classList.add("thumb-stack-first")
					else
						assetEl.classList.add("thumb-stack-collapsed")

					if(index === group.length - 1)
						assetEl.classList.add("thumb-stack-last")
				}

				if(mine){
          assetEl.onclick = (e) => {

            // 🔥 modifier click → open asset page
            if(e.ctrlKey || e.metaKey){
              const tokenSerial = assetEl.dataset.assetId.replace("#", "-")
              const url = `/m/?productId=${network};${tokenSerial}`
              window.open(url, "_blank")
              return
            }            
            
            
            
						if(viewMode === "merged"){
							openAssetModal(item.assetId, account.id, item.amount)
							return
						}

						setSelectedAsset(item.assetId, account.id, null)
					}

					assetEl.draggable = true

					assetEl.ondragstart = e => {
						e.dataTransfer.setData("assetId", item.assetId)
						e.dataTransfer.setData("available", item.amount || 1)
						e.dataTransfer.setData("fromAccountId", account.id)
						e.dataTransfer.setData("fromBasketToAccountId", "")
					}
				}

				container.appendChild(assetEl)
			})
		}
		
		
    function renderReservedColumnAsset(account, container, reservedItem){
      const mine = isMyAccount(account)

			let visibleTo = reservedItem.toAccountId
			let hac // hedera account

			if(reservedItem.toAccountId){
				const toAccount = state.accounts?.[reservedItem.toAccountId]
				const player = toAccount ? state.players[toAccount.playerId] : null
				const name = player?.name || reservedItem.toAccountId
				
				hac = reservedItem.toAccountId.split(":")[1] || reservedItem.toAccountId
				// visibleTo = name + ":" + hac
				visibleTo = hac
			}

			const baseText = getAssetDisplay(reservedItem.assetId, reservedItem.amount || 1)

			const assetEl = makeAssetEl({
				text: reservedItem.toAccountId
					? `${baseText} (to ${visibleTo})`
					: baseText,
				assetId: reservedItem.assetId,
				ownerAccountId: account.id,
				ownerPlayerId: account.playerId,
				reserved: true,
				clickable: mine,
				selected: isSelected(
					reservedItem.assetId,
					account.id,
					reservedItem.toAccountId
				)
			})
      
      applyAssetClasses(assetEl, reservedItem.assetId, reservedItem.amount || 1)

			//for css hover
			assetEl.dataset.assetId = reservedItem.assetId
			assetEl.dataset.toAccount = reservedItem.toAccountId


      if(mine){
        assetEl.onclick = () => {
          const ok = confirm("Withdraw " + reservedItem.assetId + " from " + hac + "?")
          if(!ok) return

          socket.send(JSON.stringify({
            type: "game_withdraw",
            gameId,
            fromId: account.id,
            toId: reservedItem.toAccountId,
            assetId: reservedItem.assetId
          }))

          clearSelection()
        }

        assetEl.draggable = true
        assetEl.ondragstart = e => {
          e.dataTransfer.setData("assetId", reservedItem.assetId)
          e.dataTransfer.setData("fromAccountId", account.id)
          e.dataTransfer.setData("fromBasketToAccountId", reservedItem.toAccountId)
        }
      }

			assetEl.onmouseenter = () => {
				highlightTradePair(reservedItem.assetId, account.id, reservedItem.toAccountId, true)
			}

			assetEl.onmouseleave = () => {
				highlightTradePair(reservedItem.assetId, account.id, reservedItem.toAccountId, false)
			}

      container.appendChild(assetEl)
    }

    function renderBasketAsset(viewingAccount, container, item, accountMap){
      const fromAccountId = getFromAccountId(item)
      const fromAccount = fromAccountId ? accountMap[fromAccountId] : null
      const fromPlayerId = fromAccount ? fromAccount.playerId : ""
      const senderIsMine = fromAccount ? isMyAccount(fromAccount) : false
      const receiverIsMine = isMyAccount(viewingAccount)

      const clickable = senderIsMine || receiverIsMine

			let hac // hedera account
			hac = fromAccountId.split(":")[1] || fromAccountId

			const amount = item.amount || 1

			let label = getAssetDisplay(item.assetId, amount)

			if(fromAccountId){
				const fromAccount = accountMap[fromAccountId]
				const player = fromAccount ? state.players[fromAccount.playerId] : null
				const name = player?.name || fromAccountId

				const labelPart = fromAccountId.split(":")[1] || fromAccountId

				// label = `${getAssetDisplay(item.assetId, amount)} (from ${name}:${labelPart})`
				label = `${getAssetDisplay(item.assetId, amount)} (from ${labelPart})`
			}

      const assetEl = makeAssetEl({
        text: label,
				assetId: item.assetId,
        ownerAccountId: fromAccountId,
        ownerPlayerId: fromPlayerId,
        basket: true,
        clickable
      })

      applyAssetClasses(assetEl, item.assetId, amount)

			//for css hover
			assetEl.dataset.assetId = item.assetId
			assetEl.dataset.toAccount = viewingAccount.id
			
			if(fromAccountId){
				assetEl.onmouseenter = () => {
					highlightTradePair(item.assetId, fromAccountId, viewingAccount.id, true)
				}

				assetEl.onmouseleave = () => {
					highlightTradePair(item.assetId, fromAccountId, viewingAccount.id, false)
				}
			}

      if(clickable){
        assetEl.onclick = () => {
          if(senderIsMine){
						//players arent verified so maybe worth notign who is proposing (or claiming to )
						// const ok = confirm("Withdraw " + item.assetId + " from " + hac + "?")             //ac only
						const ok = confirm("Withdraw " + item.assetId + " from " + fromAccountId + "?")  //includes player
            if(!ok) return

            socket.send(JSON.stringify({
              type: "game_withdraw",
              gameId,
              fromId: fromAccountId,
              toId: viewingAccount.id,
              assetId: item.assetId
            }))

            clearSelection()
            return
          }

          if(receiverIsMine){
            // const ok = confirm("Return " + item.assetId + " to " + fromAccountId + "'s store?")
						const ok = confirm("Return " + item.assetId + " to " + fromAccountId) // eg to p2:0.0.1234  
            if(!ok) return

            socket.send(JSON.stringify({
              type: "game_reject",
              gameId,
              accountId: viewingAccount.id,
              assetId: item.assetId
            }))

            clearSelection()
          }
        }

        if(senderIsMine && fromAccountId){
          assetEl.draggable = true
          assetEl.ondragstart = e => {
            e.dataTransfer.setData("assetId", item.assetId)
            e.dataTransfer.setData("fromAccountId", fromAccountId)
            e.dataTransfer.setData("fromBasketToAccountId", viewingAccount.id)
          }
        }
      }

      container.appendChild(assetEl)
    }

    /* =========================
       RENDERING
    ========================= */

    function makeTxDot(tx){

      const a = document.createElement("a")

      a.textContent = getTxEmoji(tx)
      a.style.fontSize = "12px"
      a.style.textDecoration = "none"

      // KDIAG-BOARDSIGNDOT1: was raw-interpolated + unguarded — a tx without a
      // txid yet produced a literal "...?txid=undefined" link to /m/sign/,
      // landing on an empty sign page (no hex2 in txRead payload)
      a.href = tx.txid
        ? `/m/sign/?network=${encodeURIComponent(tx.network || "")}` +
          `&txid=${encodeURIComponent(tx.txid)}&pch=${encodeURIComponent(tx.pch || "")}`
        : "#"
      if(!tx.txid) a.style.pointerEvents = "none"
      a.target = "_blank"
      
      a.dataset.txid = tx.txid
      a.__tx = tx

      const status =
        String(tx.lifecycle?.status || "PENDING")

      const fills =
        (tx.fills || [])
          .map(fill =>
            `#${fill.orderId} ${fill.numerator}/${fill.denominator}`
          )
          .join(", ")

      const signers =
        (tx.signatures || [])
          .length

      a.title = // padding with spaces as large cursor covering start
        `.    TX ${tx.txid || ""}\n` +
        `     Status: ${status}\n` +
        `     Signatures: ${signers}\n` +
        (fills ? `     Fills: ${fills}` : "")

      return a
    }


		function getTxEmoji(tx){

			// const status = tx.lifecycle?.status
			const status = String(tx.lifecycle?.status || "").toUpperCase()
			
			const isFinal = tx.lifecycle?.isFinalStatus

			if(status === "SUCCESS")
				return "🟩"   // green square

			if(status === "SIGNED")
				return "🟢"   // green circle

			if(isFinal && status !== "SUCCESS")
				return "🟥"   // red square

			return "🟠"     // default pending
		}


		function createTxTimelineEl(account){

			const txMap = getPendingTxAccountMap()

			const accId = account.id.split(":")[1] || account.id
			const entry = txMap[accId]
			const txs = entry?.txs

			if(!txs || !txs.length) return null

			const el = document.createElement("div")
			el.className = "tx-pending"

			txs.forEach(tx => {
				el.appendChild(makeTxDot(tx))
			})

			return el
		}
				
				
		function createAccountInfoEl(account){

			const nameEl = document.createElement("div")
			nameEl.className = "name"

			const player = state.players[account.playerId]
			const name = player?.name || account.playerId
			const label = account.id.split(":")[1] || account.id

			const textEl = document.createElement("div")
            textEl.className = "account-label"  // err but this is actually hedera account id
			textEl.textContent = name && name !== "anon"
				? name + ":" + label
				: label

			// 💠/△ control marker sits IMMEDIATELY after the account id, no padding (per
			// user 2026-07-03 — it was previously over in the mode column, crowding the
			// Trading/Lock control). The △ negative marker may be dropped later so only
			// the positive 💠 shows — both kept for now for debugging.
			textEl.appendChild(createAccountAuthMarker(account))

			nameEl.appendChild(textEl)

            // 👇 NEW XPROOF LABEL
      const id = account.id.split(":")[1] || account.id
      const xLabel = window.accountLabelCache?.[id]

      if(xLabel){
        const subEl = document.createElement("div")
        subEl.className = "account-xproof-label"
        subEl.textContent = xLabel

        nameEl.appendChild(subEl)
      }


			const txEl = createTxTimelineEl(account)
			if(txEl)
				nameEl.appendChild(txEl)

			if(isMyAccount(account)) {
			  nameEl.appendChild(createFillBtn(account))
				nameEl.appendChild(createExitBtn(account))
      }

			applyOwnerSleeve(nameEl, account.playerId)

			nameEl.onmouseenter = () => {
				highlightAssetsForAccount(account.id, true)
			}

			nameEl.onmouseleave = () => {
				highlightAssetsForAccount(account.id, false)
			}

			return nameEl
		}

		function createFillBtn(account){

			const fillBtn = document.createElement("div")
			fillBtn.className = "fill-btn mode-debug"
			// fillBtn.textContent = "🚰"  // see css instead

			fillBtn.onclick = e => {
				e.stopPropagation()

        const input = prompt("Fill account with order.\n\nEnter orderId[,numerator/denominator]")
        if (!input) return
  
        const [orderId, ratio, ...rest] = input.split(',').map(s => s.trim())
        if (!orderId || rest.length) return alert("Bad format. Use: orderId[,n/d]")

        let numerator = 1, denominator = 1

        if (ratio){
          const [n, d] = ratio.split('/')
          if (!n || !d) return alert("Bad fraction. Use n/d")
          numerator = +n
          denominator = +d
          if (!numerator || !denominator) return alert("Invalid numerator/denominator")
        }
  
        socket.send(JSON.stringify({
          type: "game_orderFill",
          gameId,
          orderId,
          numerator: Number(numerator),
          denominator: Number(denominator),
          fillerAccountId: account.hac ?? account.label   // todo upstream rewire naming - deprecate confusing label and use hac or similar
        }))

			}

			return fillBtn
		}

		function createExitBtn(account){

			const exitBtn = document.createElement("div")
			exitBtn.className = "exit-btn"
			exitBtn.textContent = "🗑️"

			exitBtn.onclick = e => {
				e.stopPropagation()
				// KAT-AUTOLOAD2: route through removeAccount() (network.js) — it
				// forgets the label in the localStorage account cache before sending.
				// This button used to send game_removeAccount directly, so the cache
				// kept the label and restoreCachedAccounts() resurrected the account
				// on the next refresh (KAT-AUTOLOAD1 fixed the same leak for whole-
				// game exit; this was the per-account leg).
				removeAccount(account.id)
			}

			return exitBtn
		}


    // ── PROP-LOCKSIGN1: signed lock commitments (proposal mode) ─────────────────
    // Locking now signs a commitment over the CANONICAL BOARD BASIS with the intent
    // key — the proposal-mode twin of order intentSignature, giving reputation bindings
    // something to attach to. Canonical rule (must match backend computeProposalBasis
    // exactly): every basket line item on the board as {amount, assetId, from, to}
    // (public ids), each JSON-encoded, lexicographically sorted, joined into an array
    // string; basisHash = sha256 hex. Signed payload mirrors the order sig convention:
    // {specVersion, gameId, network, basisHash}, ed25519 via signOrder().
    const PROP_SIG_SPEC_FIELDS = ["specVersion","gameId","network","basisHash"]
    const PROP_SIG_SPEC = (async () => {
      const bytes  = new TextEncoder().encode(JSON.stringify(PROP_SIG_SPEC_FIELDS))
      const digest = await crypto.subtle.digest("SHA-256", bytes)
      return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 8)
    })()

    async function sha256Hex(str){
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str))
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("")
    }

    async function computeProposalBasisHash(){
      const lines = []
      for(const account of Object.values(state?.accounts || {})){
        for(const item of account.basket || []){
          // key order matters (JSON.stringify preserves it) — amount, assetId, from, to
          lines.push({ amount: item.amount ?? 1, assetId: item.assetId, from: item.fromId, to: account.id })
        }
      }
      const enc = lines.map(l => JSON.stringify(l)).sort()
      return sha256Hex("[" + enc.join(",") + "]")
    }

    // Build {payload, signature} or null (no key / helpers unavailable → unsigned lock,
    // the pre-PROP-LOCKSIGN1 status quo — visibility, never gating).
    async function buildLockCommitment(basisHash){
      try {
        if(typeof signOrder !== "function" || typeof getOrCreatePlayerKeypair !== "function") return null
        const { privateKey, publicKeyJwk } = await getOrCreatePlayerKeypair()
        const payload = {
          specVersion: await PROP_SIG_SPEC,
          gameId,
          network: gameMeta?.network ?? null,
          basisHash: basisHash || await computeProposalBasisHash()
        }
        const signature = await signOrder(payload, privateKey, publicKeyJwk)
        return { payload, signature }
      } catch(e){
        console.error("[lock] commitment build failed", e)
        try { window.kdiag?.("lock:commitment-build-fail", { error: String(e) }) } catch {}
        return null
      }
    }

    // Auto-re-sign while locked: the board can change WITHOUT unlocking you (someone
    // offers elsewhere), which would silently stale your signature by settlement. Since
    // a persisting lock is already the game's consent model and the intent key signs
    // silently (local key, no wallet prompt), we re-sign the new basis on every state
    // update while any of my accounts is locked. Hash-guard prevents re-send loops.
    let _lockResignBusy = false
    async function maybeRefreshLockCommitment(){
      if(_lockResignBusy) return
      _lockResignBusy = true
      try {
        const mine = Object.values(state?.accounts || {}).filter(a => isMyAccount(a))
        if(!mine.some(a => a.mode === "lock")){ window.__lastLockBasisSent = null; return }
        const basisHash = await computeProposalBasisHash()
        if(basisHash === window.__lastLockBasisSent) return
        const commitment = await buildLockCommitment(basisHash)
        if(!commitment) return
        window.__lastLockBasisSent = basisHash
        socket.send(JSON.stringify({ type: "game_lockCommitment", gameId, commitment }))
        try { window.kdiag?.("lock:commitment-refresh", { basisHash: basisHash.slice(0,12) }) } catch {}
      } finally { _lockResignBusy = false }
    }

    // 💠/△ account-control marker. authBound is PLAYER-aware (backend: the account's
    // verified binding covers THIS player's registered intent key) — so the same account
    // added by two players marks 💠 only for the one who could actually sign the binding.
    // Before any reputation exists this alone proves account control.
    function createAccountAuthMarker(account){
      const nerd = document.body.classList.contains("nerd")
      const el = document.createElement("span")
      el.className = "order-auth-badge" + (account.authBound ? "" : " auth-unverified")
      el.textContent = account.authBound ? "💠" : "△"
      const frac = (account.authThreshold && account.authThreshold > 1)
        ? ` (${account.authWeight}/${account.authThreshold} multisig weight)` : ""
      el.title = account.authBound
        ? (nerd ? `Account control verified — ${account.accountId || account.label} has a published wallet binding for this player's intent key${frac}.`
                : `Verified${frac}`)
        : (nerd ? `Not verified — no published binding ties ${account.accountId || account.label} to this player's intent key.`
                : "Not verified")
      return el
    }

    // ── LOCK-PROGRESS1: cluster lock-progress ─────────────────────────────────
    // Frontend mirror of the backend's grouping (hbarlive katomia.js:
    // getTradeClusters / getActiveAccounts / attemptSettlement) — the graph isn't
    // broadcast, so it's re-derived from the same inputs: each basket item edges
    // the basket owner to item.fromId; connected components are clusters; active =
    // anyone giving or receiving. Who must lock follows gameMeta.lockRule:
    //   cluster → the ACTIVE members of your component (each component counts
    //             independently — disconnected clusters don't relate)
    //   active  → all active accounts game-wide
    //   all     → every account, from the get-go (everyone is required)
    // Keep in sync with the backend if its settlement rules change. Memoized per
    // state broadcast (recomputed once per game_state, not per account row).
    let _lpState = null, _lpMap = null
    function getLockProgress(accountId){
      if(_lpState !== state){ _lpState = state; _lpMap = computeLockProgressMap() }
      return _lpMap.get(accountId) || null
    }

    function computeLockProgressMap(){
      const map = new Map()
      const accounts = Object.values(state?.accounts || {})
      if(!accounts.length) return map
      const lockedOf = ids => ids.filter(id => state.accounts[id]?.mode === "lock").length

      const active = new Set()
      for(const a of accounts){
        if((a.basket || []).length) active.add(a.id)
        for(const item of a.basket || []) if(item.fromId) active.add(item.fromId)
      }

      const rule = gameMeta?.lockRule || "cluster"

      if(rule === "all"){
        const ids = accounts.map(a => a.id)
        const entry = { total: ids.length, locked: lockedOf(ids), scope: "whole game" }
        ids.forEach(id => map.set(id, entry))
        return map
      }

      if(rule === "active"){
        const ids = [...active]
        if(ids.length < 2) return map   // no bar until there's real participation
        const entry = { total: ids.length, locked: lockedOf(ids), scope: "all active traders", groupId: "active" }
        ids.forEach(id => map.set(id, entry))
        return map
      }

      // cluster: connected components over basket edges
      const graph = {}
      accounts.forEach(a => graph[a.id] = new Set())
      for(const a of accounts)
        for(const item of a.basket || []){
          if(!item.fromId) continue
          graph[a.id].add(item.fromId)
          graph[item.fromId]?.add(a.id)
        }
      const seen = new Set()
      for(const id of Object.keys(graph)){
        if(seen.has(id)) continue
        const stack = [id], comp = []
        while(stack.length){
          const n = stack.pop()
          if(seen.has(n)) continue
          seen.add(n)
          comp.push(n)
          for(const m of graph[n]) if(!seen.has(m)) stack.push(m)
        }
        const members = comp.filter(cid => active.has(cid))
        if(members.length < 2) continue   // singleton / not participating — no bar
        // groupId keys the hover cross-highlight (stable per broadcast: the lowest member id)
        const entry = { total: members.length, locked: lockedOf(members), scope: "this cluster", groupId: "c:" + members.slice().sort()[0] }
        members.forEach(cid => map.set(cid, entry))
      }
      return map
    }

    function createAccountModeEl(account){

      const wrap = document.createElement("div")

      // (the 💠/△ control marker moved to sit right after the account id in
      // createAccountInfoEl — it crowded the Trading/Lock control here)

      const modeEl = document.createElement("div")
      modeEl.className = "mode"

      modeEl.textContent =
        account.mode === "lock"
          ? "🔒 Locked"
          : "🔁 Trading"

      if(isMyAccount(account)){
        modeEl.classList.add("clickable")

        modeEl.onclick = async () => {
          // PROP-LOCKSIGN1: locking signs the board basis; unlocking sends plain (the
          // backend discards the stored commitment on unlock).
          const locking = account.mode !== "lock"
          let commitment = null
          if(locking) commitment = await buildLockCommitment()
          socket.send(JSON.stringify({
            type: "game_toggleLock",
            gameId,
            accountId: account.id,
            ...(commitment ? { commitment } : {})
          }))
          window.__lastLockBasisSent = locking ? (commitment?.payload?.basisHash ?? null) : null
        }
      }

      wrap.appendChild(modeEl)

      // LOCK-PROGRESS1: ruler-style consensus line under the mode — one segment per
      // required locker, trading-blue flipping to locked-orange as members lock.
      // Segments are anonymous and in stable (cluster-traversal) order for v1; a
      // subtle own-segment highlight is a possible refinement. Tooltip carries the
      // count; nerd mode adds the remainder.
      const lp = getLockProgress(account.id)
      if(lp){
        const bar = document.createElement("div")
        bar.className = "lockbar"
        const nerd = document.body.classList.contains("nerd")
        bar.title = `${lp.locked} of ${lp.total} locked (${lp.scope})`
          + (nerd && lp.locked < lp.total ? ` — ${lp.total - lp.locked} more needed to strike` : "")
        for(let i = 0; i < lp.total; i++){
          const seg = document.createElement("span")
          seg.className = "lockbar-seg" + (i < lp.locked ? " lockbar-seg--locked" : "")
          bar.appendChild(seg)
        }
        wrap.appendChild(bar)

        // Hovering any member's toggle cross-highlights the WHOLE lock group (which
        // rows share your consensus count — otherwise indistinguishable when several
        // clusters coexist). Markup carries the intent (data-lockgroup + .lockgroup-hl);
        // the look lives in CSS. Skipped for lockRule "all" — highlighting every row
        // says nothing (per user).
        if(lp.groupId){
          wrap.dataset.lockgroup = lp.groupId
          modeEl.addEventListener("mouseenter", () =>
            document.querySelectorAll(`[data-lockgroup="${CSS.escape(lp.groupId)}"]`)
              .forEach(el => el.classList.add("lockgroup-hl")))
          modeEl.addEventListener("mouseleave", () =>
            document.querySelectorAll(".lockgroup-hl")
              .forEach(el => el.classList.remove("lockgroup-hl")))
        }
      }

      return wrap
    }


		function renderAccountAssets(account, container, reservedByAccount, accountMap){

			setupDropTarget(container, account)

			if(!showTradedOnly)
					renderStoreAsset(account, container)

			;(reservedByAccount[account.id] || []).forEach(item => {
				renderReservedColumnAsset(account, container, item)
			})

			account.basket.forEach(item => {
				renderBasketAsset(account, container, item, accountMap)
			})
		}

		function renderColumnsAccount(account, reservedByAccount, accountMap){

			const rowEl = document.createElement("div")
			rowEl.className = "account-row columns"

			rowEl.dataset.playerId = account.playerId
			rowEl.dataset.accountId = account.id
			rowEl.dataset.mode = account.mode
			rowEl.dataset.mine = isMyAccount(account) ? "true" : "false"

			const nameEl = createAccountInfoEl(account)
			const modeEl = createAccountModeEl(account)

			const storeCol = document.createElement("div")
			storeCol.className = "column"

			const reservedCol = document.createElement("div")
			reservedCol.className = "column"

			const basketCol = document.createElement("div")
			basketCol.className = "column"

			setupDropTarget(basketCol, account)

			renderStoreAsset(account, storeCol)

			;(reservedByAccount[account.id] || []).forEach(item => {
				renderReservedColumnAsset(account, reservedCol, item)
			})

			account.basket.forEach(item => {
				renderBasketAsset(account, basketCol, item, accountMap)
			})

			rowEl.appendChild(nameEl)
			rowEl.appendChild(modeEl)
			rowEl.appendChild(storeCol)
			rowEl.appendChild(reservedCol)
			rowEl.appendChild(basketCol)

			return rowEl
		}

		function renderMergedAccount(account, reservedByAccount, accountMap){

			const rowEl = document.createElement("div")
			rowEl.className = "account-row merged"

			rowEl.dataset.playerId = account.playerId
			rowEl.dataset.accountId = account.id
			rowEl.dataset.mode = account.mode
			rowEl.dataset.mine = isMyAccount(account) ? "true" : "false"

			const settingsEl = document.createElement("div")
			settingsEl.className = "settings"

			const nameEl = createAccountInfoEl(account)
			const modeEl = createAccountModeEl(account)

			settingsEl.appendChild(nameEl)
			settingsEl.appendChild(modeEl)

			const assetsEl = document.createElement("div")
			assetsEl.className = "assets"

			renderAccountAssets(account, assetsEl, reservedByAccount, accountMap)

			rowEl.appendChild(settingsEl)
			rowEl.appendChild(assetsEl)

			return rowEl
		}

    // GAME-LABELS1: same icon/label lookup as contents.php's (games-list index page)
    // displayLookup/displayValue/formatJoinRule — copied rather than imported because
    // the index page declares them inline in its own <script> block, not as an
    // exportable module. TODO: unify to one shared source once it's clear which side
    // should own it.
    const displayLookup = {
      tradingMode: { proposal: "💡 Proposal", orderBook: "📊 Order Book", debug: "🛠️ debug" },
      network: { playnet: "🧸 Playnet", testnet: "🟠 Testnet", mainnet: "🟣 Mainnet" },
      visibility: { public: "🌍 Public", unlisted: "🔗 Unlisted", private: "🔒 Private" },
      lockRule: { cluster: "☆ cluster", active: "☆☆ active", all: "🌍 all" },
      joinRule: { '*': "🙌 anyone" },
    }

    function displayValue(group, value){
      return displayLookup[group]?.[value] || value || ""
    }

    function formatJoinRule(rule){
      if(typeof rule === "string") return displayValue("joinRule", rule)

      // allowlist array or {rule,params} object → members-only chip
      if(Array.isArray(rule)) return "🔐 listed accounts"

      if(rule && rule.rule){
        return "🔐 " + rule.rule + "(" + (rule.params || []).join(",") + ")"
      }

      return ""
    }

    // ┬─┐┌─┐┌┐┌┌┬┐┌─┐┬─┐  ╔═╗┌─┐┌┐┌┌─┐┬┌─┐  ╔╦╗┌─┐┌┬┐┌─┐
    // ├┬┘├┤ │││ ││├┤ ├┬┘  ║  │ ││││├┤ ││ ┬  ║║║├┤  │ ├─┤
    // ┴└─└─┘┘└┘─┴┘└─┘┴└─  ╚═╝└─┘┘└┘└  ┴└─┘  ╩ ╩└─┘ ┴ ┴ ┴
    // render Config Meta
    function renderConfigMeta(config){
      if(!config) return ""

      const formats = {
        txDelaySeconds: "Strike in {} seconds",
        tradingMode: "Trading mode: {}"
      }

      const entries = Object.entries(config)
      if(!entries.length) return ""

      return entries
        .map(([k,v]) => {
          if(Array.isArray(v) || (v && typeof v === 'object')) return null
          const shown = displayLookup[k] ? displayValue(k, v) : v
          if(formats[k]) return `<span class="meta-chip">${formats[k].replace("{}", shown)}</span>`
          return `<span class="meta-chip">${k}: ${shown}</span>`
        })
        .filter(Boolean)
        .join("")
    }
          
          
    // ┬─┐┌─┐┌┐┌┌┬┐┌─┐┬─┐
    // ├┬┘├┤ │││ ││├┤ ├┬┘
    // ┴└─└─┘┘└┘─┴┘└─┘┴└─
    // render

    let _mainRenderToken = 0

    async function render(){
      if(!state) return
      const token = ++_mainRenderToken

      document.body.dataset.viewMode = viewMode
      document.body.dataset.showTradedOnly = showTradedOnly ? "true" : "false"

      if(gameMeta.network)
        document.body.dataset.network = gameMeta.network.toLowerCase()

      headerEl.style.display = viewMode === "columns" ? "grid" : "none"

      window.orderFillMap = buildOrderFillMap()
      renderOrderMarketSummary()
      renderOrders()
      renderTransactions()
      renderChat()

      const accounts = getAccounts()
      const accountMap = getAccountMap()
      const reservedByAccount = buildReservedByAccount(accounts)
      const visibleAccounts = getVisibleAccounts(accounts)
      const frag = document.createDocumentFragment()

      visibleAccounts.forEach(account => {
        const rowEl = viewMode === "columns"
          ? renderColumnsAccount(account, reservedByAccount, accountMap)
          : renderMergedAccount(account, reservedByAccount, accountMap)

        frag.appendChild(rowEl)
      })

      if(token !== _mainRenderToken) return
      gameEl.replaceChildren(frag)

      const gameMetaEl = document.getElementById("gameMeta")
      if(!gameMetaEl || !gameMeta) return

      const title = gameMeta.profile?.name || ""
      const joinText = formatJoinRule(gameMeta.joinRule)
      const adminTools = await renderGameAdminTools()

      if(token !== _mainRenderToken) return

      gameMetaEl.innerHTML = `
        <div class="game-title-row">
          <div class="game-network">${gameMeta.network}</div>
          <div class="game-title">${title}</div>
        </div>

        <div class="game-meta-row">
          <span>ID: ${gameMeta.id} ${adminTools}</span>
          <span class="meta-chip">Visibility: ${displayValue("visibility", gameMeta.visibility)}</span>
          ${joinText ? `<span class="meta-chip">Join: ${joinText}</span>` : ""}
          <span class="meta-chip">Lock: ${displayValue("lockRule", gameMeta.lockRule)}</span>
          ${renderConfigMeta(gameMeta.config)}
        </div>
      `

      document.getElementById("deleteGameBtn")?.addEventListener("click", deleteCurrentGame)
    }


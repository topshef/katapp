
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

			if(meta){
				el.dataset.assetName = text
				
				const { serial } = parseAssetId(assetId)
				el.dataset.assetName = serial ? text + " #" + serial : text


				el.dataset.assetId = assetId
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

      a.href = `/m/sign/?network=${tx.network}&txid=${tx.txid}&pch=${tx.pch}`
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
			fillBtn.className = "fill-btn"
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

				const ok = confirm(
					`Remove account ${account.label}?\n\nAll assets and offers will be removed.`
				)
				if(!ok) return

				socket.send(JSON.stringify({
					type: "game_removeAccount",
					gameId,
					accountId: account.id
				}))
			}

			return exitBtn
		}


    function createAccountModeEl(account){

      const wrap = document.createElement("div")

      const modeEl = document.createElement("div")
      modeEl.className = "mode"

      modeEl.textContent =
        account.mode === "lock"
          ? "🔒 Locked"
          : "🔁 Trading"

      if(isMyAccount(account)){
        modeEl.classList.add("clickable")

        modeEl.onclick = () => {
          socket.send(JSON.stringify({
            type: "game_toggleLock",
            gameId,
            accountId: account.id
          }))
        }
      }

      wrap.appendChild(modeEl)

      // only show if backend supports it
      if(account.autoLock !== undefined){

        const autoWrap = document.createElement("label")
        autoWrap.className = "auto-lock"

        autoWrap.title =
          "Auto-lock preference for this account\n\n" +
          "✓ Applies when creating or taking market orders\n" +
          "✓ Can immediately raise transactions if all parties also use auto-lock\n\n" +
          "✗ Does not apply to manual fills\n" +
          "✗ Does not apply to drag/drop asset moves\n" +
          "✗ Does not apply to manual basket edits\n\n" +
          "Debug feature: intended for simplified FX / reduced UI modes"
          
          
        const autoInput = document.createElement("input")
        autoInput.type = "checkbox"
        autoInput.checked = !!account.autoLock

        if (isMyAccount(account)) {
          autoInput.onchange = () => {

            socket.send(JSON.stringify({
              type: "game_toggleAutoLock",
              gameId,
              accountId: account.id,
              autoLock: autoInput.checked
            }))

          }         
        } else autoInput.disabled = true   //you cant change other players settings

        autoWrap.append(
          autoInput,
          document.createTextNode(" auto-lock")
        )

        wrap.appendChild(autoWrap)
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

    // ┬─┐┌─┐┌┐┌┌┬┐┌─┐┬─┐
    // ├┬┘├┤ │││ ││├┤ ├┬┘
    // ┴└─└─┘┘└┘─┴┘└─┘┴└─
    // render
    function render(){
			
      if(!state) return
			
      document.body.dataset.viewMode = viewMode
      document.body.dataset.showTradedOnly = showTradedOnly ? "true" : "false"

      if(gameMeta.network){
        document.body.dataset.network = gameMeta.network.toLowerCase()
      }
      
      gameEl.innerHTML = ""

      const gameMetaEl = document.getElementById("gameMeta")
      if(gameMetaEl && gameMeta){

        const title = gameMeta.profile?.name || ""

        const joinText = String(gameMeta.joinRule || "").trim()

        gameMetaEl.innerHTML = `
          <div class="game-title-row">
            <div class="game-network">${gameMeta.network}</div>
            <div class="game-title">${title}</div>
          </div>

          <div class="game-meta-row">
            <span>ID: ${gameMeta.id}</span>
            <span>Visibility: ${gameMeta.visibility}</span>
            ${joinText ? `<span>Join: ${joinText}</span>` : ""}
            <span>Lock: ${gameMeta.lockRule}</span>
            |&nbsp Config: ${renderConfigMeta(gameMeta.config)}
          </div>
        `
      }
			
      headerEl.style.display = viewMode === "columns" ? "grid" : "none"

      //show orders
      
      window.orderFillMap = buildOrderFillMap()
      renderOrderMarketSummary()
      renderOrders()


      const accounts = getAccounts()
      const accountMap = getAccountMap()
      const reservedByAccount = buildReservedByAccount(accounts)
      const visibleAccounts = getVisibleAccounts(accounts)

      visibleAccounts.forEach(account => {
        const rowEl = viewMode === "columns"
          ? renderColumnsAccount(account, reservedByAccount, accountMap)
          : renderMergedAccount(account, reservedByAccount, accountMap)

        gameEl.appendChild(rowEl)
      })
    }

    // ┬─┐┌─┐┌┐┌┌┬┐┌─┐┬─┐  ╔═╗┬─┐┌┬┐┌─┐┬─┐┌─┐
    // ├┬┘├┤ │││ ││├┤ ├┬┘  ║ ║├┬┘ ││├┤ ├┬┘└─┐
    // ┴└─└─┘┘└┘─┴┘└─┘┴└─  ╚═╝┴└──┴┘└─┘┴└─└─┘
    // render Orders
    
    function renderOrders(){

      const listEl = document.querySelector("#ordersSection .orders-list")
      listEl.innerHTML = ""

      const orders = getAllOrders()

      orders.sort((a, b) => {

        const ta = enrichOrder(a.order).market?.type || "invalid-UH83743"
        const tb = enrichOrder(b.order).market?.type || "invalid-GY83744"

        return ta.localeCompare(tb)
      })

      orders.forEach(orderRec => {
        listEl.appendChild(createOrderRow(orderRec))
      })
    }       
    // TODO:
    // Orders may reference assets not present in visible accounts,
    // so current enrichment (account-driven) may miss them.
    // Later: include orders in enrichment scan or run a separate pass.

        
    function getAllowedFxPair(base, quote){

      const allowedPairs = [

        ["XBAR", "USDC"],
        ["KGBP", "USDC"],
        ["XBAR", "KBRL"],
        ["KBRL", "KCOP"],
        //etc
      ]

      return allowedPairs.find(([a, b]) =>
        (a === base && b === quote) ||
        (a === quote && b === base)
      ) || null
    }


    function enrichSimpleFxOrder(order){

      const offer = []
      const request = []

      ;(order.bundle || []).forEach(x => {
        if(x.amount < 0) offer.push(x)
        else if(x.amount > 0) request.push(x)
      })

      if(offer.length !== 1 || request.length !== 1)
        return {}

      const offerLine = offer[0]
      const requestLine = request[0]

      const offerAmount = Math.abs(offerLine.amount)
      const requestAmount = Math.abs(requestLine.amount)

      if(!offerAmount)
        return {}

      const offerLabel = getAssetDisplay(offerLine.asset, offerAmount).split(" ")[0]
      const requestLabel = getAssetDisplay(requestLine.asset, requestAmount).split(" ")[0]

      const allowedPair = getAllowedFxPair(offerLabel, requestLabel)

      // default/raw direction
      let pairLabel = `${offerLabel}/${requestLabel}`
      let rate = requestAmount / offerAmount
      let volume = offerAmount
      let side = ""

      if(allowedPair){

        const [base, quote] = allowedPair

        pairLabel = `${base}/${quote}`

        // offer side matches canonical base
        if(offerLabel === base){

          rate = requestAmount / offerAmount
          volume = offerAmount
          side = "sell"

        }else{

          rate = offerAmount / requestAmount
          volume = requestAmount
          side = "buy"
        }
      }

      return {
        derivedLabel: `[${side} ${volume} ${pairLabel} @${rate}]`,

        market: {
          type: "simple-fx",
          pair: pairLabel,
          side,
          rate,
          volume,

          baseAsset: side === "sell" ? offerLine.asset : requestLine.asset,
          quoteAsset: side === "sell" ? requestLine.asset : offerLine.asset,
          baseAmount: side === "sell" ? offerAmount : requestAmount,
          quoteAmount: side === "sell" ? requestAmount : offerAmount
        }
      }
    }


    const orderTypeEnrichers = {
      "simple-fx": enrichSimpleFxOrder
    }


    function enrichOrder(order) {
      try {
        const type=getOrderType(order)
        const fn=orderTypeEnrichers[type]

        if (!fn) return {}

        return fn(order)

      } catch (err) {
        console.warn("Bad order", order, err)

        return {
          error:err,
          market:null
        }
      }
    }


         
    function createOrderSide(items, cls){

      const el = document.createElement("span")
      el.className = cls

      items.forEach(x => {

        const amt = Math.abs(x.amount)
        const text = getAssetDisplay(x.asset, amt)

        const assetEl = makeAssetEl({
          text,
          assetId: x.asset,
          ownerAccountId: "",        // not account-bound
          ownerPlayerId: "",         // no sleeve here
          clickable: false
        })

        applyAssetClasses(assetEl, x.asset, amt)

        el.appendChild(assetEl)
      })

      return el
    } 
              
// TODO: Orders → market / chart views
// - Keep canonical model: bundle[] with signed amounts (do NOT change)
// - Add derived helpers (no mutation of source):
//
//   function extractPairs(order){
//     // project multi-asset bundle → pairwise edges
//     // return [{base, quote, rate, size}]
//   }
//
//   function groupByPair(orders){
//     // group extractPairs() output by (base, quote)
//   }
//
//   function buildOrderBook(pairGroup){
//     // sort by rate (asc/desc), aggregate sizes → depth levels
//   }
//
// - Keep rendering decoupled:
//   renderOrders() = raw view (current)
//   renderPairView(pair) = derived view (future)
//
// - Do NOT assume 1:1 pairs in core logic (multi-leg must still work)
// - Later: use buildOrderBook() output for depth/cliff charts



// TODO: Order fill progress (visual + data)
//
// - Source of truth:
//   Basket entries already carry {orderId, fillId} → use these to track fills
//
// - Add helper:
//   function getOrderFillRatio(orderId){
//     // sum filled amounts from all baskets (by orderId)
//     // compare vs original bundle amounts
//     // return { filledRatio, remainingRatio }  // use numerator/denominator style
//   }
//
// - Rendering:
//   - Show progress per order row (e.g. "50%" or "1/2")
//   - Optionally dim or strike-through filled portions
//   - Later: per-line-item fill (not just whole order)
//
// - Important:
//   - Must handle partial fills + multiple fills (aggregate)
//   - Must respect indivisible / min-fill constraints (ratios, not floats)
//
// - Future:
//   - Use same ratio in fill UI (pre-fill remaining)
//   - Could drive sorting (e.g. show nearly-filled orders first)


          
    function createOrderRow({orderId, order, playerId}){

      const row = document.createElement("div")
      row.className = "order-row"
      row.dataset.orderId = orderId

      // error case → just show raw + error
      if(order?.bundle?.error){
        row.textContent = `Order #${orderId} (${playerId}): ❌  ${order?.bundle?.error}`
        applyOwnerSleeve(row, playerId)
        return row
      }

      const offer = []
      const request = []

      if(Array.isArray(order.bundle)){
        order.bundle.forEach(x => {
          if(x.amount < 0) offer.push(x)
          else if(x.amount > 0) request.push(x)
        })
      }

      const mine = playerId === currentPlayerId
      const fill = getOrderFillRatio(orderId)   //BASK1

      const pendingFill = getPendingOrderFillRatio(orderId)
      const kpoolText = pendingFill.numerator == 0 ? "" : ` kpool ${pendingFill.numerator}/${pendingFill.denominator}`
      
      
      const orderType = getOrderType(order)  || "invalid-YE23998"


      const enriched = enrichOrder(order)

      let marketLabel = enriched.derivedLabel || ""

      if(enriched.market?.type === "simple-fx"){

        const row = enrichSimpleFxMarketRow({
          orderId,
          playerId,
          market: enriched.market
        })

        marketLabel =
          `[${row.side} ` +
          `${row.displayBaseAmount} ` +
          `${row.pair} @${row.displayRate}]`
      }

      const prefix = document.createElement("span")

      prefix.textContent =
        `Order #${orderId} (${playerId}${mine ? "=you" : ""}) ` +
        `[${orderType}] ${marketLabel} ` +
        // `[filled ${fill.numerator}/${fill.denominator}]: `
        `[filled ${fill.numerator}/${fill.denominator}${kpoolText}]: `
        

      const arrow = document.createElement("span")
      arrow.textContent = " → "

      const inner = document.createElement("div")
      inner.className = "order-row-inner"

      inner.appendChild(prefix)
      inner.appendChild(createOrderSide(offer, "order-offer"))
      inner.appendChild(arrow)
      inner.appendChild(createOrderSide(request, "order-request"))

      row.appendChild(inner)
      applyOwnerSleeve(row, playerId)

      return row
    }
          
              
    // ┬─┐┌─┐┌┐┌┌┬┐┌─┐┬─┐  ╔═╗┌─┐┌┐┌┌─┐┬┌─┐  ╔╦╗┌─┐┌┬┐┌─┐
    // ├┬┘├┤ │││ ││├┤ ├┬┘  ║  │ ││││├┤ ││ ┬  ║║║├┤  │ ├─┤
    // ┴└─└─┘┘└┘─┴┘└─┘┴└─  ╚═╝└─┘┘└┘└  ┴└─┘  ╩ ╩└─┘ ┴ ┴ ┴
    // render Config Meta          
    function renderConfigMeta(config){
      if(!config) return ""

      const formats = {
        txDelaySeconds: "Delay transaction start by {} seconds"
      }

      const entries = Object.entries(config)
      if(!entries.length) return ""

      return entries
        .map(([k,v]) => {
          if(formats[k]) return `<span>${formats[k].replace("{}", v)}</span>`
          return `<span>${k}: ${v}</span>`
        })
        .join("")
    }
          

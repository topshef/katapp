
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
					assetEl.onclick = () => {
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

			if(reservedItem.toAccountId){
				const toAccount = state.accounts?.[reservedItem.toAccountId]
				const player = toAccount ? state.players[toAccount.playerId] : null
				const name = player?.name || reservedItem.toAccountId

				const labelPart = reservedItem.toAccountId.split(":")[1] || reservedItem.toAccountId
				visibleTo = name + ":" + labelPart
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

			//for css hover
			assetEl.dataset.assetId = reservedItem.assetId
			assetEl.dataset.toAccount = reservedItem.toAccountId


      if(mine){
        assetEl.onclick = () => {
          // const ok = confirm("Recall " + reservedItem.assetId + " from " + reservedItem.toAccountId + "?")
					const ok = confirm("Recall " + reservedItem.assetId + "?")  // todo add from label
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


			const amount = item.amount || 1

			// let label = amount > 1
				// ? item.assetId + " ×" + amount
				// : item.assetId
	

			// if(fromAccountId){
				// const fromAccount = accountMap[fromAccountId]
				// const player = fromAccount ? state.players[fromAccount.playerId] : null
				// const name = player?.name || fromAccountId

				// const labelPart = fromAccountId.split(":")[1] || fromAccountId
				// label = item.assetId + " (from " + name + ":" + labelPart + ")"
				// label = (amount > 1 ? item.assetId + " ×" + amount : item.assetId) +
									// " (from " + name + ":" + labelPart + ")"
			// }

			let label = getAssetDisplay(item.assetId, amount)

			if(fromAccountId){
				const fromAccount = accountMap[fromAccountId]
				const player = fromAccount ? state.players[fromAccount.playerId] : null
				const name = player?.name || fromAccountId

				const labelPart = fromAccountId.split(":")[1] || fromAccountId

				label = `${getAssetDisplay(item.assetId, amount)} (from ${name}:${labelPart})`
			}

      const assetEl = makeAssetEl({
        text: label,
				assetId: item.assetId,
        ownerAccountId: fromAccountId,
        ownerPlayerId: fromPlayerId,
        basket: true,
        clickable
      })

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
            // const ok = confirm("Withdraw " + item.assetId + " from " + viewingAccount.id + "'s basket?")
						const ok = confirm("Withdraw " + item.assetId + "?") // todo add back the fucking accoutn id ffs
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
						const ok = confirm("Return " + item.assetId + " to " + fromAccountId) // arsfukcer
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


		function createAccountNameEl(account){

			const nameEl = document.createElement("div")
			nameEl.className = "name"

			const player = state.players[account.playerId]
			const name = player?.name || account.playerId
			const label = account.id.split(":")[1] || account.id

			const textEl = document.createElement("span")
			textEl.textContent = name && name !== "anon"
				? name + ":" + label
				: label

			nameEl.appendChild(textEl)

			if(isMyAccount(account)){
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

				nameEl.appendChild(exitBtn)
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


		function createAccountModeEl(account){

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

			return modeEl
		}


		function renderAccountAssets(account, container, reservedByAccount, accountMap){

			setupDropTarget(container, account)

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

			const nameEl = createAccountNameEl(account)
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
			rowEl.dataset.mine = isMyAccount(account) ? "true" : "false"

			const settingsEl = document.createElement("div")
			settingsEl.className = "settings"

			const nameEl = createAccountNameEl(account)
			const modeEl = createAccountModeEl(account)

			const hintEl = document.createElement("span")
			hintEl.className = "subtle"
			hintEl.textContent = isMyAccount(account)
				? "your account"
				: "tap empty area to offer selected"

			settingsEl.appendChild(nameEl)
			settingsEl.appendChild(modeEl)
			settingsEl.appendChild(hintEl)

			const assetsEl = document.createElement("div")
			assetsEl.className = "assets"

			renderAccountAssets(account, assetsEl, reservedByAccount, accountMap)

			rowEl.appendChild(settingsEl)
			rowEl.appendChild(assetsEl)

			return rowEl
		}


    function render(){
      gameEl.innerHTML = ""


      const gameMetaEl = document.getElementById("gameMeta")
			// if(gameMetaEl && game) gameMetaEl.textContent = JSON.stringify(game)
      if(gameMetaEl && game)
				gameMetaEl.textContent =
            "Game: " + game.id +
            " | Network: " + game.network +
            " | Visibility: " + game.visibility +
            " | Join rule: " + JSON.stringify(game.joinRule) +
            " | Lock rule: " + game.lockRule
			
      headerEl.style.display = viewMode === "columns" ? "grid" : "none"

      if(!state) return

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
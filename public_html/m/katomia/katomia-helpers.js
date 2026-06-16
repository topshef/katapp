/* =========================
       HELPERS / ADAPTERS
    ========================= */




		function notify(message, type="info", opts={}){

			const { timeout=4000 } = opts

			const icons = {
				info:"ℹ️",
				warning:"⚠️",
				error:"🤔",
				success:"✅",
				failed:"❌"
			}

			const container = document.getElementById("notifications")

			const el = document.createElement("div")
			el.className = `notice ${type}`

			const text = document.createElement("span")
			text.textContent = `${icons[type] || ""} ${message}`

			const close = document.createElement("button")
			close.textContent = "×"

			close.onclick = () => removeNotice(el)

			el.append(text, close)
			container.appendChild(el)

			if(timeout){
				setTimeout(()=>removeNotice(el), timeout)
			}
		}

		function removeNotice(el){
			el.classList.add("fade-out")
			setTimeout(()=>el.remove(), 400)
		}



		function getPlayerColour(playerId){
			if(!state || !state.players || !state.players[playerId]){
				return "#999"
			}

			return state.players[playerId].colour || "#999"
		}

    function applyOwnerSleeve(el, playerId){
      const colour = getPlayerColour(playerId)
      el.style.borderLeft = "12px solid " + colour
    }

    function applyHoverHighlight(el, on){
      el.style.outline = on ? "2px solid #000" : "none"
    }

    function clearSelection(){
      selectedAssetId = null
      selectedFromAccountId = null
      selectedFromBasketToAccountId = null
    }

    function isSelected(assetId, fromAccountId, fromBasketToAccountId){
      return (
        selectedAssetId === assetId &&
        selectedFromAccountId === fromAccountId &&
        (selectedFromBasketToAccountId || null) === (fromBasketToAccountId || null)
      )
    }

    function setSelectedAsset(assetId, fromAccountId, fromBasketToAccountId){
      selectedAssetId = assetId
      selectedFromAccountId = fromAccountId
      selectedFromBasketToAccountId = fromBasketToAccountId
      render()
    }

		function getTransferAmount(assetId, available){

			if(available <= 1) return 1

			const input = modalAmountOverride ?? prompt("Move how much?", "1")
			if(input === null) return null

			const n = parseFloat(input)
			if(!Number.isFinite(n) || n <= 0) return null

			// lookup decimals from metadata cache
			const meta = window.assetDisplayCache?.[assetId]
			// const decimals = Number(meta?.token_class?.decimals || 0)
            const decimals = String(assetId).toUpperCase() == "HBAR" ? 8 : Number(meta?.token_class?.decimals || 0)

			let scaled = n

			if(decimals){
				scaled = Math.round(n * (10 ** decimals))
			}

			if(scaled > available) return null

			return scaled
		}

		function getAccounts(){
			if(!state || !state.accounts) return []

			return Object.values(state.accounts).map(account => ({
				id: account.id,
				label: account.label,
				playerId: account.playerId,
				assets: account.assets || [],
				basket: account.basket || [],
				mode: account.mode || "shop",
			}))
		}


    function getAcceptedPairs(){
      const pairs = [...(gameMeta?.config?.allowedPairs || [])]
      pairs.sort((a, b) => a.label.localeCompare(b.label))
      return pairs.map(pair => ({
        ...pair,
        value: `${pair.base}/${pair.quote}`
      }))
    }



    function getAllowedPairLabels(){

      return getAcceptedPairs()
        .map(pair => pair.label.split("/"))
    }



    function getAllOrders(){

      if(!state?.players) return []

      const out = []

      Object.entries(state.players).forEach(([playerId, player]) => {

        Object.entries(player?.orders || {}).forEach(([orderId, order]) => {
          out.push({ orderId, order, playerId })
        })

      })

      return out
    }




    function shouldAutoLock(accountId){

      return state?.config?.tradingMode == "orderBook"
    }


    function requestLock(accountId){

      const account =
        state?.accounts?.[accountId]

      if(!account) return
      if(account.mode === "lock") return

      socket.send(JSON.stringify({
        type: "game_toggleLock",
        gameId,
        accountId
      }))
    }


    function getTradeAccountsForFills(fills){

      const accounts = new Set()

      fills.forEach(fill => {

        const orderRec =
          getAllOrders()
          .find(x => x.orderId == fill.orderId)

        if(!orderRec?.order?.bundle)
          return

        orderRec.order.bundle.forEach(line => {

          const accountId =
            `${orderRec.playerId}:${line.accountId}`

          accounts.add(accountId)
        })
      })

      return [...accounts]
    }



    function getAccountMap(){
      const map = {}

      getAccounts().forEach(account => {
        map[account.id] = account
      })

      return map
    }


    function getFromAccountId(item){
      return item.fromAccountId || item.fromId || item.from || null
    }

		// function isMyAccount(account){

			// if(!state || !state.accounts) return false

			// const player = state.players?.[account.playerId]
			// if(!player) return false

			// const myName = currentPlayer
			// if(!myName) return false

			// return player.name === myName
		// }


		function isMyAccount(account){

				if(!account) return false
				if(!currentPlayerId) return false

				return account.playerId === currentPlayerId
		}

		function buildReservedByAccount(accounts){
			const reservedByAccount = {}

			accounts.forEach(account => {
				account.basket.forEach(item => {
					const fromAccountId = getFromAccountId(item)
					if(!fromAccountId) return

					if(!reservedByAccount[fromAccountId]){
						reservedByAccount[fromAccountId] = []
					}

					reservedByAccount[fromAccountId].push({
						assetId: item.assetId,
						amount: item.amount || 1,
						toAccountId: account.id
					})
				})
			})

			return reservedByAccount
		}


    function highlightAssetsForAccount(accountId, on){
      document.querySelectorAll(".asset.basket").forEach(asset => {
        if(asset.dataset.ownerAccount === accountId){
          applyHoverHighlight(asset, on)
        }
      })
    }


		function highlightTradePair(assetId, fromAccountId, toAccountId, on){

			const selector =
				`[data-owner-account="${CSS.escape(fromAccountId)}"]` +
				`[data-asset-id="${CSS.escape(assetId)}"]` +
				`[data-to-account="${CSS.escape(toAccountId)}"]`

			const reservedEl = document.querySelector(`.asset.reserved${selector}`)
			const basketEl = document.querySelector(`.asset.basket${selector}`)

			if(reservedEl) applyHoverHighlight(reservedEl, on)
			if(basketEl) applyHoverHighlight(basketEl, on)

			if(on && reservedEl && basketEl){
				drawTradeLine(reservedEl, basketEl)
			}
			else{
				clearTradeLine()
			}
		}


		function getTradeLineLayer(){
			let svg = gameEl.querySelector(".trade-line-layer")

			if(!svg){
				svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
				svg.classList.add("trade-line-layer")
				gameEl.appendChild(svg)
			}

			return svg
		}

		function clearTradeLine(){
			const svg = gameEl.querySelector(".trade-line-layer")
			if(svg) svg.innerHTML = ""
		}

		function drawTradeLine(elA, elB){
			if(!elA || !elB) return

			const svg = getTradeLineLayer()
			svg.innerHTML = ""

			const gameRect = gameEl.getBoundingClientRect()
			const a = elA.getBoundingClientRect()
			const b = elB.getBoundingClientRect()

			const x1 = a.left + a.width / 2 - gameRect.left
			const y1 = a.top + a.height / 2 - gameRect.top
			const x2 = b.left + b.width / 2 - gameRect.left
			const y2 = b.top + b.height / 2 - gameRect.top

			svg.setAttribute("viewBox", `0 0 ${gameRect.width} ${gameRect.height}`)

			const line = document.createElementNS("http://www.w3.org/2000/svg", "line")
			line.setAttribute("x1", x1)
			line.setAttribute("y1", y1)
			line.setAttribute("x2", x2)
			line.setAttribute("y2", y2)

			svg.appendChild(line)
		}


    function getVisibleAccounts(accounts){
      let visible = [...accounts]

      if(showActiveOnly){
        const activeSet = new Set()

        accounts.forEach(account => {
          account.basket.forEach(item => {
            activeSet.add(account.id)

            const fromAccountId = getFromAccountId(item)
            if(fromAccountId) activeSet.add(fromAccountId)
          })
        })

				visible = visible.filter(account =>
					isMyAccount(account) || activeSet.has(account.id)
				)
				
      }

      visible.sort((a, b) => {
        const aMine = isMyAccount(a)
        const bMine = isMyAccount(b)

        if(aMine && !bMine) return -1
        if(!aMine && bMine) return 1

        return a.id.localeCompare(b.id)
      })

      return visible
    }


let modalAmountOverride = null

function openAssetModal(assetId, fromAccountId, available){

  const modal = document.getElementById("assetModal")
  const preview = document.getElementById("assetModalPreview")
  const nameEl = document.getElementById("assetModalName")
  const amountInput = document.getElementById("assetModalAmount")
  const targetsEl = document.getElementById("assetModalTargets")
  const availableEl = document.getElementById("assetModalAvailable")

  const meta = getAssetMeta(assetId)
  const thumb = meta && getAssetThumb(meta)

  // const decimals = Number(meta?.token_class?.decimals || 0)
  const decimals = String(assetId).toUpperCase() == "HBAR" ? 8 : Number(meta?.token_class?.decimals || 0)
  const displayAvailable = decimals
    ? available / (10 ** decimals)
    : available

  preview.innerHTML = ""
  if(thumb){
    const img = document.createElement("img")
    img.src = thumb
    preview.appendChild(img)
  }
  
 
  const displayTokenLabel = assetId.replace('#', ' #')
  const tokenSerial = assetId.replace('#', '-')
  const network = gameMeta.network || ""

  if(String(assetId).toUpperCase() == "HBAR"){
    nameEl.textContent = `${getAssetDisplay(assetId, available)} 🪙 HBAR`
  } else {
    // const url = `/m/?productId=${network};${tokenSerial}`
    // nameEl.innerHTML = `
      // <a href="${url}" target="_blank" style="text-decoration:none;color:inherit;">
        // ${getAssetDisplay(assetId, available)} 🪙 ${displayTokenLabel}
      // </a>
    // `
    //HBAR1
    
    if(String(assetId).toUpperCase() == "HBAR"){
      nameEl.textContent = `${getAssetDisplay(assetId, available)} 🪙 HBAR`
    } else {
      const url = `/m/?productId=${network};${tokenSerial}`
      nameEl.innerHTML = `
        <a href="${url}" target="_blank" style="text-decoration:none;color:inherit;">
          ${getAssetDisplay(assetId, available)} 🪙 ${displayTokenLabel}
        </a>
      `
    }
  
  }

  if(availableEl)
    availableEl.textContent = displayAvailable

  amountInput.value = 1
  amountInput.min = 0
  amountInput.max = displayAvailable || 1
  amountInput.step = decimals ? (1 / (10 ** decimals)) : 1

  targetsEl.innerHTML = ""


	const accounts = getVisibleAccounts(getAccounts())

	accounts.forEach(acc => {

		// if(acc.id === fromAccountId) return

		const el = document.createElement("div")
		el.className = "asset-modal-target"

		const locked = acc.mode === "lock"
		const self = acc.id === fromAccountId
         
        const baseLabel =
          (acc.label || acc.id) +
          (self ? " (you)" : "") +
          (locked ? " 🔒" : "")
        
        const id = acc.id.split(":")[1] || acc.id
        const xLabel = window.accountLabelCache?.[id]
        
        if(xLabel){
          el.innerHTML = `
            <div>${baseLabel}</div>
            <div class="account-xproof-label">${xLabel}</div>
          `
        } else {
          el.textContent = baseLabel
        }  
  

		const colour = getPlayerColour(acc.playerId)
		el.style.borderLeftColor = colour

		if(locked || self){
			el.style.opacity = 0.45
			el.style.pointerEvents = "none"
		}else{
			el.onclick = () => {

				const n = parseFloat(amountInput.value)
				if(!Number.isFinite(n) || n <= 0) return

				modalAmountOverride = n

				selectedAssetId = assetId
				selectedFromAccountId = fromAccountId
				selectedFromBasketToAccountId = null

				offerSelectedToAccount(acc.id)

				modalAmountOverride = null

				closeAssetModal()
			}
		}

		targetsEl.appendChild(el)
	})

  modal.classList.remove("hidden")
}


function closeAssetModal(){
  document.getElementById("assetModal").classList.add("hidden")
}

document.addEventListener("click", e=>{

  if(e.target.id === "assetModalClose"){
    closeAssetModal()
    return
  }

  if(e.target.id === "assetModal"){
    closeAssetModal()
  }

})


function getPendingTxAccountMap(){

	if(!state?.tx?.pending) return {}

	const map = {}

	state.tx.pending.forEach(tx => {

		const enrichedTx = {
			...tx,
			network: tx.network || gameMeta.network || null
		}

		const txid = enrichedTx.txid
		if(!txid) return

		// track accounts already added for THIS tx
		const seen = new Set()

		const add = (acc, asset = null) => {
			if(!acc) return
			if(seen.has(acc)) return   // 🔴 prevent duplicate tx per account

			seen.add(acc)

			map[acc] ||= {
				txs: [],
				assets: new Set()
			}

			map[acc].txs.push(enrichedTx)

			if(asset)
				map[acc].assets.add(asset)
		}

		// 1️⃣ operator
		const operator = txid.split("@")[0]
		add(operator)

		// 2️⃣ parse basis
		try{
			const basis = JSON.parse(enrichedTx.pchbasis || "{}")

			const scan = (arr, getAsset) => {
				if(!Array.isArray(arr)) return

				arr.forEach(x => {
					const asset = getAsset ? getAsset(x) : null
					add(x.accountId, asset)
				})
			}

			scan(basis.addTokenTransfer, x => x.tokenId)
			scan(basis.addNftTransfer, x => `${x.tokenId}#${x.serial}`)
			scan(basis.addHbarTransfer, () => "HBAR")

		}catch(e){
			console.warn("pchbasis parse failed", tx)
		}

	})

	// optional: convert Sets → arrays (cleaner for later use)
	Object.values(map).forEach(v => {
		v.assets = [...v.assets]
	})

	return map
}





// ╔═╗╔═╗╔╦╗
// ║ ╦║   ║║
// ╚═╝╚═╝═╩╝
// GCD
function gcd(a, b){ // ref BASK1
  a = Math.abs(a)
  b = Math.abs(b)

  while(b){
    const t = b
    b = a % b
    a = t
  }

  return a || 1
}

// ┬─┐┌─┐┌┬┐┬ ┬┌─┐┌─┐  ╔═╗┬─┐┌─┐┌─┐┌┬┐┬┌─┐┌┐┌
// ├┬┘├┤  │││ ││  ├┤   ╠╣ ├┬┘├─┤│   │ ││ ││││
// ┴└─└─┘─┴┘└─┘└─┘└─┘  ╚  ┴└─┴ ┴└─┘ ┴ ┴└─┘┘└┘
// reduce Fraction
function reduceFraction(numerator, denominator){  // ref BASK1

  if(!denominator)
    return { numerator: 0, denominator: 1 }

  const d = gcd(numerator, denominator)

  return {
    numerator: numerator / d,
    denominator: denominator / d
  }
}

// Normalise any fill-shaped object to legs: [{orderId, numerator, denominator}].
// Mirror of the backend helper — accepts the leg-native shape (`.legs`), the
// legacy pairwise maker/taker shape, and single-leg records. The fill-ratio
// accounting below has no maker/taker concept; legs are the only notion.
function fillLegs(f){
  if(!f) return []

  if(Array.isArray(f.legs))
    return f.legs
      .filter(l => l && l.orderId != null)
      .map(l => ({ orderId:String(l.orderId), numerator:Number(l.numerator || 0), denominator:Number(l.denominator || 0) }))

  const legs = []
  if(f.orderId != null)
    legs.push({ orderId:String(f.orderId), numerator:Number(f.numerator || 0), denominator:Number(f.denominator || 0) })
  if(f.takerOrderId != null)
    legs.push({ orderId:String(f.takerOrderId), numerator:Number(f.takerNumerator || 0), denominator:Number(f.takerDenominator || 0) })

  return legs
}

// ┌┐ ┬ ┬┬┬  ┌┬┐  ╔═╗┬─┐┌┬┐┌─┐┬─┐  ╔═╗┬┬  ┬    ╔╦╗┌─┐┌─┐
// ├┴┐│ │││   ││  ║ ║├┬┘ ││├┤ ├┬┘  ╠╣ ││  │    ║║║├─┤├─┘
// └─┘└─┘┴┴─┘─┴┘  ╚═╝┴└──┴┘└─┘┴└─  ╚  ┴┴─┘┴─┘  ╩ ╩┴ ┴┴  
// build Order Fill Map
function buildOrderFillMap(){ // ref BASK1

  const out = {}

  if(!state?.accounts)
    return out

  const seen = new Set()

  function addFill(orderId, fillId, numerator, denominator){
    if(!orderId || !fillId) return

    numerator = Number(numerator || 0)
    denominator = Number(denominator || 0)

    if(!numerator || !denominator) return

    const key = `${orderId}|${fillId}`
    if(seen.has(key)) return

    seen.add(key)

    if(!out[orderId])
      out[orderId] = { numerator: 0, denominator: 1 }

    const current = out[orderId]

    out[orderId] = reduceFraction(
      current.numerator * denominator + numerator * current.denominator,
      current.denominator * denominator
    )
  }

  Object.values(state.accounts).forEach(account => {
    ;(account.basket || []).forEach(item => {
      for(const leg of fillLegs(item))
        addFill(leg.orderId, item.fillId, leg.numerator, leg.denominator)
    })
  })

  return out
}



// ┌─┐┌─┐┌┬┐  ╔═╗┬─┐┌┬┐┌─┐┬─┐  ╔═╗┬┬  ┬    ╦═╗┌─┐┌┬┐┬┌─┐
// │ ┬├┤  │   ║ ║├┬┘ ││├┤ ├┬┘  ╠╣ ││  │    ╠╦╝├─┤ │ ││ │
// └─┘└─┘ ┴   ╚═╝┴└──┴┘└─┘┴└─  ╚  ┴┴─┘┴─┘  ╩╚═┴ ┴ ┴ ┴└─┘
// get Order Fill Ratio
function getOrderFillRatio(orderId){  //ref BASK1

  window.orderFillMap ||= buildOrderFillMap()

  return window.orderFillMap[orderId] || {
    numerator: 0,
    denominator: 1
  }
}




function getPendingOrderFillRatio(orderId){ // BASK1

  const target = String(orderId)
  const seen = new Set()
  let numerator = 0
  let denominator = 1

  function addFill(scope, fillId, n, d){
    n = Number(n || 0)
    d = Number(d || 0)

    if(!fillId || !n || !d) return

    const key = `${scope}:${fillId}`
    if(seen.has(key)) return

    seen.add(key)

    const reduced = reduceFraction(
      numerator * d + n * denominator,
      denominator * d
    )

    numerator = reduced.numerator
    denominator = reduced.denominator
  }

  ;(state.tx?.pending || []).forEach(tx => {
    const txKey = tx.pch || tx.txid || "pending"

    ;(tx.source?.fills || []).forEach(fill => {
      for(const leg of fillLegs(fill))
        if(leg.orderId === target)
          addFill(txKey, fill.fillId, leg.numerator, leg.denominator)
    })
  })

  return { numerator, denominator }
}


function getSettledOrderFillRatio(orderId){

  const rec =
    getAllOrders().find(x => String(x.orderId) === String(orderId))

  if(!rec?.order?.settled?.length)
    return { numerator:0, denominator:1 }

  let numerator = 0
  let denominator = 1

  const seen = new Set()

  rec.order.settled.forEach(item => {

    for(const leg of fillLegs(item)){
      if(leg.orderId !== String(orderId)) continue

      const key = `${item.fillId}|${item.txid || ""}`
      if(seen.has(key)) continue
      seen.add(key)

      const n = leg.numerator
      const d = leg.denominator || 1

      const reduced = reduceFraction(
        numerator * d + n * denominator,
        denominator * d
      )

      numerator = reduced.numerator
      denominator = reduced.denominator
    }
  })

  return { numerator, denominator }
}



// ┌─┐┌─┐┌┬┐  ╔═╗┌─┐┌─┐┌─┐┌┬┐  ╔╦╗┬ ┬┌─┐┌─┐
// │ ┬├┤  │   ╠═╣└─┐└─┐├┤  │    ║ └┬┘├─┘├┤ 
// └─┘└─┘ ┴   ╩ ╩└─┘└─┘└─┘ ┴    ╩  ┴ ┴  └─┘
// get Asset Type
function getAssetType(assetId, amount=1){
    
  if(String(assetId).toUpperCase() == "HBAR") return "FT"

  const meta = getAssetMeta(assetId)

  // fallback while metadata loading
  if(!meta){

    if(String(assetId).includes("#"))
      return "NFT"

    if(getAcceptedPairs().some(pair => pair.base == assetId || pair.quote == assetId))
      return "FT"

    return "UNKNOWN"
  }

  const tokenClass = meta.token_class || {}

  // canonical Hedera NFT
  if(tokenClass.type === "NON_FUNGIBLE_UNIQUE")
    return "NFT"

  const decimals = Number(tokenClass.decimals || 0)

  // zero-decimal fungible
  if(decimals === 0){

    // future:
    // inspect supply / treasury / metadata / whitelist
    // to determine collectible semantics

    if(amount <= 10000)
      return "LE"

    return "FT0"
  }

  return "FT"
}


// ┌─┐┌─┐┌┬┐  ╔═╗┬─┐┌┬┐┌─┐┬─┐  ╔╦╗┬ ┬┌─┐┌─┐
// │ ┬├┤  │   ║ ║├┬┘ ││├┤ ├┬┘   ║ └┬┘├─┘├┤ 
// └─┘└─┘ ┴   ╚═╝┴└──┴┘└─┘┴└─   ╩  ┴ ┴  └─┘
// get Order Type

function getOrderType(order){

  const bundle = order?.bundle || []

  const types = bundle.map(x =>
    getAssetType(x.asset, Math.abs(x.amount))
  )

  const unique = [...new Set(types)]

  const hasPositive = bundle.some(x => x.amount > 0)
  const hasNegative = bundle.some(x => x.amount < 0)

  if(hasNegative && !hasPositive)
    return "offer"

  if(hasPositive && !hasNegative)
    return "request"

  if(unique.every(x => x === "FT"))
    return bundle.length === 2 ? "simple-ft" : "basket-ft"

  if(unique.every(x => x === "NFT" || x === "LE"))
    return bundle.length === 2 ? "simple-collectible" : "basket-collectible"

  if(bundle.length === 2 && types.includes("FT") && types.includes("NFT"))
    return "simple-nft"

  if(bundle.length === 2 && types.includes("FT") && types.includes("LE"))
    return "simple-le"

  return "exotic"
}

// TODO order type taxonomy / UX strategy
//
// Order classification is currently DERIVED from:
//
//   1. directionality
//      - offer      (all negative)
//      - request    (all positive)
//      - mixed      (contains both)
//
//   2. asset composition
//      - FT   = fungible with decimals
//      - LE   = limited-edition / zero-decimal collectible fungible
//      - NFT  = non-fungible unique
//
//   3. structure
//      - pairwise (2 line items)
//      - basket   (2+ line items)
//
// ------------------------------------------------------------
// CURRENT ORDER TYPES
// ------------------------------------------------------------
//
// offer
// request
//
// simple-ft
// basket-ft
//
// simple-nft
// simple-le
//
// simple-collectible
// basket-collectible
//
// exotic
//
// ------------------------------------------------------------
// IMPORTANT CONCEPTUAL DISTINCTIONS
// ------------------------------------------------------------
//
// FX-like orders:
//   - can imply prices/rates
//   - support charts/orderbooks/depth
//   - may derive synthetic pairs
//   - may support routing/cycle matching
//
// Collectible orders:
//   - negotiated/barter-like
//   - usually subjective pricing
//   - less suitable for charts/orderbooks
//   - more card/trade style UX
//
// Therefore:
//   simple-vs-basket matters MORE for FX
//   than for collectibles.
//
// ------------------------------------------------------------
// POSSIBLE FUTURE UX BY TYPE
// ------------------------------------------------------------
//
// simple-ft
//   - bid/ask style
//   - orderbook
//   - depth/cliff charts
//   - spread/rate display
//   - implied/synthetic markets
//
// basket-ft
//   - graph/routing view
//   - cycle detection
//   - clearing optimisation
//   - portfolio rebalance style UI
//
// collectible / nft / le
//   - side-by-side card comparison
//   - swipe/trade UX
//   - marketplace style presentation
//   - bundle negotiation
//
// offer / request
//   - gifting
//   - bounty
//   - RFQ / inquiry
//   - open listing
//
// exotic
//   - fallback/raw bundle renderer
//   - debugging/prototyping category
//
// ------------------------------------------------------------
// IMPORTANT ARCHITECTURAL RULE
// ------------------------------------------------------------
//
// Order type is DERIVED VIEW LOGIC only.
//
// Do NOT mutate/store canonical order.type.
//
// Classification rules will evolve over time.
// Rendering should depend on helpers:
//
//   getAssetType()
//   getOrderType()
//
// rather than persisted state.
//
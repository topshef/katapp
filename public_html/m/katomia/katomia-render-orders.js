

/*
========================================
KATOMIA ORDER RENDERING
========================================

Rendering/UI layer for orders + markets.

Allowed:
- DOM
- SVG
- tooltips
- prompts
- click handlers

Forbidden:
- market calculations
- matching algorithms
- settlement logic
*/




// ┬─┐┌─┐┌┐┌┌┬┐┌─┐┬─┐  ╔╦╗┬─┐┌─┐┌┐┌┌─┐┌─┐┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
// ├┬┘├┤ │││ ││├┤ ├┬┘   ║ ├┬┘├─┤│││└─┐├─┤│   │ ││ ││││└─┐
// ┴└─└─┘┘└┘─┴┘└─┘┴└─   ╩ ┴└─┴ ┴┘└┘└─┘┴ ┴└─┘ ┴ ┴└─┘┘└┘└─┘
// render Transactions
function getTxSourceInfo(tx){

  return (tx.sourceBaskets || [])
    .map(x => {

      if(!x.orderId)
        return ""

      const r = reduceFraction(
        x.numerator,
        x.denominator
      )

      return `#${x.orderId} ${r.numerator}/${r.denominator}`

    })
    .filter(Boolean)
    .join(", ")

}


function getTxMeta(tx){

  const network = tx.network || tx.pchbasis?.network || "?"
  const txid = tx.txid || "?"
  const pch = (tx.pch || "?").substring(0,8)
  const status = tx.lifecycle?.status || "?"
  const sourceInfo = getTxSourceInfo(tx)

  return (
    `[${network}] ` +
    `${txid} ` +
    `[PCH ${pch}] ` +
    `[${status}] ` +
    (sourceInfo ? `[${sourceInfo}]` : "")
  )

}


function createTxAssets(transfers){

  const el = document.createElement("span")
  el.className = "tx-assets"

  const send = transfers.filter(x => x.amount < 0)
  const receive = transfers.filter(x => x.amount > 0)

  send.forEach(x =>
    el.appendChild(
      makeAssetEl({
        text:getAssetDisplay(
          x.tokenId,
          Math.abs(x.amount)
        ),
        assetId:x.tokenId
      })
    )
  )

  if(send.length && receive.length){

    const arrow = document.createElement("span")
    arrow.className = "tx-arrow"
    arrow.textContent = "→"

    el.appendChild(arrow)
  }

  receive.forEach(x =>
    el.appendChild(
      makeAssetEl({
        text:getAssetDisplay(
          x.tokenId,
          x.amount
        ),
        assetId:x.tokenId
      })
    )
  )

  return el

}


function createTxRow(tx){

  const row = document.createElement("div")
  const meta = document.createElement("span")

  row.className = "subtle tx-row"

  meta.innerHTML = getTxMeta(tx)

  const transfers =
    tx.pchbasis?.transfers?.tokenTransfers || []

  row.appendChild(meta)
  row.appendChild(
    createTxAssets(transfers)
  )

  return row

}


async function renderTransactions(){

  const listEl =
    document.querySelector("#ordersSection .transactions-list")

  if(!listEl) return

  listEl.innerHTML = ""

  await cachePendingTxs()

  const txs = await getAllTx()

  txs.reverse()

  txs.forEach(tx =>
    listEl.appendChild(
      createTxRow(tx)
    )
  )

}






// ┬─┐┌─┐┌┐┌┌┬┐┌─┐┬─┐  ╔╦╗┌─┐┬─┐┬┌─┌─┐┌┬┐  ╦ ╦┌─┐┌─┐┌┬┐┌┬┐┌─┐┌─┐
// ├┬┘├┤ │││ ││├┤ ├┬┘  ║║║├─┤├┬┘├┴┐├┤  │   ╠═╣├┤ ├─┤ │ │││├─┤├─┘
// ┴└─└─┘┘└┘─┴┘└─┘┴└─  ╩ ╩┴ ┴┴└─┴ ┴└─┘ ┴   ╩ ╩└─┘┴ ┴ ┴ ┴ ┴┴ ┴┴  
// render Market Heatmap
function renderMarketHeatmap(pair, heatmap, opts = {}){

  const width = opts.width ?? 420
  const height = opts.height ?? 140
  const pad = opts.pad ?? 12
  const barWidth = opts.barWidth ?? 16
  const opacity = opts.opacity ?? 0.14
  const jitter = opts.jitter ?? 0

  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg")

  svg.setAttribute("width", width)
  svg.setAttribute("height", height)
  svg.classList.add("market-chart")

  const { minRate, maxRate, maxVolume } = heatmap.stats
  const chartW = width - (pad * 2)
  const chartH = height - (pad * 2)

  heatmap.rows.forEach(row => {

    const rate = row.displayRate
    const volume = row.displayBaseAmount
    const originalVolume = row.originalDisplayBaseAmount || volume

    const x = pad + ((rate - minRate) / (maxRate - minRate || 1)) * chartW

    const h = (volume / (maxVolume || 1)) * chartH
    const originalH = (originalVolume / (maxVolume || 1)) * chartH

    const y = height - pad - h
    const originalY = height - pad - originalH

    const jitterX = jitter ? (Math.random() - 0.5) * jitter : 0
    const rectX = x - (barWidth / 2) + jitterX

    const color = row.side === "buy" ? "#2ecc71" : "#e74c3c"
    const lineColor = row.side === "buy" ? "#27ae60" : "#c0392b"

    const edge = document.createElementNS("http://www.w3.org/2000/svg","line")
    edge.setAttribute("x1", rectX)
    edge.setAttribute("x2", rectX)
    edge.setAttribute("y1", originalY)
    edge.setAttribute("y2", height - pad)
    edge.setAttribute("stroke", color)
    edge.setAttribute("stroke-width","1")
    edge.setAttribute("stroke-opacity", opacity + 0.05)
    svg.appendChild(edge)

    const rect = document.createElementNS("http://www.w3.org/2000/svg","rect")
    rect.setAttribute("x", rectX)
    rect.setAttribute("y", y)
    rect.setAttribute("width", barWidth)
    rect.setAttribute("height", h)
    rect.setAttribute("fill", color)
    rect.setAttribute("fill-opacity", opacity)

    rect.dataset.rate = rate
    rect.dataset.volume = volume
    rect.dataset.orderId = row.orderId

    rect.__heatmapData = { row, x: rectX, y, w: barWidth, h }

    svg.appendChild(rect)

    const fill = getOrderFillRatio(row.orderId)
    const fillRatio = fill.numerator / fill.denominator

    // const fillY = y + h - (h * fillRatio)
    const fillY = height - pad - (originalH * fillRatio)

    const fillLine = document.createElementNS("http://www.w3.org/2000/svg","line")
    fillLine.setAttribute("x1", rectX)
    fillLine.setAttribute("x2", rectX + barWidth)
    fillLine.setAttribute("y1", fillY)
    fillLine.setAttribute("y2", fillY)
    fillLine.setAttribute("stroke", lineColor)
    fillLine.setAttribute("stroke-width","1")
    fillLine.setAttribute("stroke-opacity","0.5")
    fillLine.setAttribute("stroke-dasharray","1 1")

    svg.appendChild(fillLine)

    const pendingFill = getPendingOrderFillRatio(row.orderId)

    const totalFillRatio =
      (fill.numerator / fill.denominator) +
      (pendingFill.numerator / pendingFill.denominator)

    // const pendingY = y + h - (h * totalFillRatio)
    const pendingY = height - pad - (originalH * totalFillRatio)

    const pendingLine = document.createElementNS("http://www.w3.org/2000/svg","line")
    pendingLine.setAttribute("x1", rectX)
    pendingLine.setAttribute("x2", rectX + barWidth)
    pendingLine.setAttribute("y1", pendingY)
    pendingLine.setAttribute("y2", pendingY)
    pendingLine.setAttribute("stroke", lineColor)
    pendingLine.setAttribute("stroke-width","2")
    pendingLine.setAttribute("stroke-opacity","0.7")

    if (pendingFill.numerator !== "0") {
      
      const pendingHeight = fillY - pendingY
      
      const bubble=document.createElementNS("http://www.w3.org/2000/svg", "rect")

      bubble.setAttribute("x", rectX)
      bubble.setAttribute("y", pendingY)
      bubble.setAttribute("width", barWidth)
      bubble.setAttribute("height", pendingHeight)

      bubble.setAttribute("rx", "7")
      bubble.setAttribute("ry", "7")

      bubble.setAttribute("fill", "none")
      bubble.setAttribute("stroke", lineColor)
      bubble.setAttribute("stroke-opacity", "0.6")
      bubble.setAttribute("stroke-dasharray", "2 2")

      svg.appendChild(bubble)
    }

    svg.appendChild(pendingLine)

  })

  return svg
}


function ensureMarketTooltip(){

  let el =
    document.getElementById(
      "marketHeatmapTooltip"
    )

  if(el) return el

  el = document.createElement("div")

  el.id = "marketHeatmapTooltip"

  document.body.appendChild(el)

  return el
}


document.addEventListener("mousemove", e => {

  const tooltip =
    ensureMarketTooltip()

  const svg =
    e.target.closest(".market-chart")

  if(!svg){
    tooltip.style.display = "none"
    return
  }

  const rects =
    [...svg.querySelectorAll("rect")]

  const matches = []

  rects.forEach(rect => {

    const d = rect.__heatmapData

    if(!d) return

    const box =
      rect.getBoundingClientRect()

    const hit =
      e.clientX >= box.left &&
      e.clientX <= box.right &&
      e.clientY >= box.top &&
      e.clientY <= box.bottom

    if(hit)
      matches.push(d.row)
  })

  if(!matches.length){
    tooltip.style.display = "none"
    return
  }

  tooltip.innerHTML =
    matches.map(row => {

      const fill = getOrderFillRatio(row.orderId)  // fill within baskets still in proposal phase
      const pendingFill = getPendingOrderFillRatio(row.orderId)  // fill from tx now in kpool, pending submit to hedera
      
      const fillWithinKpool = (pendingFill.numerator=='0') ? '' : ` KPOOL ${pendingFill.numerator}/${pendingFill.denominator}`

      return (
        `#${row.orderId} ` +
        `${row.side} ` +
        `${row.displayBaseAmount} ` +
        `@ ${row.displayRate} ` +
        `🧩 ${fill.numerator}/${fill.denominator}` +
        `${fillWithinKpool}`
      )
    }).join("<br>")

  tooltip.style.display = "block"

  tooltip.style.left =
    (e.pageX + 12) + "px"

  tooltip.style.top =
    (e.pageY + 12) + "px"
})



function createTradeBtn(pair){  //simple FX

  const btn = document.createElement("button")

  btn.className = "market-trade-btn"
  btn.textContent = "Take"

  btn.onclick = () => {

    const input =
      prompt(
        "account,volume,limitRate,liquidityMode\n\n" +
        "liquidityMode = ignoreKpool|includeKpool" +
        "Example:\n" +
        "0.0.1234,100,0.12,includeKpool"
      )

    if(!input) return

    const [fillerAccountId, volumeRaw, limitRateRaw, liquidityModeRaw] =
      input.split(",").map(x => x.trim())


    const volume = Number(volumeRaw)
    const limitRate = Number(limitRateRaw)

    const liquidityMode =
      liquidityModeRaw ||
      "ignoreKpool"
      
      
    if(
      !fillerAccountId ||
      !volume ||
      !limitRate
    ){
      alert("Bad format")
      return
    }

    const result =
      estimateMarketTrade({
        pair,
        fillerAccountId,
        volume,
        limitRate,
        liquidityMode
      })

    if(!result.fills.length){
      alert("No matching liquidity found")
      return
    }

    const summary =
      result.fills.map(fill => {

        return (
          `#${fill.orderId} ` +
          `${fill.side} ` +
          `${fill.amount} ` +
          `@ ${fill.rate} ` +
          `🧩 ${fill.numerator}/${fill.denominator}`
        )

      }).join("\n")

    const ok =
      confirm(
        `Requested: ${result.requestedVolume}\n` +
        `Matched: ${result.matchedVolume}\n` +
        `Remaining: ${result.remainingVolume}\n` +
        `Effective rate: ${result.effectiveRate}\n\n` +
        `Fills:\n\n` +
        summary
      )

    if(!ok) return

    // result.fills.forEach(fill => {

      // socket.send(JSON.stringify({
        // type: "game_orderFill",
        // gameId,
        // orderId: fill.orderId,
        // numerator: fill.numerator,
        // denominator: fill.denominator,
        // fillerAccountId
      // }))
    // })

    //new websocket action for batch of fills
    socket.send(JSON.stringify({
      type: "game_orderFillBatch",
      gameId,
      fillerAccountId,
      fills: result.fills.map(fill => ({
        orderId: fill.orderId,
        numerator: fill.numerator,
        denominator: fill.denominator
      }))
    }))
    
  }

  return btn
}



function renderOrderMarketSummary(){

  const el = document.querySelector(
    "#ordersSection .orders-market-summary"
  )

  if(!el) return

  el.innerHTML = ""

  const markets = getSimpleFxMarkets()

  Object.entries(markets).forEach(([pair, rows]) => {

    const row = document.createElement("div")
    row.className = "market-summary-row"

    const summary = rows
      .map(row => {

      return (
        `#${row.orderId} ` +
        `${row.side} ` +
        `${row.displayBaseAmount} ` +
        `@ ${row.displayRate}`
      )
      })
      .join(" | ")


    const text =
      document.createElement("span")

    text.innerHTML = `<span class="market-pair-label">${pair}</span> (${rows.length}) ${summary}`

    row.appendChild(createTradeBtn(pair))
    row.appendChild(text)

    el.appendChild(row)


    const heatmap =
      buildMarketStats(rows)

    const chart =
      renderMarketHeatmap(
        pair,
        heatmap,
        {

          opacity: 0.16,

          // set 0 to disable
          jitter: 0,
          // jitter: 10,

          barWidth: 16
        }
      )
    el.appendChild(chart)
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

      const settled =
        getSettledOrderFillRatio(orderId)

      const settledText =
        settled.numerator == 0
          ? ""
          : ` settled ${settled.numerator}/${settled.denominator}`

      const orderType = getOrderType(order) || "invalid-YE23998"


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
        `[filled ${fill.numerator}/${fill.denominator}${kpoolText}${settledText}]: `
        

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
          


/*
orders
  ↓
simple fx rows
  ↓
orderbook buckets
  ↓
svg renderer

*/
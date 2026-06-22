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
function getNumberBlock(n){   // go peepshow

  const blocks = ["0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣"]

  return String(n).split("").map(x => blocks[Number(x)] || x).join("")

}

function formatTxSourceFraction(r){

  if(r.unknown) return ""

  const reduced = reduceFraction(r.numerator, r.denominator)
  const fraction = `${reduced.numerator}/${reduced.denominator}`

  return fraction == "1/1" ? "All" : fraction
}

function getTxFillTakerRatio(tx, fill){

  if(fill.takerNumerator && fill.takerDenominator)
    return {
      numerator: fill.takerNumerator,
      denominator: fill.takerDenominator
    }

  const makerOrder = tx.source?.orders?.[fill.orderId]
  const takerOrder = tx.source?.orders?.[fill.takerOrderId]

  const makerMarket = enrichOrder(makerOrder)?.market
  const takerMarket = enrichOrder(takerOrder)?.market

  if(!makerMarket || !takerMarket) return { unknown:true }
  if(makerMarket.type !== "simple-ft" || takerMarket.type !== "simple-ft") return { unknown:true }

  const makerFillRatio = Number(fill.numerator || 0) / Number(fill.denominator || 1)
  const baseAmount = Math.trunc(makerMarket.baseAmount * makerFillRatio)

  return reduceFraction(baseAmount, takerMarket.baseAmount)
}

function renderTxSourceInfo(tx){  // renders too

  const seenMakers = new Set()
  const makerItems = []
  const takers = {}

  function addTaker(orderId, ratio){
    if(!orderId) return

    takers[orderId] ||= {
      numerator: 0,
      denominator: 1,
      unknown: false
    }

    if(ratio.unknown){
      takers[orderId].unknown = true
      return
    }

    const current = takers[orderId]

    const reduced = reduceFraction(
      current.numerator * ratio.denominator + ratio.numerator * current.denominator,
      current.denominator * ratio.denominator
    )

    takers[orderId] = reduced
  }

  ;(tx.source?.fills || []).forEach(fill => {

    if(fill.orderId){
      const r = reduceFraction(fill.numerator, fill.denominator)
      let fraction = `${r.numerator}/${r.denominator}`
      if(fraction == "1/1") fraction = "All"

      const key = `${fraction} of #${fill.orderId}`
      if(!seenMakers.has(key)){
        seenMakers.add(key)
        makerItems.push(key)
      }
    }

    if(fill.takerOrderId)
      addTaker(fill.takerOrderId, getTxFillTakerRatio(tx, fill))
  })

  const takerItems = Object.entries(takers).map(([orderId, ratio]) => {
    const fraction = formatTxSourceFraction(ratio)
    return fraction ? `${fraction} of #${orderId}` : `#${orderId}`
  })

  const makerText = makerItems.join(", ")
  const takerText = takerItems.join(", ")

  if(makerText && takerText)
    return `${getNumberBlock(makerItems.length)} ${makerText} by ${takerText}`

  if(makerText)
    return `${getNumberBlock(makerItems.length)} ${makerText}`

  if(takerText)
    return `by ${takerText}`

  return ""
}


function isTxSuccessStatus(status){
  return String(status || "").toUpperCase() == "SUCCESS"
}

function getTxStatus(tx){

  const txid = tx.txid
  if(!txid) return tx.lifecycle?.status || "?"

  const settled =
    Object.values(state.players || {})
      .flatMap(player =>
        Object.values(player.orders || {})
      )
      .some(order =>
        (order.settled || [])
          .some(x =>
            x.txid == txid
          )
      )

  if(settled)
    return "SUCCESS"

  return tx.lifecycle?.status || "?"
}


function getTxMeta(tx){

  const network = tx.network || tx.pchbasis?.network || "mainnet"
  const txid = tx.txid || "?"
  const pch = (tx.pch || "?").substring(0,6)
  const status = getTxStatus(tx)
  const success = isTxSuccessStatus(status)

  return {
    network,
    txid,
    pch,
    status,
    statusText: success ? "✅" : "❓",
    url: success
      ? `https://hashscan.io/${network}/transaction/${txid}`
      : `https://swap.kpay.live/future/?network=${network}&txid=${tx.txid}&pch=${tx.pch}`
  }

}

function renderTxMeta(tx){
  
  const meta = getTxMeta(tx)

  return (
    `${meta.statusText} ` +
    `<a href="${meta.url}" target="_blank">${meta.txid}</a> ` +
    `&nbsp pch#${meta.pch}`
  )

}




// ┌─┐┬─┐┌─┐┌─┐┌┬┐┌─┐  ╔╦╗─┐ ┬  ╔═╗┌─┐┌─┐┌─┐┌┬┐┌─┐
// │  ├┬┘├┤ ├─┤ │ ├┤    ║ ┌┴┬┘  ╠═╣└─┐└─┐├┤  │ └─┐
// └─┘┴└─└─┘┴ ┴ ┴ └─┘   ╩ ┴ └─  ╩ ╩└─┘└─┘└─┘ ┴ └─┘
// create Tx Assets
function createTxAssets(tx,orderType){

  const basis = tx.pchbasis?.transfers || {}
  const transfers = [
    ...(basis.tokenTransfers || []),
    ...(basis.hbarTransfers || []).map(x => ({...x, tokenId:"HBAR"}))
  ]

  if(orderType == "simple-ft"){
    const HEDERA_FEE_ACCOUNTS = new Set(["0.0.98","0.0.800","0.0.801","0.0.802"])
    const tradeTransfers = transfers.filter(x => !HEDERA_FEE_ACCOUNTS.has(x.accountId))
    return createSimpleFxTxAssets(tradeTransfers)
  }

  return createGenericTxAssets(transfers)

}

function createGenericTxAssets(transfers){

  const el = document.createElement("span")
  el.className = "tx-assets"

  const addSide = items =>
    items.forEach(x =>
      el.appendChild(
        makeAssetEl({
          text:
            `${x.accountId} ` +
            getAssetDisplay(
              x.tokenId,
              Math.abs(x.amount)
            ),
          assetId:x.tokenId,
          ownerAccountId:x.accountId
        })
      )
    )

  const send = transfers.filter(x => x.amount < 0)
  const receive = transfers.filter(x => x.amount > 0)

  addSide(send)

  if(send.length && receive.length){
    const arrow = document.createElement("span")
    arrow.className = "tx-arrow"
    arrow.textContent = " → "
    el.appendChild(arrow)
  }

  addSide(receive)

  return el

}


function createSimpleFxTxAssets(transfers){

  const el = document.createElement("span")
  el.className = "tx-assets"

  const byAccount = {}

  transfers.forEach(x => {
    const id = x.accountId

    if(!byAccount[id])
      byAccount[id] = {neg:[],pos:[]}

    const side =
      x.amount < 0
        ? byAccount[id].neg
        : byAccount[id].pos

    side.push({
      tokenId:x.tokenId,
      amount:Math.abs(x.amount)
    })
  })

  Object.entries(byAccount).forEach(([accountId,v]) => {

    const neg =
      v.neg
        .map(x => getAssetDisplay(x.tokenId,x.amount))
        .join(", ")

    const pos =
      v.pos
        .map(x => getAssetDisplay(x.tokenId,x.amount))
        .join(", ")

    const chip = makeAssetEl({
      text:`${accountId} ${neg} → ${pos}`
    })

    chip.classList.add("tx-fx-chip")

    el.appendChild(chip)

  })

  return el

}

function getTxOrderIds(tx){

  const ids = []

  ;(tx.source?.fills || []).forEach(fill => {
    if(fill.orderId) ids.push(String(fill.orderId))
    if(fill.takerOrderId) ids.push(String(fill.takerOrderId))
  })

  return [...new Set(ids)]
}

function getTxSourceOrder(tx, orderId){
  if(!orderId) return null

  const key = String(orderId)

  return (
    getAllOrders().find(x => String(x.orderId) == key)?.order ||
    tx.source?.orders?.[key] ||
    tx.source?.orders?.[orderId] ||
    null
  )
}

function getTxMainOrder(tx){
  const fill = tx.source?.fills?.[0] || {}

  return (
    getTxSourceOrder(tx, fill.orderId) ||
    getTxSourceOrder(tx, fill.takerOrderId)
  )
}

function getOrderTypeFromPchbasis(tx){
  const basis = tx.pchbasis?.transfers
  if(!basis) return null
  const HEDERA_FEE_ACCOUNTS = new Set(["0.0.98","0.0.800","0.0.801","0.0.802"])
  const transfers = [
    ...(basis.tokenTransfers || []),
    ...(basis.hbarTransfers  || [])
  ].filter(x => !HEDERA_FEE_ACCOUNTS.has(x.accountId))
  if(!transfers.length) return null
  const accounts = new Set(transfers.map(x => x.accountId))
  return accounts.size <= 2 ? "simple-ft" : "basket-ft"
}

function getTxPair(tx){
  return enrichOrder(getTxMainOrder(tx))?.market?.pair || ""
}



function createTxRow(tx){

  const row = document.createElement("div")
  const meta = document.createElement("span")

  row.className = "subtle tx-row"
  if(isTxSuccessStatus(getTxStatus(tx)))
    row.classList.add("success")


  row.dataset.fills =
    (tx.source?.fills || [])
      .map(x => x.fillId)
      .filter(Boolean)
      .join(",")


  row.dataset.txkey = getTxKey(tx)
  row.dataset.orderIds = getTxOrderIds(tx).join(",")
    
  const order = getTxMainOrder(tx)
  const orderType = getOrderType(order) || getOrderTypeFromPchbasis(tx) || "generic"
  const market = enrichOrder(order)?.market
  const side = market?.side ? ` ${market.side}` : ""
  const sourceInfo = renderTxSourceInfo(tx)
  const sourceText = sourceInfo ? ` ${sourceInfo}` : ""

  row.dataset.orderSide = market?.side || ""

  meta.innerHTML = renderTxMeta(tx) + ` [${orderType}${side}${sourceText}] `

  row.appendChild(meta)
  row.appendChild(
    createTxAssets(
      tx,
      orderType
    )
  )

  return row

}


function getTxKey(tx){
  return `${tx.txid}|${tx.pch || ""}`
}



function getTxStartSeconds(tx){

  const fromTxid = String(tx.txid || "").split("@")[1]
  if(fromTxid) return Number(fromTxid.split(".")[0])

  const start = tx.pchbasis?.transactionValidStart || tx.pchbasis?.transactionID?.transactionValidStart
  if(!start) return 0

  if(typeof start == "object") return Number(start.seconds || 0)

  return Number(String(start).split(".")[0])

}



function isTxExpired(tx){

  if(isTxSuccessStatus(getTxStatus(tx))) return false

  const seconds = getTxStartSeconds(tx)
  if(!seconds) return false

  const ageMs = Date.now() - (seconds * 1000)

  return ageMs > ((2 * 60 + 30) * 1000)

}




let _txRenderToken = 0

// Cap the rendered transactions list. The store is unbounded (IndexedDB) and the
// list unions stored history + live pending + settled stubs, so without a cap it
// grows without limit. Show the most-recent TX_LIST_MAX after filtering.
const TX_LIST_MAX = 50

async function renderTransactions(){

  const listEl = document.querySelector("#transactionsSection .transactions-list")

  if(!listEl) return

  // render() runs on every state update and is not serialised, so this can be
  // re-entered many times in quick succession. It now does real async I/O
  // (IndexedDB via Localbase), so overlapping calls would each clear-then-append
  // the same rows AFTER all had cleared — producing N duplicate copies and the
  // flashing. Tag each run; only the most recent one is allowed to commit.
  const token = ++_txRenderToken

  // Persist pending txs for post-settlement history, but OFF the render path —
  // getAllTx() already unions live pending, so display never waits on a write.
  cachePendingTxs()

  const txs = await getAllTx()

  if(token !== _txRenderToken) return   // a newer render superseded this one

  const hideExpired =
    document.querySelector("#hideExpiredTx")
      ?.checked

  txs.sort((a,b) => {

    const ta =
      a.txid?.split("@")[1] || "0"

    const tb =
      b.txid?.split("@")[1] || "0"

    return tb.localeCompare(ta)
  })


  const selectedPair = getSelectedPair()

  // Build off-DOM, then swap the whole list in one synchronous step. This both
  // avoids an empty intermediate frame (the flash) and means an overlapping
  // render can only ever REPLACE the list wholesale — never stack onto it.
  const frag = document.createDocumentFragment()

  // Filter first, then cap to the most-recent TX_LIST_MAX (txs is already sorted
  // newest-first), so the cap counts visible rows rather than pre-filter records.
  const visible = txs.filter(tx => {

    if(hideExpired && isTxExpired(tx))
      return false

    const pair = getTxPair(tx)

    if(selectedPair && pair != selectedPair)
      return false

    return true

  }).slice(0, TX_LIST_MAX)

  for(const tx of visible)
    frag.appendChild(createTxRow(tx))

  listEl.replaceChildren(frag)


}




function getPendingFillItems(orderId){

  const target = String(orderId)
  const seen = new Set()

  return (state?.tx?.pending || [])
    .flatMap(tx =>
      (tx.source?.fills || [])
        .flatMap(fill => {

          const items = []

          if(String(fill.orderId) === target)
            items.push({
              ...fill,
              role:"maker",
              txid:tx.txid,
              pch:tx.pch
            })

          if(String(fill.takerOrderId) === target)
            items.push({
              ...fill,
              role:"taker",
              orderId:fill.takerOrderId,
              makerOrderId:fill.orderId,
              numerator:fill.takerNumerator,
              denominator:fill.takerDenominator,
              txid:tx.txid,
              pch:tx.pch
            })

          return items
        })
    )
    .filter(x => {

      if(!x.fillId) return false
      if(!x.numerator || !x.denominator) return false

      const key = `${x.role}|${x.txid}|${x.pch}|${x.fillId}`

      if(seen.has(key)) return false

      seen.add(key)
      return true
    })
}




function getSettledFillItems(orderId){

  const rec =
    getAllOrders().find(
      x => x.orderId == orderId
    )

  return (rec?.order?.settled || [])
    .map(x => ({
      ...x,
      fillId:x.fillId || `tx:${x.txid}`
    }))

}


// ┬─┐┌─┐┌┐┌┌┬┐┌─┐┬─┐  ╔╦╗┌─┐┬─┐┬┌─┌─┐┌┬┐  ╦ ╦┌─┐┌─┐┌┬┐┌┬┐┌─┐┌─┐
// ├┬┘├┤ │││ ││├┤ ├┬┘  ║║║├─┤├┬┘├┴┐├┤  │   ╠═╣├┤ ├─┤ │ │││├─┤├─┘
// ┴└─└─┘┘└┘─┴┘└─┘┴└─  ╩ ╩┴ ┴┴└─┴ ┴└─┘ ┴   ╩ ╩└─┘┴ ┴ ┴ ┴ ┴┴ ┴┴  
// render Market Heatmap
function renderMarketHeatmap(pair,heatmap,opts={}){

  const width = opts.width ?? Math.min(window.innerWidth - 24,420)
  const height = opts.height ?? 140
  const pad = opts.pad ?? 12
  const barWidth = opts.barWidth ?? 16
  const opacity = opts.opacity ?? 0.14
  const jitter = opts.jitter ?? 0

  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg")
  svg.setAttribute("width",width)
  svg.classList.add("market-chart")

  const {minRate,maxRate,maxVolume} = heatmap.stats
  const chartW = width - (pad * 2)
  const chartH = height - (pad * 2)

  svg.setAttribute("height",height + chartH + 4)
  renderHeatmapGrid(svg,width,height,pad)

  heatmap.rows.forEach(row => {
    const layout = getHeatmapLayout(row,{minRate,maxRate,maxVolume,chartW,chartH,height,pad,barWidth,jitter})
    renderHeatmapBar(svg,row,layout,opacity)
    renderHeatmapFillLines(svg,row,layout)
    renderPendingFillStack(svg,row,layout)
    renderSettledFillStack(svg,row,layout)
  })

  return svg

}

function getHeatmapLayout(row,cfg){

  const rate = row.displayRate
  const volume = row.displayBaseAmount
  const originalVolume = row.originalDisplayBaseAmount || volume
  const x = cfg.pad + ((rate - cfg.minRate) / (cfg.maxRate - cfg.minRate || 1)) * cfg.chartW
  const h = (volume / (cfg.maxVolume || 1)) * cfg.chartH
  const originalH = (originalVolume / (cfg.maxVolume || 1)) * cfg.chartH
  const jitterX = cfg.jitter ? (Math.random() - 0.5) * cfg.jitter : 0
  const rectX = x - (cfg.barWidth / 2) + jitterX

  return {x:rectX,y:cfg.height-cfg.pad-h,h,originalH,originalY:cfg.height-cfg.pad-originalH,width:cfg.barWidth,height:cfg.height,pad:cfg.pad}

}

function getHeatmapColors(row){
  return {
    color:row.side=="buy" ? "#2ecc71" : "#e74c3c",
    lineColor:row.side=="buy" ? "#27ae60" : "#c0392b"
  }
}

function renderHeatmapBar(svg,row,l,opacity){

  const {color} = getHeatmapColors(row)

  svg.appendChild(createHeatmapLine(l.x,l.originalY,l.x,l.height-l.pad,{stroke:color,"stroke-width":"1","stroke-opacity":opacity+0.05}))

  const rect = createHeatmapRect(l.x,l.y,l.width,l.h,{fill:color,"fill-opacity":opacity})

  rect.dataset.rate = row.displayRate
  rect.dataset.volume = row.displayBaseAmount
  rect.dataset.orderId = row.orderId
  rect.dataset.type = "bar"
  rect.__heatmapData = {row,x:l.x,y:l.y,w:l.width,h:l.h}

  rect.onclick = e => {

    // if(!e.ctrlKey) return
    const fullOrder = getAllOrders().find(x => String(x.orderId) === String(row.orderId))?.order
    
    openCreateOrderModal({
      mode:"order",
      orderId:row.orderId,
      playerId:row.playerId,
      type:"simple-ft",
      pair:`${row.baseAsset}/${row.quoteAsset}`,
      side:row.side,
      volume:row.originalDisplayBaseAmount,
      rate:row.displayRate,
      accountId:`${row.playerId}:${row.accountId}`,
      minFill:     fullOrder?.minFill     || null,
      timeInForce: fullOrder?.timeInForce || "GTC",
      expiresAt:   fullOrder?.expiresAt   || null,
    })

  }

  svg.appendChild(rect)

}

function renderHeatmapFillLines(svg,row,l){

  const {lineColor} = getHeatmapColors(row)
  const fill = getOrderFillRatio(row.orderId)
  const pendingFill = getPendingOrderFillRatio(row.orderId)
  const fillRatio = fill.numerator / fill.denominator
  const totalFillRatio = fillRatio + (pendingFill.numerator / pendingFill.denominator)
  const fillY = l.height - l.pad - (l.originalH * fillRatio)
  const pendingY = l.height - l.pad - (l.originalH * totalFillRatio)

  const fillLine = createHeatmapLine(l.x,fillY,l.x+l.width,fillY,{stroke:lineColor,"stroke-width":"1","stroke-opacity":"0.5","stroke-dasharray":"1 1"})
  fillLine.dataset.orderId = row.orderId
  fillLine.dataset.type = "fill"
  fillLine.dataset.numerator = fill.numerator
  fillLine.dataset.denominator = fill.denominator
  svg.appendChild(fillLine)

  const pendingLine = createHeatmapLine(l.x,pendingY,l.x+l.width,pendingY,{stroke:lineColor,"stroke-width":"2","stroke-opacity":"0.7"})
  pendingLine.dataset.orderId = row.orderId
  pendingLine.dataset.type = "pending"
  pendingLine.dataset.numerator = pendingFill.numerator
  pendingLine.dataset.denominator = pendingFill.denominator
  svg.appendChild(pendingLine)

  l.fillY = fillY

}

function renderPendingFillStack(svg,row,l){

  const {lineColor} = getHeatmapColors(row)
  let y = l.fillY

  getPendingFillItems(row.orderId).forEach(item => {
    const itemH = getFillHeight(l.originalH,item)
    y -= itemH

    const bubble = createHeatmapRect(l.x,y,l.width,itemH,{rx:"7",ry:"7",fill:"transparent","pointer-events":"all",stroke:lineColor,"stroke-opacity":"0.6","stroke-dasharray":"2 2"})
    bubble.dataset.orderId = row.orderId
    bubble.dataset.fillId = item.fillId
    bubble.dataset.txkey = getTxKey(item)
    bubble.dataset.type = "bubble"
    bubble.dataset.side = row.market?.side || ""

    svg.appendChild(bubble)
  })

}

function renderSettledFillStack(svg,row,l){

  const {color} = getHeatmapColors(row)
  let y = l.height - l.pad + 2

  getSettledFillItems(row.orderId).forEach(item => {
    const itemH = getFillHeight(l.originalH,item)

    const settledBlock = createHeatmapRect(l.x,y,l.width,itemH,{fill:color,"fill-opacity":"0.35"})
    settledBlock.dataset.orderId = row.orderId
    settledBlock.dataset.fillId = item.fillId
    settledBlock.dataset.txkey = getTxKey(item)
    settledBlock.dataset.type = "settled"
    settledBlock.dataset.side = row.market?.side || ""

    svg.appendChild(settledBlock)
    y += itemH
  })

}


function getFillHeight(originalH,item){
  const ratio = item.numerator / item.denominator
  return originalH * ratio
}


function createHeatmapLine(x1,y1,x2,y2,attrs={}){

  const el = document.createElementNS("http://www.w3.org/2000/svg","line")

  el.setAttribute("x1",x1)
  el.setAttribute("y1",y1)
  el.setAttribute("x2",x2)
  el.setAttribute("y2",y2)

  Object.entries(attrs).forEach(([k,v]) =>
    el.setAttribute(k,v)
  )

  return el
}

function renderHeatmapGrid(svg,width,height,pad){

  svg.appendChild(
    createHeatmapLine(
      pad,
      height-pad+1,
      width-pad,
      height-pad+1,
      {
        stroke:"#999",
        "stroke-width":"0.5",
        "stroke-opacity":"0.35"
      }
    )
  )

}


function createHeatmapRect(x,y,w,h,attrs={}){

  const el =
    document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect"
    )

  el.setAttribute("x",x)
  el.setAttribute("y",y)
  el.setAttribute("width",w)
  el.setAttribute("height",h)

  Object.entries(attrs)
    .forEach(([k,v]) =>
      el.setAttribute(k,v)
    )

  return el
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

function setHeatmapElementHighlight(el,on){

  const t = el.dataset.type
  const side = el.dataset.side

  if(side)
    el.classList.toggle(`svg-${side}`,on)

  if(on){

    if(t=="bubble"){
      el.setAttribute("stroke-width","3")
      el.setAttribute("stroke-opacity","1")
    }

    if(t=="settled")
      el.setAttribute("fill-opacity","0.8")

    return
  }

  el.classList.remove("svg-buy","svg-sell")

  if(t=="bubble"){
    el.setAttribute("stroke-width","1")
    el.setAttribute("stroke-opacity","0.6")
  }

  if(t=="settled")
    el.setAttribute("fill-opacity","0.35")
}

function highlightHeatmapFill(fillId,on){

  document
    .querySelectorAll(`[data-fill-id="${fillId}"]`)
    .forEach(el => setHeatmapElementHighlight(el,on))
}

function highlightHeatmapTx(txkey,on){

  if(!txkey) return

  document
    .querySelectorAll(`[data-txkey="${txkey}"]`)
    .forEach(el => setHeatmapElementHighlight(el,on))
}

function highlightOrder(orderId,on){

  document
    .querySelectorAll(`.order-row[data-order-id="${orderId}"]`)
    .forEach(el =>
      el.classList.toggle("tx-highlight",on)
    )

  document
    .querySelectorAll(`[data-order-id="${orderId}"][data-type="bar"]`)
    .forEach(el => {

      if(on){
        el.setAttribute("stroke","#fff")
        el.setAttribute("stroke-width","2")
        el.setAttribute("fill-opacity","0.35")
      }else{
        el.removeAttribute("stroke")
        el.removeAttribute("stroke-width")
        el.setAttribute("fill-opacity","0.16")
      }

    })
}

function highlightTxRow(row,on){

  row.classList.toggle("tx-highlight",on)

  const side = row.dataset.orderSide

  if(side)
    row.classList.toggle(`tx-${side}`,on)

  row
    .querySelector(".tx-fx-chip")
    ?.classList.toggle(`tx-chip-${side}`,on)
}

function getRowOrderIds(row){
  return (row.dataset.orderIds || "")
    .split(",")
    .filter(Boolean)
}

function highlightTxOrders(row,on){
  getRowOrderIds(row).forEach(orderId =>
    highlightOrder(orderId,on)
  )
}

function highlightTxRows(fillId,on){

  document.querySelectorAll(".tx-row").forEach(row => {

    const fills = (row.dataset.fills || "").split(",")

    if(!fills.includes(String(fillId)))
      return

    highlightTxRow(row,on)
  })
}

function highlightTxRowsByTxKey(txkey,on){

  if(!txkey) return

  document.querySelectorAll(".tx-row").forEach(row => {
    if(row.dataset.txkey !== txkey) return

    highlightTxRow(row,on)
    highlightTxOrders(row,on)
  })
}

function highlightTxRowsByOrder(orderId,on){

  if(!orderId) return

  document.querySelectorAll(".tx-row").forEach(row => {

    if(!getRowOrderIds(row).includes(String(orderId)))
      return

    highlightTxRow(row,on)
    highlightHeatmapTx(row.dataset.txkey,on)
    highlightTxOrders(row,on)
  })
}

function highlightOrderContext(orderId,on){
  highlightOrder(orderId,on)
  highlightTxRowsByOrder(orderId,on)
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
        `${row.originalDisplayBaseAmount} ` +
        `@ ${formatRate(row.displayRate)} ` +
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




// ─┐ ┬┬─┐┌─┐┌─┐  ┬ ┬┌─┐┬  ┬┌─┐┬─┐  ┌┬┐─┐ ┬  ┌─┐┬  ┬┌─┐
// ┌┴┬┘├┬┘├┤ ├┤   ├─┤│ │└┐┌┘├┤ ├┬┘   │ ┌┴┬┘  └─┐└┐┌┘│ ┬
// ┴ └─┴└─└─┘└    ┴ ┴└─┘ └┘ └─┘┴└─   ┴ ┴ └─  └─┘ └┘ └─┘
// xref hover tx svg



document.addEventListener("mouseover",e => { // xref hover tx -> svg/orders

  const row = e.target.closest(".tx-row")
  if(!row) return

  highlightTxRow(row,true)
  highlightHeatmapTx(row.dataset.txkey,true)
  highlightTxOrders(row,true)

})

document.addEventListener("mouseout",e => {

  const row = e.target.closest(".tx-row")
  if(!row) return

  highlightTxRow(row,false)
  highlightHeatmapTx(row.dataset.txkey,false)
  highlightTxOrders(row,false)

})


document.addEventListener("mouseover",e => { // xref hover svg -> tx/orders
  const el = e.target.closest('[data-type="bubble"],[data-type="settled"]')
  if(el){
    highlightHeatmapTx(el.dataset.txkey,true)
    highlightTxRowsByTxKey(el.dataset.txkey,true)
    highlightOrder(el.dataset.orderId,true)
  }
})

document.addEventListener("mouseout",e => {
  const el = e.target.closest('[data-type="bubble"],[data-type="settled"]')
  if(el){
    highlightHeatmapTx(el.dataset.txkey,false)
    highlightTxRowsByTxKey(el.dataset.txkey,false)
    highlightOrder(el.dataset.orderId,false)
  }
})

document.addEventListener("change",e => {
  if(["showMyOrdersOnly","showPendingOrdersOnly","sortOrdersByPrice"].includes(e.target.id))
    renderOrders()
})

document.addEventListener("mouseover",e => {
  const row = e.target.closest(".order-row")
  if(row) highlightOrderContext(row.dataset.orderId,true)

  const bar = e.target.closest('[data-type="bar"]')
  if(bar) highlightOrderContext(bar.dataset.orderId,true)
})

document.addEventListener("mouseout",e => {
  const row = e.target.closest(".order-row")
  if(row) highlightOrderContext(row.dataset.orderId,false)

  const bar = e.target.closest('[data-type="bar"]')
  if(bar) highlightOrderContext(bar.dataset.orderId,false)
})


function getSelectedPair(){
  return new URLSearchParams(location.search).get("pair") || ""
}


function createTradeBtn(pair){  //simple FX

  const btn = document.createElement("button")

  btn.className = "multifill-btn debug-only"
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

  const selectedPair = getSelectedPair()

  Object.entries(markets).forEach(([pair, rows]) => {

    if(selectedPair && pair != selectedPair)
      return

    const row = document.createElement("div")
    row.className = "market-summary-row"

    const summary = rows
      .map(row => {

      return (
        `#${row.orderId} ` +
        `${row.side} ` +
        `${row.originalDisplayBaseAmount} ` +
        `@ ${row.displayRate}`
      )
      })
      .join(" | ")


    const text = document.createElement("span")

    text.innerHTML =
      `<a class="market-pair-label" href="?pair=${encodeURIComponent(pair)}">${pair}</a> ` +
      `(${rows.length}) ` +
      `<span class="debug-only">${summary}</span>`
      
      
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

      const pendingOnly =
        document.getElementById("showPendingOrdersOnly")?.checked

      const sortByPrice =
        document.getElementById("sortOrdersByPrice")?.checked
        
      orders.sort((a,b) => {

        const ea = enrichOrder(a.order)
        const eb = enrichOrder(b.order)

        const ta = ea.market?.type || "invalid"
        const tb = eb.market?.type || "invalid"

        const typeCmp = ta.localeCompare(tb)

        if(typeCmp)
          return typeCmp

        if(sortByPrice){

          const ra = ea.market?.rate ?? 0
          const rb = eb.market?.rate ?? 0

          if(ra != rb)
            return ra - rb
        }

        return a.orderId - b.orderId
      })



      const selectedPair = getSelectedPair()


      orders.forEach(orderRec => {

        const pair = enrichOrder(orderRec.order)?.market?.pair
        const myOnly = document.getElementById("showMyOrdersOnly")?.checked

        if(selectedPair && pair != selectedPair)
          return

        if(myOnly && orderRec.playerId != currentPlayerId)
          return

        const fillStatus = getOrderFillStatus(orderRec.orderId)

        if(pendingOnly && fillStatus.fullySettled)
          return
                
        listEl.appendChild(createOrderRow(orderRec))
      })

      // Ghost rows. An order can be purged (expiry / IOC / FOK) while a fill for
      // it is still pending on kpool, so it disappears from the live list before
      // its transaction settles — losing the context behind that pending tx. Each
      // pending tx is self-contained (source.orders carries the full order), so we
      // re-spawn any referenced order that is no longer live as a read-only ghost,
      // for display only. No local storage: the ghost self-heals, dropping out as
      // soon as the tx finalises and leaves state.tx.pending. Shown regardless of
      // the "my orders" toggle (it's context for an in-flight tx) but still scoped
      // to the selected pair.
      const liveOrderIds = new Set(orders.map(o => String(o.orderId)))
      const ghostSeen = new Set()

      ;(state?.tx?.pending || []).forEach(tx => {
        const srcOrders = tx?.source?.orders || {}

        Object.keys(srcOrders).forEach(orderId => {
          const id = String(orderId)

          if(liveOrderIds.has(id) || ghostSeen.has(id))
            return

          const order = srcOrders[id]
          if(!order)
            return

          const pair = enrichOrder(order)?.market?.pair
          if(selectedPair && pair != selectedPair)
            return

          ghostSeen.add(id)
          listEl.appendChild(createOrderRow({ orderId: id, order, playerId: null, ghost: true }))
        })
      })

    }
    // TODO:
    // Orders may reference assets not present in visible accounts,
    // so current enrichment (account-driven) may miss them.
    // Later: include orders in enrichment scan or run a separate pass.

        
    function getAllowedFxPair(base,quote){

      return getAllowedPairLabels()
        .find(([a,b]) =>
          (a==base && b==quote) ||
          (a==quote && b==base)
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

      const pair = getAcceptedPairs().find(pair =>
        (pair.base == offerLine.asset && pair.quote == requestLine.asset) ||
        (pair.quote == offerLine.asset && pair.base == requestLine.asset)
      )

      if(!pair)
        return {}

      const [baseLabel,quoteLabel] = pair.label.split("/")
      const offerIsBase = offerLine.asset == pair.base

      const pairLabel = pair.label
      const side = offerIsBase ? "sell" : "buy"
      const rate = offerIsBase ? requestAmount / offerAmount : offerAmount / requestAmount
      const volume = offerIsBase ? offerAmount : requestAmount

      return {
        derivedLabel:`[${side} ${volume} ${pairLabel} @${rate}]`,

        market:{
          type:"simple-ft",
          pair:pairLabel,
          side,
          rate,
          volume,
          
          accountId: offerLine.accountId,

          baseAsset:pair.base,
          quoteAsset:pair.quote,
          baseAmount:offerIsBase ? offerAmount : requestAmount,
          quoteAmount:offerIsBase ? requestAmount : offerAmount
        }
      }
    }

    const orderTypeEnrichers = {
      "simple-ft": enrichSimpleFxOrder
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
        const assetLabel = getAssetDisplay(x.asset, amt)
        const accountLabel = x.accountId ? (x.accountId.split(":")[1] || x.accountId) : ""
        const text = accountLabel ? `${accountLabel} ${assetLabel}` : assetLabel

        const assetEl = makeAssetEl({
          text,
          assetId: x.asset,
          ownerAccountId: "",
          ownerPlayerId: "",
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

// ── helpers ──────────────────────────────────────────────────────────────────


function getOrderFillStatus(orderId){
  const fill        = getOrderFillRatio(orderId)
  const pending     = getPendingOrderFillRatio(orderId)
  const settled     = getSettledOrderFillRatio(orderId)

  const fullySettled =
    settled.numerator > 0 &&
    settled.numerator == settled.denominator

  const pendingText =
    pending.numerator == 0
      ? ""
      : `kpool ${pending.numerator}/${pending.denominator} |`

  const settledPercent =
    Math.round(
      (settled.numerator * 100) /
      (settled.denominator || 1)
    )

  const settledText =
    settled.numerator == 0
      ? ""
      : `${fullySettled ? "✅ " : ""}${settledPercent}% settled ${settled.numerator}/${settled.denominator}`

  return {
    fill,
    pendingText,
    settledText,
    settled,
    fullySettled
  }
}


function formatRate(rate){
  return parseFloat(Number(rate).toPrecision(12))
}

function getOrderMarketLabel(orderId, playerId, enriched){
  if(enriched.market?.type !== "simple-ft") return enriched.derivedLabel || ""

  const fxRow = enrichSimpleFxMarketRow({ orderId, playerId, market: enriched.market })
  if(!fxRow) return enriched.derivedLabel || ""

  // return `@${formatRate(fxRow.displayRate)} ${fxRow.side} ${fxRow.displayBaseAmount} ${fxRow.pair}`   // volume here is what remaining to fill, not original
    return `@${formatRate(fxRow.displayRate)} ${fxRow.side} ${fxRow.originalDisplayBaseAmount} ${fxRow.pair}`
}


function makeOrderRowOnClick(orderId, playerId, enriched, order){
  return () => {
    if(enriched.market?.type !== "simple-ft") return

    const fxRow = enrichSimpleFxMarketRow({ orderId, playerId, market: enriched.market })
    if(!fxRow) return

    const fullOrder = getAllOrders().find(x => String(x.orderId) === String(orderId))?.order

    openCreateOrderModal({
      mode:        "order",
      orderId,
      playerId,
      type:        "simple-ft",
      pair:        `${fxRow.baseAsset}/${fxRow.quoteAsset}`,
      side:        fxRow.side,
      volume:      fxRow.originalDisplayBaseAmount,
      rate:        fxRow.displayRate,
      accountId:   `${playerId}:${fxRow.accountId}`,
      minFill:     fullOrder?.minFill     || null,
      timeInForce: fullOrder?.timeInForce || "GTC",
      expiresAt:   fullOrder?.expiresAt   || null,
    })
  }
}

function getOrderSignerSuffix(order){
  const key = order?.intentSignature?.pubkeyHex || ""
  if(!key) return ""

  // return `:${key.slice(-6).toUpperCase()}`
  return `:${key.slice(-6)}`
}

function buildOrderPrefix(orderId, playerId, mine, order, orderType, marketLabel, fillStatus){
  const { fill, pendingText, settledText } = fillStatus

  const tif        = order.timeInForce ? `${order.timeInForce} ` : ""
  const minFill    = order.minFill ? ` min ${order.minFill.numerator}/${order.minFill.denominator}` : ""
  
  const debugText =
    document.body.dataset.tradingMode == "debug"
      ? ` proposed ${fill.numerator}/${fill.denominator}`
      : ""

  const fillText = `${debugText} ${pendingText} ${settledText}`.trim()
  
  // const who        = `${playerId}${mine ? "=you" : ""}`
  const keySuffix  = getOrderSignerSuffix(order)
  const who        = `${playerId}${keySuffix}${mine ? "=you" : ""}`

  const el = document.createElement("span")
  el.textContent = `Order #${orderId} (${who}) [${tif}${orderType}] [${marketLabel}${minFill}] [${fillText}]: `
  return el
}

// ── main ─────────────────────────────────────────────────────────────────────

function createOrderRow({ orderId, order, playerId, ghost = false }){

  const row = document.createElement("div")
  row.className = "order-row"
  row.dataset.orderId = orderId

  // Ghost = order no longer live (purged on expiry/IOC/FOK) but still referenced
  // by a pending tx; rendered read-only from tx source.orders for context only.
  if(ghost){
    row.classList.add("order-ghost")
    row.title = "Order cleared while a transaction is still pending — shown from transaction source for context"
  }

  if(order?.bundle?.error){
    row.textContent = `Order #${orderId} (${playerId}): ❌  ${order?.bundle?.error}`
    applyOwnerSleeve(row, playerId)
    return row
  }

  const offer   = (order.bundle || []).filter(x => x.amount < 0)
  const request = (order.bundle || []).filter(x => x.amount > 0)

  const mine       = playerId === currentPlayerId
  const enriched   = enrichOrder(order)
  const orderType  = getOrderType(order) || "invalid-YE23998"
  const marketLabel = getOrderMarketLabel(orderId, playerId, enriched)
  const fillStatus  = getOrderFillStatus(orderId)

  row.classList.toggle(
    "order-fully-settled",
    fillStatus.fullySettled
  )


  row.dataset.orderSide = enriched.market?.side || ""
  // ghosts are display-only: no row interactions
  if(!ghost)
    row.onclick = makeOrderRowOnClick(orderId, playerId, enriched, order)

  const prefix = buildOrderPrefix(orderId, playerId, mine, order, orderType, marketLabel, fillStatus)
  const arrow  = document.createElement("span")
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





// ┌─┐┬  ┬┌─┐┬┌─  ┬ ┬┌─┐┌┐┌┌┬┐┬  ┌─┐┬─┐┌─┐
// │  │  ││  ├┴┐  ├─┤├─┤│││ │││  ├┤ ├┬┘└─┐
// └─┘┴─┘┴└─┘┴ ┴  ┴ ┴┴ ┴┘└┘─┴┘┴─┘└─┘┴└─└─┘
// click handlers

cancelOrderBtn.onclick = () => {

  const input = prompt("Delete order(s)\n\nEnter order Ids, comma separated")
  if(!input) return

  input.split(",").map(x => x.trim()).filter(Boolean).forEach(orderId => cancelOrder(orderId))
}

createOrderBtn.onclick = () => {
  openCreateOrderModal()
}

document.addEventListener("click", async e => {

  if(e.target.id == "createOrderCancel"){
    closeCreateOrderModal()
    return
  }

  if(e.target.id == "createOrderTruncate"){
    alert("Truncate not yet available")
    return
  }

  if(e.target.id == "createOrderDelete"){
    cancelOrder(window.createOrderContext?.orderId)
    closeCreateOrderModal()
    return
  }

  if(e.target.id == "createOrderEdit"){
    cancelOrder(window.createOrderContext?.orderId)
    await createOrderFromModal()
    return
  }

  if(e.target.id == "createOrderSubmit"){
    await createOrderFromModal()
    return
  }

})

function cancelOrder(orderId){

  if(!orderId) return

  socket.send(JSON.stringify({
    type:"game_orderCancel",
    gameId,
    orderId
  }))
}



// ─── helpers ──────────────────────────────────────────────────────────────────

function parseMinFill(raw) {
  raw = (raw || "").trim()
  if (!raw) return { ok: true, minFill: null }

  const parts = raw.split("/").map(x => x.trim())
  const n = parseInt(parts[0], 10)
  const d = parseInt(parts[1], 10)

  if (parts.length !== 2 || !Number.isInteger(n) || !Number.isInteger(d) || n <= 0 || d <= 0 || n > d) {
    return { ok: false, minFill: null }
  }

  return { ok: true, minFill: { numerator: n, denominator: d } }
}


function checkMinFillDivisibility(bundle, minFill) {
  if (!minFill || !Array.isArray(bundle)) return true

  const fractional = bundle.filter(item =>
    typeof item.amount === "number" &&
    Math.abs(item.amount) % minFill.denominator !== 0
  )

  if (!fractional.length) return true

  return confirm(
    `Warning: minFill denominator ${minFill.denominator} doesn't divide evenly into ` +
    `some bundle amounts — fills may be truncated.\n\nProceed anyway?`
  )
}

// ┌─┐┬┌─┐┌┐┌  ┌─┐┬─┐┌┬┐┌─┐┬─┐  ┌─┐┌─┐┬ ┬┬  ┌─┐┌─┐┌┬┐
// └─┐││ ┬│││  │ │├┬┘ ││├┤ ├┬┘  ├─┘├─┤└┬┘│  │ │├─┤ ││
// └─┘┴└─┘┘└┘  └─┘┴└──┴┘└─┘┴└─  ┴  ┴ ┴ ┴ ┴─┘└─┘┴ ┴─┴┘
// sign order payload

const SIG_SPEC_FIELDS = ["specVersion","gameId","network","clientOrderId","issuedAt","bundleHash","timeInForce","minFill"]
//todo update spec?..
// const SIG_SPEC_FIELDS = ["specVersion","gameId","network","clientOrderId","issuedAt","bundleHash","timeInForce","expiresAt","minFill"]

const SIG_SPEC = (async () => {
  const bytes  = new TextEncoder().encode(JSON.stringify(SIG_SPEC_FIELDS))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 8)
})()

async function buildSigPayload(data) {
  const specVersion = await SIG_SPEC
  const full = { ...data, specVersion }
  const missing = SIG_SPEC_FIELDS.filter(k => !(k in full))
  if (missing.length) throw new Error(`UR84743 buildSigPayload missing fields: ${missing.join(", ")}`)
  return Object.fromEntries(SIG_SPEC_FIELDS.map(k => [k, full[k]]))
}


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

async function hashBundle(bundle) {
  const bytes  = new TextEncoder().encode(JSON.stringify(bundle))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0")).join("")
}


function parseMatchConditions(raw){
  const text = (raw || "").trim()
  if(!text) return null

  // JSON escape hatch: paste an object or array directly
  if(text[0] === "{" || text[0] === "["){
    try { return JSON.parse(text) }
    catch(e){ alert("Conditions: invalid JSON\n\n" + e.message); throw e }
  }

  // friendly format: one condition per line
  //   singleCounterparty
  //   singleCounterparty maxCounterparties=2
  // blank lines and #/// comments are ignored
  const coerce = v =>
    v === "true"  ? true  :
    v === "false" ? false :
    (v !== "" && !isNaN(v)) ? Number(v) : v

  const conditions = []

  for(const line of text.split(/\r?\n/)){
    const s = line.trim()
    if(!s || s.startsWith("#") || s.startsWith("//")) continue

    const [type, ...rest] = s.split(/\s+/)
    const cond = { type }

    for(const token of rest){
      const eq = token.indexOf("=")
      if(eq === -1) continue
      cond[token.slice(0, eq)] = coerce(token.slice(eq + 1))
    }

    conditions.push(cond)
  }

  return conditions.length ? conditions : null
}


async function buildSignedOrder(bundle, { minFill, timeInForce, expiresAt, matchConditions = null, privateKey, publicKeyJwk }) {
  const clientOrderId = crypto.randomUUID()
  const issuedAt      = Date.now()
  const bundleHash    = await hashBundle(bundle)
  const signingPayload = await buildSigPayload({
    gameId,
    network:     gameMeta?.network ?? null,
    clientOrderId,
    issuedAt,
    bundleHash,
    timeInForce,
    expiresAt,
    minFill,
  })
  const intentSignature = await signOrder(signingPayload, privateKey, publicKeyJwk)
  return {
    bundle,
    minFill,
    timeInForce,
    expiresAt,
    clientOrderId,
    issuedAt,
    matchConditions,
    intentSignature,
  }
}



// ─── main ─────────────────────────────────────────────────────────────────────

async function createOrderFromModal() {

  const timeInForce = document.getElementById("createOrderTif")?.value || "GTC"
  const expiresAt = getCreateOrderExpiresAt()

  if(timeInForce === "GTD" && !expiresAt){
    alert("Please choose an expiry date/time for GTD")
    return
  }

  if(timeInForce === "GTD" && expiresAt <= Date.now()){
    alert("Expiry date/time must be in the future")
    return
  }

  const { ok, minFill } = parseMinFill(document.getElementById("createOrderMinFill")?.value)
  if (!ok) {
    alert("Min fill must be a valid fraction e.g. 1/3 or 2/6\n\nnumerator and denominator must be positive integers, numerator ≤ denominator")
    return
  }

  let matchConditions = null
  try {
    matchConditions = parseMatchConditions(document.getElementById("createOrderConditions")?.value)
  } catch(e){
    return  // invalid conditions — alert already shown
  }

  const { privateKey, publicKeyJwk } = await getOrCreatePlayerKeypair()

  for (const line of getCreateOrderData()) {

    const bundle = normaliseOrder(line)

    if (!checkMinFillDivisibility(bundle, minFill)) return

    const order = await buildSignedOrder(bundle, { minFill, timeInForce, expiresAt, matchConditions, privateKey, publicKeyJwk })
    
    socket.send(JSON.stringify({
      type: "game_orderCreate",
      gameId,
      order
    }))
  }

  closeCreateOrderModal()
}




function normaliseOrder(input){
  try {
    const records = input.split('|').filter(Boolean)
    const result = []

    for (const record of records){
      const [a,b,c] = record.split(';')

      if(!a || !b || c === undefined){
        throw new Error(`Bad record: ${record}`)
      }

      // const norm = v => v.includes('.') ? v : `0.0.${v}`
      const norm = v => (String(v).toUpperCase() === 'HBAR') ? 'HBAR' : (v.includes('.') ? v : `0.0.${v}`)

      result.push({
        accountId: norm(a),
        asset: norm(b),
        amount: Number(c)
      })
    }

    return result

  } catch (err) {
    return {
      raw: input,
      error: err.message
    }
  }
}
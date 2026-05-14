function getSimpleFxMarkets(){

  const grouped = {}

  getAllOrders().forEach(orderRec => {

    const enriched = enrichOrder(orderRec.order)

    const market = enriched.market

    if(!market) return
    if(market.type !== "simple-fx") return

    grouped[market.pair] ||= []

    const enrichedRow = enrichSimpleFxMarketRow({
      orderId: orderRec.orderId,
      playerId: orderRec.playerId,
      market
    })

    grouped[market.pair].push(enrichedRow)

  })

  return grouped
}

function enrichSimpleFxMarketRow({ orderId, playerId, market }){

  const baseMeta = getAssetMeta(market.baseAsset)
  const quoteMeta = getAssetMeta(market.quoteAsset)

  const baseDecimals =
    Number(baseMeta?.token_class?.decimals || 0)

  const quoteDecimals =
    Number(quoteMeta?.token_class?.decimals || 0)

  const displayBaseAmount =
    market.baseAmount / (10 ** baseDecimals)

  const displayQuoteAmount =
    market.quoteAmount / (10 ** quoteDecimals)

  const rawRate =
    market.quoteAmount / market.baseAmount

  // decimal-correct human rate
  const displayRate =
    displayQuoteAmount / displayBaseAmount

  return {
    orderId,
    playerId,

    pair: market.pair,
    side: market.side,

    baseAsset: market.baseAsset,
    quoteAsset: market.quoteAsset,

    rawBaseAmount: market.baseAmount,
    rawQuoteAmount: market.quoteAmount,

    displayBaseAmount,
    displayQuoteAmount,

    rawRate,
    displayRate
  }
}



function buildOrderBook(rows, opts = {}){

  const aggregate =
    opts.aggregate ?? true

  const bucketSize =
    opts.bucketSize ?? 0.01

  const buys = []
  const sells = []

  rows.forEach(row => {

    const sideRows =
      row.side === "buy"
        ? buys
        : sells

    if(!aggregate){

      sideRows.push({
        rate: row.displayRate,
        volume: row.displayBaseAmount,
        side: row.side,
        orders: [row]
      })

      return
    }

    const bucketRate =
      Math.floor(row.displayRate / bucketSize)
        * bucketSize

    let bucket = sideRows.find(x =>
      x.rate === bucketRate
    )

    if(!bucket){

      bucket = {
        rate: bucketRate,
        volume: 0,
        side: row.side,
        orders: []
      }

      sideRows.push(bucket)
    }

    bucket.volume += row.displayBaseAmount
    bucket.orders.push(row)
  })

  buys.sort((a,b) => a.rate - b.rate)
  sells.sort((a,b) => a.rate - b.rate)

  const all = [...buys, ...sells]

  return {
    buys,
    sells,

    stats: {
      minRate: Math.min(...all.map(x => x.rate)),
      maxRate: Math.max(...all.map(x => x.rate)),
      maxVolume: Math.max(...all.map(x => x.volume))
    }
  }
}


function renderMarketChart(pair, orderBook){

  const width = 420
  const height = 140
  const pad = 12

  const svg =
    document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    )

  svg.setAttribute("width", width)
  svg.setAttribute("height", height)
  svg.classList.add("market-chart")

  const all = [
    ...orderBook.buys,
    ...orderBook.sells
  ]

  const {
    minRate,
    maxRate,
    maxVolume
  } = orderBook.stats

  const chartW = width - pad * 2
  const chartH = height - pad * 2

  all.forEach(bucket => {

    const x =
      pad +
      (
        (bucket.rate - minRate)
        / (maxRate - minRate || 1)
      ) * chartW

    const h =
      (bucket.volume / (maxVolume || 1))
      * chartH

    const y =
      height - pad - h

    const rect =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      )

    rect.setAttribute("x", x)
    rect.setAttribute("y", y)
    rect.setAttribute("width", 8)
    rect.setAttribute("height", h)

    rect.setAttribute(
      "fill",
      bucket.side === "buy"
        ? "#2ecc71"
        : "#e74c3c"
    )

    rect.dataset.rate = bucket.rate
    rect.dataset.volume = bucket.volume
    rect.dataset.orders = bucket.orders.length

    svg.appendChild(rect)
  })

  return svg
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
          `${row.side} ` +
          `${row.displayBaseAmount} ` +
          `@ ${row.displayRate}`
        )
      })
      .join(" | ")

    row.textContent =
      `${pair} (${rows.length}) ${summary}`

    el.appendChild(row)

    const orderBook = buildOrderBook(rows, {

      // toggle later
      aggregate: false,

      // demo value for now
      bucketSize: 0.05
    })

    const chart =
      renderMarketChart(pair, orderBook)

    el.appendChild(chart)
  })
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
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


function buildHeatmap(rows){

  return {

    rows,

    stats: {

      minRate:
        Math.min(...rows.map(x => x.displayRate)),

      maxRate:
        Math.max(...rows.map(x => x.displayRate)),

      maxVolume:
        Math.max(...rows.map(x => x.displayBaseAmount))
    }
  }
}


function renderMarketHeatmap(pair, heatmap, opts = {}){

  const width =
    opts.width ?? 420

  const height =
    opts.height ?? 140

  const pad =
    opts.pad ?? 12

  const barWidth =
    opts.barWidth ?? 16

  const opacity =
    opts.opacity ?? 0.14

  const jitter =
    opts.jitter ?? 0

  const svg =
    document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    )

  svg.setAttribute("width", width)
  svg.setAttribute("height", height)

  svg.classList.add("market-chart")

  const {
    minRate,
    maxRate,
    maxVolume
  } = heatmap.stats

  const chartW =
    width - (pad * 2)

  const chartH =
    height - (pad * 2)

  heatmap.rows.forEach(row => {

    const rate =
      row.displayRate

    const volume =
      row.displayBaseAmount

    const x =
      pad +
      (
        (rate - minRate)
        / (maxRate - minRate || 1)
      ) * chartW

    const h =
      (
        volume / (maxVolume || 1)
      ) * chartH

    const y =
      height - pad - h

    const rect =
      document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      )

    const jitterX =
      jitter
        ? (Math.random() - 0.5) * jitter
        : 0

    rect.setAttribute(
      "x",
      x - (barWidth / 2) + jitterX
    )

    rect.setAttribute("y", y)

    rect.setAttribute(
      "width",
      barWidth
    )

    rect.setAttribute(
      "height",
      h
    )

    rect.setAttribute(
      "fill",
      row.side === "buy"
        ? "#2ecc71"
        : "#e74c3c"
    )

    rect.setAttribute(
      "fill-opacity",
      opacity
    )

    rect.dataset.rate = rate
    rect.dataset.volume = volume
    rect.dataset.orderId = row.orderId

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
        `#${row.orderId} ` +
        `${row.side} ` +
        `${row.displayBaseAmount} ` +
        `@ ${row.displayRate}`
      )
      })
      .join(" | ")

    row.textContent =
      `${pair} (${rows.length}) ${summary}`

    el.appendChild(row)

    const heatmap =
      buildHeatmap(rows)

    const chart =
      renderMarketHeatmap(
        pair,
        heatmap,
        {

          opacity: 0.16,

          // set 0 to disable
          jitter: 10,

          barWidth: 16
        }
      )
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
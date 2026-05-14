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

        const amount =
          row.displayBaseAmount

        const rate =
          row.displayRate

        return (
          `${row.side} ` +
          `${amount} ` +
          `@ ${rate}`
        )
      })
      .join(" | ")

    row.textContent =
      `${pair} (${rows.length}) ${summary}`
      
    el.appendChild(row)
  })
}
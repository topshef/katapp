function getSimpleFxMarkets(){

  const grouped = {}

  getAllOrders().forEach(orderRec => {

    const enriched = enrichOrder(orderRec.order)

    const market = enriched.market

    if(!market) return
    if(market.type !== "simple-fx") return

    grouped[market.pair] ||= []

    grouped[market.pair].push({
      orderId: orderRec.orderId,
      playerId: orderRec.playerId,
      ...market
    })
  })

  return grouped
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

    row.textContent =
      `${pair} (${rows.length})`

    el.appendChild(row)
  })
}
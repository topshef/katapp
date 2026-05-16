
/*
========================================
KATOMIA MARKET ENGINE
========================================

Pure market logic only.

Allowed:
- derive markets
- classify orders
- calculate rates
- estimate fills
- build books

Forbidden:
- DOM
- rendering
- websocket
- prompts
- alerts
- CSS
*/


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

  // const displayBaseAmount =
    // market.baseAmount / (10 ** baseDecimals)

  const settled =
    getSettledOrderFillRatio(orderId)

  const remainingRatio =
    1 - (settled.numerator / settled.denominator)

  const displayBaseAmount =
    (market.baseAmount * remainingRatio)
    / (10 ** baseDecimals)

  const originalDisplayBaseAmount =
    market.baseAmount
    / (10 ** baseDecimals)

  const displayQuoteAmount =
    market.quoteAmount / (10 ** quoteDecimals)

  const rawRate =
    market.quoteAmount / market.baseAmount

  // decimal-correct human rate
  const displayRate = displayQuoteAmount / originalDisplayBaseAmount
      

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
    originalDisplayBaseAmount,

    rawRate,
    displayRate
  }
}

function buildMarketStats(rows){

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


// ┌┬┐┌─┐┬┌─┌─┐┬─┐       ┌─┐┬┌┬┐┌─┐┬  ┌─┐  ╔═╗═╗ ╦
//  │ ├─┤├┴┐├┤ ├┬┘  ───  └─┐││││├─┘│  ├┤   ╠╣ ╔╩╦╝
//  ┴ ┴ ┴┴ ┴└─┘┴└─       └─┘┴┴ ┴┴  ┴─┘└─┘  ╚  ╩ ╚═
// taker - simple FX

function estimateMarketTrade({
  pair,
  fillerAccountId,
  volume,
  limitRate,
  liquidityMode = "ignoreKpool"
  // "ignoreKpool"     // current behaviour
  // "includeKpool"    // subtract pending liquidity too  
}){

  const markets = getSimpleFxMarkets()
  const rows = [...(markets[pair] || [])]

  const side =
    volume > 0
      ? "buy"
      : "sell"

  const targetVolume =
    Math.abs(volume)

  const compatible =
    rows.filter(row => {

      if(side === "buy"){

        return (
          row.side === "sell" &&
          row.displayRate <= limitRate
        )
      }

      return (
        row.side === "buy" &&
        row.displayRate >= limitRate
      )
    })

  compatible.sort((a, b) => {

    if(side === "buy")
      return a.displayRate - b.displayRate

    return b.displayRate - a.displayRate
  })

  let remaining = targetVolume

  const fills = []

  compatible.forEach(row => {

    if(remaining <= 0) return



    let available =
      row.displayBaseAmount

    if(liquidityMode === "includeKpool"){

      const pending =
        getPendingOrderFillRatio(
          row.orderId
        )

      const pendingRatio =
        pending.numerator /
        pending.denominator

      available -=
        row.originalDisplayBaseAmount *
        pendingRatio
    }

    available =
      Math.max(
        0,
        available
      )




    if(available <= 0) return

    const used =
      Math.min(
        available,
        remaining
      )

    remaining -= used

    // fill ratio must be against ORIGINAL order size
    const ratio =
      used /
      row.originalDisplayBaseAmount


    fills.push({
      orderId: row.orderId,
      side: row.side,
      rate: row.displayRate,
      amount: used,
      numerator: Math.round(ratio * 1000000),
      denominator: 1000000
    })

  })

  const matchedVolume =
    fills.reduce((a, x) => a + x.amount, 0)

  const totalQuote =
    fills.reduce((a, x) => {
      return a + (x.amount * x.rate)
    }, 0)

  const effectiveRate =
    matchedVolume
      ? totalQuote / matchedVolume
      : 0

  return {
    pair,
    side,
    requestedVolume: targetVolume,
    matchedVolume,
    remainingVolume: remaining,
    effectiveRate,
    fills
  }
}



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
    if(!enrichedRow){
      console.error('HJ39246 enrichedRow null — skipping', {orderId: orderRec.orderId, market})
      return
    }
    grouped[market.pair].push(enrichedRow)

  })

  return grouped
}


function enrichSimpleFxMarketRow({ orderId, playerId, market }){

  const baseMeta = getAssetMeta(market.baseAsset)
  const quoteMeta = getAssetMeta(market.quoteAsset)

  const pair = getAcceptedPairs().find(p =>
    p.base === market.baseAsset && p.quote === market.quoteAsset
  )

  if(!pair){
    console.error('HJ39246 pair not found in allowedPairs', {baseAsset: market.baseAsset, quoteAsset: market.quoteAsset, orderId})
    alert(`HJ39246 pair not found for order ${orderId} — ${market.baseAsset}/${market.quoteAsset}`)
    return null
  }

  const baseDecimals = pair.baseDecimals
  const quoteDecimals = pair.quoteDecimals
        
  // const displayBaseAmount =
    // market.baseAmount / (10 ** baseDecimals)

  const settled = getSettledOrderFillRatio(orderId)
  const pending = getPendingOrderFillRatio(orderId)

  const remainingRatio = Math.max(
    0,
    1 -
    (settled.numerator / settled.denominator) -
    (pending.numerator / pending.denominator)
  )

  const remainingRawBaseAmount =
    Math.round(market.baseAmount * remainingRatio)

  const displayBaseAmount =
    remainingRawBaseAmount / (10 ** baseDecimals)

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
    
    accountId: market.accountId,


    baseAsset: market.baseAsset,
    quoteAsset: market.quoteAsset,

    rawBaseAmount: market.baseAmount,
    rawRemainingBaseAmount: remainingRawBaseAmount,
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

  const pairData = getAcceptedPairs().find(p => p.label === pair)

  if(!pairData){
    console.error('HJ39246 estimateMarketTrade pair not found', {pair})
    alert(`HJ39246 estimateMarketTrade: pair not found — ${pair}`)
    return { pair, side, requestedVolume: targetVolume, matchedVolume: 0, remainingVolume: targetVolume, effectiveRate: 0, fills: [] }
  }

  const baseDecimals = pairData.baseDecimals
    
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

    const usedRaw =
      Math.round(
        used *
        (10 ** baseDecimals)
      )

    const reduced =
      reduceFraction(
        usedRaw,
        row.rawBaseAmount
      )

    fills.push({
      orderId: row.orderId,
      side: row.side,
      rate: row.displayRate,
      amount: used,
      numerator: reduced.numerator,
      denominator: reduced.denominator
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


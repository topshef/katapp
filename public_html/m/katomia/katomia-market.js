
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



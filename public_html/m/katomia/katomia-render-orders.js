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

function makeSpan(cls, text){
  const el = document.createElement("span")
  el.className = cls
  el.textContent = text
  return el
}

// ── Order type icons ──────────────────────────────────────────────────────────
// Inline SVG lookup keyed by order type. Swap these out for polished icons later
// (e.g. custom SVG sprite). All are stroke-only / currentColor so they inherit
// surrounding text colour without conveying status meaning via colour.
const ORDER_TYPE_ICONS = {
  'simple-ft': `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-label="FT swap">
    <path d="M1 4h10M8.5 2 13 4 8.5 6"/><path d="M13 10H3M5.5 8 1 10l4.5 2"/>
  </svg>`,
  'basket-ft': `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-label="Basket FT">
    <rect x="1.5" y="1.5" width="4" height="4" rx="0.5"/><rect x="8.5" y="1.5" width="4" height="4" rx="0.5"/>
    <rect x="1.5" y="8.5" width="4" height="4" rx="0.5"/><rect x="8.5" y="8.5" width="4" height="4" rx="0.5"/>
  </svg>`,
  'simple-nft': `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-label="NFT">
    <polygon points="7,1 13,5 7,13 1,5"/>
    <polyline points="1,5 7,7 13,5"/><line x1="7" y1="7" x2="7" y2="13"/>
  </svg>`,
  'simple-collectible': `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-label="Collectible">
    <polygon points="7,1 13,5 7,13 1,5"/>
    <polyline points="1,5 7,7 13,5"/><line x1="7" y1="7" x2="7" y2="13"/>
  </svg>`,
  'simple-le': `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-label="Limited Edition">
    <path d="M1.5 3.5 L7 1.5 L12.5 3.5 L12.5 10.5 L7 12.5 L1.5 10.5 Z"/>
    <circle cx="9.5" cy="4.5" r="1" fill="currentColor" stroke="none"/>
  </svg>`,
  'generic': `<svg viewBox="0 0 14 14" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-label="Generic bundle">
    <line x1="2" y1="4" x2="12" y2="4"/><line x1="2" y1="7" x2="10" y2="7"/><line x1="2" y1="10" x2="8" y2="10"/>
  </svg>`,
}

function orderTypeIconEl(type){
  const svg = ORDER_TYPE_ICONS[type] || ORDER_TYPE_ICONS['generic']
  const span = document.createElement('span')
  span.className = 'order-type-icon'
  span.title = type || 'generic'
  span.innerHTML = svg
  return span
}

function formatRelativeTime(ms){
  const diff = Date.now() - ms
  if(diff < 60000) return "just now"
  if(diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if(diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function getTifIcon(tif){
  return { GTC:"♾️", GTD:"📅", IOC:"⚡", FOK:"🎯" }[tif] || tif || "GTC"
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
      // TIDY-LINKS1: the external signing page is served by this site now (SIGNPAGE-STATIC1);
      // swap.kpay.live was the pre-migration host and is no longer ours
      : `/m/sign/?network=${encodeURIComponent(network)}&txid=${encodeURIComponent(tx.txid)}&pch=${encodeURIComponent(tx.pch || "")}`
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
const HEDERA_FEE_ACCOUNTS = new Set(["0.0.98","0.0.800","0.0.801","0.0.802"])

function createTxAssets(tx, orderType){
  const basis = tx.pchbasis?.transfers || {}
  const nftTransfers  = basis.nftTransfers || []
  const ftTransfers   = [
    ...(basis.tokenTransfers || []),
    ...(basis.hbarTransfers  || []).map(x => ({...x, tokenId:"HBAR"}))
  ]

  if(nftTransfers.length){
    const tradeFt = ftTransfers.filter(x => !HEDERA_FEE_ACCOUNTS.has(x.accountId))
    return createNftTxAssets(nftTransfers, tradeFt)
  }

  if(orderType === "simple-ft" || orderType === "simple-le"){
    const tradeFt = ftTransfers.filter(x => !HEDERA_FEE_ACCOUNTS.has(x.accountId))
    return createSimpleFxTxAssets(tradeFt)
  }

  return createGenericTxAssets(ftTransfers)
}

function createGenericTxAssets(transfers){

  // ORDER-UIPASS1: same swap-line treatment as simple fx — one line per
  // account groups a basket tx's legs by who, instead of a chip soup.
  const grouped = {}
  transfers.filter(x => !HEDERA_FEE_ACCOUNTS.has(x.accountId)).forEach(x => {
    (grouped[x.accountId] ||= { neg: [], pos: [] })[x.amount < 0 ? "neg" : "pos"]
      .push(getAssetDisplay(x.tokenId, Math.abs(x.amount)))
  })
  if(Object.keys(grouped).length){
    const el = document.createElement("div")
    el.className = "tx-assets tx-assets--lines"
    Object.entries(grouped).forEach(([accountId, v]) =>
      el.appendChild(makeTxSwapLine(accountId,
        v.neg.length ? "−" + v.neg.join(", ") : "",
        v.pos.length ? "+" + v.pos.join(", ") : "")))
    return el
  }

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


// NFT transaction: one NFT transfer (tokenId#serial) + currency side (FT/HBAR)
function createNftTxAssets(nftTransfers, ftTransfers){
  const el = document.createElement("span")
  el.className = "tx-assets"

  for(const nft of nftTransfers){
    const sender   = nft.sender   || nft.senderAccountId   || "?"
    const receiver = nft.receiver || nft.receiverAccountId || "?"
    const serial   = nft.serialNumber ?? nft.serial ?? "?"
    const tokenId  = nft.tokenId || ""
    const assetId  = `${tokenId}#${serial}`

    const nftChip = makeAssetEl({
      text: `${sender} ${getAssetDisplay(assetId, 1)}`,
      assetId,
      ownerAccountId: sender,
      clickable: false
    })
    nftChip.classList.add("tx-nft-chip")
    el.appendChild(nftChip)
  }

  // Currency side: show positive transfers (what the buyer pays to the seller)
  const received = ftTransfers.filter(x => x.amount > 0)
  if(received.length){
    const arrow = document.createElement("span")
    arrow.className = "tx-arrow"
    arrow.textContent = " → "
    el.appendChild(arrow)

    received.forEach(x => {
      const chip = makeAssetEl({
        text: `${x.accountId} ${getAssetDisplay(x.tokenId, Math.abs(x.amount))}`,
        assetId: x.tokenId,
        ownerAccountId: x.accountId,
        clickable: false
      })
      chip.classList.add("tx-fx-chip")
      el.appendChild(chip)
    })
  }

  return el
}


// ORDER-UIPASS1 slice 1: swap LINES, not prose chips — per account (full id,
// never shortened): id · −gives (red) ⇄ +gets (green). Amounts in tabular
// numerals; the account span carries data-owner-account for the 💠/△ overlay.
function makeTxSwapLine(accountId, gives, gets){
  const line = document.createElement("div")
  line.className = "tx-swapline"
  const acct = makeSpan("tx-acct num", accountId)
  acct.dataset.ownerAccount = accountId
  line.appendChild(acct)
  const giveEl = makeSpan("tx-give num", gives)
  const arrow = makeSpan("tx-swaparrow", "⇄")
  const getEl = makeSpan("tx-get num", gets)
  line.append(giveEl, arrow, getEl)
  return line
}

function createSimpleFxTxAssets(transfers){

  const el = document.createElement("div")
  el.className = "tx-assets tx-assets--lines"

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
    const neg = v.neg.map(x => getAssetDisplay(x.tokenId, x.amount)).join(", ")
    const pos = v.pos.map(x => getAssetDisplay(x.tokenId, x.amount)).join(", ")
    el.appendChild(makeTxSwapLine(accountId, neg ? "−" + neg : "", pos ? "+" + pos : ""))
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
  if((basis.nftTransfers || []).length) return "simple-nft"
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

// ORDER-UIPASS1: effective rate actually paid — quote received / base received
// across the tx's non-fee transfers, oriented by the pair the main order trades.
// The number a trader otherwise computes in their head from the swap line.
function txAssetDecimals(tokenId){
  return String(tokenId).toUpperCase() === "HBAR" ? 8
    : Number((typeof getAssetMeta === "function" && getAssetMeta(tokenId))?.token_class?.decimals || 0)
}
function computeTxRate(tx){
  const pairLabel = getTxPair(tx)
  if(!pairLabel) return null
  const p = (typeof getAcceptedPairs === "function" ? getAcceptedPairs() : [])
    .find(x => x.label === pairLabel || `${x.base}/${x.quote}` === pairLabel)
  if(!p) return null
  const b = tx.pchbasis?.transfers || {}
  const fts = [...(b.tokenTransfers || []), ...(b.hbarTransfers || []).map(x => ({ ...x, tokenId: "HBAR" }))]
    .filter(x => !HEDERA_FEE_ACCOUNTS.has(x.accountId))
  const sum = id => fts.filter(x => x.tokenId === id && x.amount > 0).reduce((t, x) => t + x.amount, 0)
    / (10 ** txAssetDecimals(id))
  const bv = sum(p.base), qv = sum(p.quote)
  return bv > 0 && qv > 0 ? qv / bv : null
}



function createTxRow(tx){

  const row = document.createElement("div")
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

  // kpay widget hook: clicking anywhere on the row (except the inner tx link,
  // which the embed leaves alone) opens the signing modal. Wired entirely by the
  // CDN-style kpay-embed.js script tag in game.php — no direct coupling here.
  if(tx.txid){
    row.dataset.kpayTxid    = tx.txid
    row.dataset.kpayNetwork = tx.network || tx.pchbasis?.network || "mainnet"
    if(tx.pch) row.dataset.kpayPch = tx.pch
  }

  const order = getTxMainOrder(tx)
  // Use stored orderType if available (set at creation for simple-nft/simple-le),
  // fall back to bundle-derived type then pchbasis heuristic.
  const orderType = order?.orderType || getOrderType(order) || getOrderTypeFromPchbasis(tx) || "generic"
  const market = enrichOrder(order)?.market
  const side = market?.side ? ` ${market.side}` : ""
  const sourceInfo = renderTxSourceInfo(tx)
  const sourceText = sourceInfo ? ` ${sourceInfo}` : ""

  row.dataset.orderSide = market?.side || ""

  // ── ORDER-UIPASS1 slice 1: hero row + swap lines ─────────────────────────────
  // row1: avatar · 💠 · type icon · lifecycle status chip (✍ auto-sign folded in
  //       as states of ONE vocabulary) · time right
  // row2+: one swap line per account — FULL account id (user: Hedera ids are
  //       short, never shorten), −gives ⇄ +gets, effective @rate right-aligned
  // nerd: full txid link (complete, per the user) + pch trailer as before
  const txMeta = getTxMeta(tx)
  const makerPubkey = order?.intentSignature?.pubkeyHex || null
  if(makerPubkey) row.dataset.kemojiKey = makerPubkey.slice(-12)

  const heroRow = document.createElement("div")
  heroRow.className = "tx-hero"
  if(typeof kemojiEl === "function" && makerPubkey)
    heroRow.appendChild(kemojiEl(makerPubkey, { size: 18 }))
  const txAuth = getTxContributorAuth(tx)
  if(txAuth.verifiedCount > 0) heroRow.appendChild(makeTxAuthBadge(txAuth))
  heroRow.appendChild(orderTypeIconEl(orderType))

  // lifecycle chip: settled > expired > auto-sign state > pending
  const autoState = _txAutoSign.get(tx.txid)
  const settled = isTxSuccessStatus(getTxStatus(tx))
  const chip = settled ? makeSpan("kchip kchip--ok", "settled ✓")
    : isTxExpired(tx) ? makeSpan("kchip kchip--fail", "expired ⌛")
    : autoState === "requesting" ? makeSpan("kchip kchip--req", "✍ signature requested…")
    : autoState === "signed" ? makeSpan("kchip kchip--ok", "✍ signed")
    : autoState === "failed" ? makeSpan("kchip kchip--fail", "✍ request failed — tap to sign")
    : makeSpan("kchip kchip--pend", "pending ⏳")
  heroRow.appendChild(chip)

  const rateInfo = computeTxRate(tx)
  if(rateInfo){
    const r = makeSpan("tx-rate num", "@" + formatRate(rateInfo))
    r.title = "Effective rate"
    heroRow.appendChild(r)
  }

  const txSeconds = getTxStartSeconds(tx)
  const timeEl = makeSpan("tx-time", "")
  if(txSeconds){
    timeEl.textContent = formatRelativeTime(txSeconds * 1000)
    timeEl.title = new Date(txSeconds * 1000).toISOString()
  }
  heroRow.appendChild(timeEl)
  row.appendChild(heroRow)

  const assetsEl = createTxAssets(tx, orderType)
  // ORDER-AUTHBADGE3: per-account overlay — contributor accounts (placed an
  // offer-side order) get 💠 verified / △ not; counterparties neither.
  if(txAuth.contributorCount > 0){
    assetsEl.querySelectorAll?.("[data-owner-account]")?.forEach(chip => {
      const a = chip.dataset.ownerAccount
      if(txAuth.verifiedAccts.has(a)){
        chip.classList.add("tx-asset-verified")
        chip.title = (chip.title ? chip.title + " · " : "") + "reputation-verified account"
      } else if(txAuth.contributorAccts.has(a)){
        chip.classList.add("tx-asset-unverified")
        chip.title = (chip.title ? chip.title + " · " : "") + "contributor — not reputation-verified"
      }
    })
  }
  row.appendChild(assetsEl)

  // ORDER-UIPASS1: the bare ❓ card (settled stub with no payload — flagged in
  // the design capture) renders as an honest muted one-liner instead of an
  // empty frame; the diag beacon below still fires so the data gap stays visible.
  if(!assetsEl.childElementCount && !settled){
    row.classList.add("tx-row--stub")
    const stub = makeSpan("tx-stub subtle", tx.txid ? "transaction — details unavailable" : "transaction record without payload")
    assetsEl.appendChild(stub)
  }

  // Nerd: FULL txid link + pch + type bracket (txid complete, per the user)
  const nerdEl = makeSpan("nerd-only tx-nerd-meta", "")
  nerdEl.innerHTML =
    `<a href="${txMeta.url}" target="_blank">${txMeta.txid}</a>` +
    ` &nbsp;pch#${txMeta.pch} [${orderType}${side}${sourceText}] `
  row.appendChild(nerdEl)

  // KAT-TXLIST1 diagnostic: settled txs sometimes render bare (no transfer chips),
  // reportedly only on testnet. Log WHY — once per txid — so we can see whether
  // pchbasis/transfers/order/bundles are missing in the data vs a render issue.
  try {
    const settled = isTxSuccessStatus(getTxStatus(tx))
    const bare = !assetsEl || !assetsEl.childElementCount
    window.__bareTxLogged ||= new Set()
    if (settled && bare && tx.txid && !window.__bareTxLogged.has(tx.txid)) {
      window.__bareTxLogged.add(tx.txid)
      const b = tx.pchbasis?.transfers || {}
      const send = (typeof katomiaDiagSend === "function") ? katomiaDiagSend : window.kdiag
      send?.("txrow:bare", {
        txid: tx.txid,
        network: tx.network || tx.pchbasis?.network || null,
        hasPchbasis: !!tx.pchbasis,
        tokenTransfers: (b.tokenTransfers || []).length,
        hbarTransfers: (b.hbarTransfers || []).length,
        nftTransfers: (b.nftTransfers || []).length,
        orderType,
        hasOrder: !!order,
        fills: (tx.source?.fills || []).length,
        bundleOrders: Object.keys(tx.source?.orders || {}).length
      })
    }
  } catch {}

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



// TXSTATUS-CONSOLIDATE1 S7: the tx's REAL validity window. Priority mirrors the
// board's (KATOMIA-VALIDDUR1 round 3): the backend-broadcast validDurationSeconds
// stamped on pending records by postCluster (the same number handed to
// setTransactionValidDuration), else the pchbasis decode. Returns null when
// neither is present (legacy stored records).
function getTxValidDurationSeconds(tx){
  if(tx?.validDurationSeconds) return Number(tx.validDurationSeconds)
  const d = tx?.pchbasis?.transactionValidDuration
  const s = typeof d === "object" ? Number(d?.seconds || 0) : Number(d || 0)
  return s || null
}

function isTxExpired(tx){

  if(isTxSuccessStatus(getTxStatus(tx))) return false

  const seconds = getTxStartSeconds(tx)
  if(!seconds) return false

  // S7: was a HARDCODED 2m30s client-clock guess vs the board's real 40s
  // window — the exact class of independently-guessed deadline ripped out of
  // the board on 2026-07-15 for disagreeing with the backend, still live here
  // and gating auto-sign (it would happily request a signature for a tx dead
  // for a minute and a half). Real window + 10s ingest grace (matches the
  // bundle's own S4 bound); 180s only as the ceiling for legacy records
  // that carry no duration at all.
  const durS = getTxValidDurationSeconds(tx) || 180

  return Date.now() - (seconds * 1000) > (durS + 10) * 1000

}




let _txRenderToken = 0

// Cap the rendered transactions list. The store is unbounded (IndexedDB) and the
// list unions stored history + live pending + settled stubs, so without a cap it
// grows without limit. Show the most-recent TX_LIST_MAX after filtering.
const TX_LIST_MAX = 50

// ── ORDER-AUTOSIGN1 (user 2026-08-05, the HashPack auto-approval era) ─────────
// A matched order already carries the trader's SIGNED INTENT — that intent is
// the justification for execution. So when a raised tx involves my wallet's
// active account, the signature request is PUSHED straight to the wallet
// (WC.signTx, headless): no pop-up here — the wallet app shows its own prompt
// (a separate window, never over the trading page), or approves silently if
// the user enabled the wallet's auto-approval, and P2P trades settle
// hands-free. QUIET by design: fires only when the WC session is already live
// on the right network with a party account active — it never opens pairing
// UI; the manual click-the-row path is unchanged. We can't ask HashPack
// whether auto-approval is on (not exposed over WC) — pushing is safe either
// way, worst case it's a normal wallet prompt. Preference: profile →
// "Auto-request signatures for matched orders" (katomiaAutoSignReq, absent =
// ON). Row shows the request state via the ✍ pill (createTxRow).
// Local hex/txRead helpers: katomia-board.js has twins but is not loaded on
// this (game.php) page — small dup over a new shared file (rapid-iteration).
const _txAutoSign = new Map()   // txid → "requesting" | "signed" | "failed"

// TXSTATUS-CONSOLIDATE1 S7: order mode's user-visible surface — auto-sign
// outcomes were kflow/kdiag-only ("a sixth surface that reports nothing to
// the user", plan §2 row 6). Signals route through the controller, so they
// inherit terminal dedup and the settle window; toast copy stays here.
window.katomiaTxStatus?.subscribe(ev => {
  if(ev.type === "advice" && ev.detail?.message)
    notify(ev.detail.message, ev.detail.level || "warning", { timeout: ev.detail.timeout ?? 6000, detail: ev.txid })
})
const orderReportAdvice = (txid, d) =>
  window.katomiaTxStatus
    ? window.katomiaTxStatus.report(txid, { source: "wallet", kind: "advice", detail: d })
    : notify(d.message, d.level || "warning", { timeout: d.timeout ?? 6000 })

function orderHexToBytes(hex){
  const out = new Uint8Array(hex.length / 2)
  for(let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

async function orderReadTxBytes(network, txid){
  const r = await fetch(`/future/?action=txRead&network=${encodeURIComponent(network)}&txid=${encodeURIComponent(txid)}`)
  let j = null
  try { j = JSON.parse(await r.text()) } catch {}
  const hex2 = j?.result?.hex2 ?? j?.hex2   // kpool wraps as {result:{hex2}} (KDIAG-TXBYTES2)
  return hex2 ? orderHexToBytes(hex2) : null
}

function txPartyAccounts(tx){
  const b = tx.pchbasis?.transfers
  if(!b) return new Set()
  return new Set([
    ...(b.tokenTransfers || []).map(x => x.accountId),
    ...(b.hbarTransfers || []).map(x => x.accountId),
    ...(b.nftTransfers || []).flatMap(t => [t.senderAccountId, t.receiverAccountId])
  ].filter(Boolean))
}

async function maybeAutoSignTx(tx){
  const txid = tx?.txid
  if(!txid || _txAutoSign.has(txid)) return
  if(isTxExpired(tx) || isTxSuccessStatus(getTxStatus(tx))) return
  const wc = window.WC
  if(!wc?.signTx) return
  const network = tx.network || tx.pchbasis?.network || gameMeta?.network || ""
  const party = txPartyAccounts(tx)
  if(!party.size) return
  const mine = new Set(getAccounts().filter(a => isMyAccount(a)).map(a => a.accountId || a.label))
  // claim the txid BEFORE any await — overlapping renderTransactions calls both
  // passed the has() check during the wc awaits and double-fired the request
  // (seen live 2026-08-05 18:46, two order:autosign:error 70ms apart). Quiet
  // ineligible paths release the claim so a later eligible state can retry.
  _txAutoSign.set(txid, "checking")
  let active = null
  try {
    const liveNet = await wc.ensureNetwork?.()   // no-arg: reads, never rebuilds
    if(network && liveNet !== network){ _txAutoSign.delete(txid); return }
    active = await wc.getAccount?.()
  } catch { _txAutoSign.delete(txid); return }
  if(!active || !party.has(active) || !mine.has(active)){ _txAutoSign.delete(txid); return }
  // R2 frontend sanity gate (user 2026-08-05: "the backend's doing the checks,
  // but we should do the checks on the frontend as well"): every contributing
  // order must at least CARRY an intent signature. Deep re-verification here —
  // and whether reputation-verified 💠 should be REQUIRED before auto-signing —
  // is an open question on ORDER-AUTOSIGN1; the auth ratio rides the kflow
  // event so that call can be made from data.
  const _orders = tx.source?.orders || {}
  const _oids = getTxOrderIds(tx)
  if(!_oids.length || _oids.some(oid => !_orders[oid]?.intentSignature?.pubkeyHex)){
    try { window.kflow?.("order:autosign", "skip-unsigned-intent", { txid }) } catch {}
    return
  }
  let _auth = null
  try { const a = getTxContributorAuth(tx); _auth = { verified: a.verifiedAccts?.size ?? a.verifiedCount, contributors: a.contributorAccts?.size } } catch {}
  _txAutoSign.set(txid, "requesting")
  try { window.kflow?.("order:autosign", "request", { txid, account: active, auth: _auth }) } catch {}
  renderTransactions()
  // S7: register with the controller — real expiry (validStart+duration) for
  // watch, and an attempt whose abort cancels the in-flight KWC request on
  // supersede/terminal (rule 4, same shape as the board path).
  const _vsSec = getTxStartSeconds(tx)
  window.katomiaTxStatus?.watch(txid, { network,
    expiry: _vsSec && getTxValidDurationSeconds(tx) ? (_vsSec + getTxValidDurationSeconds(tx)) * 1000 : null })
  const _attemptId = window.katomiaTxStatus?.attempt(txid, { accountId: active,
    abort: () => { try { wc.cancelInFlight?.({ label: `signTx:${active}`, reason: "superseded or terminal" }) } catch {} } })
  try {
    let bytes = tx.txhex ? orderHexToBytes(tx.txhex) : null
    if(!bytes) bytes = await orderReadTxBytes(network, txid)
    if(!bytes) throw new Error("transaction bytes unavailable")
    const { signedTransactionHex } = await wc.signTx({ accountId: active, transactionBytes: bytes })
    // S7 / SIGN-DEADTX1 item 1: expiry was only checked at ENTRY; the WC
    // round-trip can outlive the window, and saving a signature for a dead tx
    // reports "signed" for something that can never land. The S4 bundle bound
    // makes a very late return rare; this closes the boundary case.
    if(isTxExpired(tx)) throw new Error("expired during wallet round-trip — signature not saved")
    const save = await fetch("/future/?action=txSave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network, comment: "order auto-sign",
        response: { signedTransaction: Array.from(orderHexToBytes(signedTransactionHex)) } })
    })
    if(!save.ok) throw new Error(`signature save failed (${save.status})`)
    _txAutoSign.set(txid, "signed")
    try { window.kflow?.("order:autosign", "signed", { txid, account: active }) } catch {}
    orderReportAdvice(txid, { message: `✍ Order matched — signed as ${active}`, level: "success", timeout: 5000 })
  } catch(e){
    _txAutoSign.set(txid, "failed")
    try { window.kflow?.("order:autosign", "fail", { txid, error: String(e?.message || e) }) } catch {}
    try { katomiaDiagSend?.("order:autosign:error", { txid, error: String(e?.message || e) }) } catch {}
    // S4/S7: cancelled = superseded/terminal, deliberate silence
    const _em = String(e?.message || e)
    if(!/^KWC-CANCELLED/.test(_em))
      orderReportAdvice(txid, { message: /^KWC-/.test(_em) ? "⚠ " + _em.replace(/^KWC-[A-Z-]+: /, "") : `Order auto-sign failed: ${_em}`, level: "error", timeout: 10000 })
  } finally {
    if(_attemptId) window.katomiaTxStatus?.attemptDone(_attemptId)
  }
  renderTransactions()
}

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

  // ORDER-UIPASS1 slice 2: per-pair trade stats feed the market header — txs is
  // newest-first, so the first settled rate seen is "last" and the running
  // assignment leaves "first" at the session's oldest. Header re-renders after.
  const stats = {}
  for(const tx of txs){
    if(!isTxSuccessStatus(getTxStatus(tx))) continue
    const pair = getTxPair(tx)
    if(!pair) continue
    const rate = computeTxRate(tx)
    if(!rate) continue
    const s = (stats[pair] ||= { count: 0 })
    s.count++
    if(s.last === undefined) s.last = rate
    s.first = rate
  }
  const statsChanged = JSON.stringify(stats) !== JSON.stringify(window.__ktxStats || {})
  window.__ktxStats = stats
  if(statsChanged && typeof renderOrderMarketSummary === "function") renderOrderMarketSummary()

  // ORDER-AUTOSIGN1: push signature requests for fresh matched txs — order
  // mode only, pref-gated, quiet (see maybeAutoSignTx). Fire-and-forget.
  // R2 fix (user 2026-08-05, "auto sign not working"): the mode value is
  // "orderBook" (the only order value the backend ever writes) — the v1 gate
  // checked "order" and never matched, so the hook never fired at all.
  if(gameMeta?.config?.tradingMode === "orderBook" && localStorage.getItem("katomiaAutoSignReq") !== "0")
    visible.forEach(tx => { maybeAutoSignTx(tx) })

}


let _chatPositioned = false

function positionChatPanel(){
  if(window.innerWidth <= 899){ _chatPositioned = false; return }
  const panel = document.getElementById("chatSection")
  const anchor = document.querySelector(".game-layout")
  if(!panel || !anchor) return

  // measure where .game-layout naturally sits in the page at current scroll
  const top = Math.round(anchor.getBoundingClientRect().top + window.scrollY)
  if(top <= 0) return  // not laid out yet

  const bodyMarginBottom = 16
  const h = window.innerHeight - top - bodyMarginBottom
  if(h < 80) return  // layout not ready

  panel.style.top = top + "px"
  panel.style.height = h + "px"

  const summary = panel.querySelector("summary")
  const list = panel.querySelector(".chat-list")
  if(list) list.style.height = (h - (summary?.offsetHeight || 36)) + "px"

  wireChatWidthDrag(panel)
  panel.classList.add("chat-ready")
  _chatPositioned = true
}
restoreChatWidth()

window.addEventListener("resize", () => { _chatPositioned = false; positionChatPanel() })

// ORDER-CHATWHO1 helpers. The player's own name comes from live state (a message
// carries the name at send time; a later rename would otherwise stick), and the account
// is the one this player registered in the circle — the same "playerId:accountId" keys
// katomia-chat.js reads. 🔷/△ only mean something where a binding does, so the mark is
// gated to the real networks exactly as the board's log gates it.
function escapeHtml(v){
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]))
}
function chatPlayerName(playerId){
  return state?.players?.[playerId]?.name || null
}
function chatAccountOf(playerId){
  if(!playerId) return null
  const entry = Object.entries(state?.accounts || {})
    .find(([key]) => key.split(":")[0] === playerId)
  if(!entry) return null
  const acct = entry[1] || {}
  const label = acct.label || acct.accountId || entry[0].split(":")[1]
  if(!label) return null
  const net = gameMeta?.network
  const marked = net === "testnet" || net === "mainnet"
  return {
    label,
    title: `account ${label}`,
    mark: marked ? (acct.authBound ? "🔷" : "△") : "",
    markTitle: acct.authBound ? "Reputation-bound & verified" : "No verified binding"
  }
}

// ORDER-CHATSIDE1: the panel's width is the user's to set — grab the left edge and drag.
// Shared storage key with the board's dock (katomia-chat.js) so one choice covers both
// modes, and written to the --kchat-side-w var the layout padding also reads.
const CHAT_W_KEY = "katomiaChatSplitW"
const chatWLimits = () => ({ min: 170, max: Math.max(220, Math.round(window.innerWidth * 0.5)) })
function applyChatWidth(px){
  const lim = chatWLimits()
  const w = Math.max(lim.min, Math.min(lim.max, Math.round(px)))
  document.documentElement.style.setProperty("--kchat-side-w", w + "px")
  return w
}
function restoreChatWidth(){
  let saved = 0
  try { saved = +(localStorage.getItem(CHAT_W_KEY) || 0) } catch {}
  if(saved) applyChatWidth(saved)
}
function wireChatWidthDrag(panel){
  if(!panel || panel.querySelector(".chat-wdrag")) return
  const bar = document.createElement("div")
  bar.className = "chat-wdrag"
  bar.title = "Drag to resize messages"
  bar.addEventListener("pointerdown", e => {
    e.preventDefault()
    bar.setPointerCapture?.(e.pointerId)
    const startX = e.clientX
    const startW = panel.getBoundingClientRect().width
    document.body.classList.add("chat-wdragging")
    const move = ev => applyChatWidth(startW + (startX - ev.clientX))
    const up = () => {
      bar.removeEventListener("pointermove", move)
      bar.removeEventListener("pointerup", up)
      bar.removeEventListener("pointercancel", up)
      document.body.classList.remove("chat-wdragging")
      const w = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--kchat-side-w")) || startW
      try { localStorage.setItem(CHAT_W_KEY, String(Math.round(w))) } catch {}
      _chatPositioned = false
      positionChatPanel()
    }
    bar.addEventListener("pointermove", move)
    bar.addEventListener("pointerup", up)
    bar.addEventListener("pointercancel", up)
  })
  panel.appendChild(bar)
}

function renderChat(){
  const listEl = document.querySelector("#chatSection .chat-list")
  if(!listEl) return

  if(!_chatPositioned) positionChatPanel()

  const CHAT_DISPLAY_MAX = 50
  const msgs = (state?.chat || []).slice(-CHAT_DISPLAY_MAX)
  const frag = document.createDocumentFragment()

  msgs.forEach(msg => {
    const row = document.createElement("div")
    // ORDER-CHATWHO1 (user 2026-09-04): the backend's own lines carry system:true and NO
    // player at all (katomia.js pushes {system:true, text}), so "playerName || playerId"
    // printed the word "undefined" on every strike/verdict/open line. Two kinds of row now:
    // the house speaking, and a player — the latter named with its account and the same
    // 🔷 bound / △ unbound mark the proposal-mode log uses (katomia-chat.js verifyMark).
    const isSys = !!msg.system || !msg.playerId
    row.className = "chat-msg" + (isSys ? " chat-msg--sys" : "")

    if(isSys){
      const mark = document.createElement("span")
      mark.className = "chat-sysmark"
      mark.textContent = "◍"                      // the brand ring, as a glyph
      mark.title = "Katomia"
      row.appendChild(mark)
    } else if(typeof kemojiEl === "function"){
      row.appendChild(kemojiEl(msg.playerId, { size: 20, isSelf: msg.playerId === currentPlayerId }))
    }

    const body = document.createElement("div")
    body.className = "chat-body"

    const meta = document.createElement("div")
    meta.className = "chat-meta"
    const who = isSys ? "Katomia" : (msg.playerName || chatPlayerName(msg.playerId) || msg.playerId)
    const acct = isSys ? null : chatAccountOf(msg.playerId)
    meta.innerHTML =
      `<span class="chat-who">${escapeHtml(who)}</span>` +
      (acct ? `<span class="chat-acct" title="${escapeHtml(acct.title)}">${escapeHtml(acct.label)}</span>` +
              (acct.mark ? `<span class="chat-verify" title="${escapeHtml(acct.markTitle)}">${acct.mark}</span>` : "") : "") +
      `<span class="chat-time" title="${new Date(msg.ts).toLocaleTimeString()}">${formatRelativeTime(msg.ts)}</span>`

    const text = document.createElement("div")
    text.className = "chat-text"
    text.textContent = msg.text

    body.appendChild(meta)
    body.appendChild(text)
    row.appendChild(body)
    frag.appendChild(row)
  })

  const atBottom = listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 40
  listEl.replaceChildren(frag)
  if(atBottom) listEl.scrollTop = listEl.scrollHeight
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

// KAT-CHARTSETTLED1: the settled-fill stack below the baseline reads as noise to
// a newcomer expecting a plain order book — default OFF, revealed by a nerd-mode
// pref. Own localStorage key (per browser), not a board pref: order pages have no
// settings surface of their own yet, so the nerd row appended after the chart
// legend is deliberately the order page's settings home — future simplification
// experiments gate there too.
const chartSettledOn = () => { try { return localStorage.getItem("katomiaChartSettled") === "1" } catch { return false } }

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

  // settled stack lives below the baseline — only reserve that space when shown
  // (+4 keeps the axis-label row, drawn at height - pad + 14 with pad 12)
  const showSettled = chartSettledOn()
  svg.setAttribute("height",showSettled ? height + chartH + 4 : height + 4)
  renderHeatmapGrid(svg,width,height,pad)

  // ORDER-UIPASS1 slice 3: RATE AXIS labels — the x axis is price (this chart is
  // the order book over rate, not time); min/mid/max anchor it. SVG text via NS.
  const NS = "http://www.w3.org/2000/svg"
  // axis ticks stay short — computed midpoints carry float noise formatRate
  // passes through (seen live: "1.33951569064" on the axis)
  const shortRate = v => { const s = String(formatRate(v)); return s.length > 8 ? Number(v).toPrecision(4) : s }
  const axisLabel = (x, txt, anchor) => {
    const t = document.createElementNS(NS, "text")
    t.setAttribute("x", x); t.setAttribute("y", height - pad + 14)
    t.setAttribute("class", "market-axis-label")
    t.setAttribute("text-anchor", anchor)
    t.textContent = txt
    svg.appendChild(t)
  }
  if(isFinite(minRate) && isFinite(maxRate)){
    axisLabel(pad, shortRate(minRate), "start")
    if(maxRate > minRate){
      axisLabel(pad + chartW / 2, shortRate((minRate + maxRate) / 2), "middle")
      axisLabel(pad + chartW, shortRate(maxRate), "end")
    }
  }

  // last-trade price line (from the tx stats the header uses) — dashed vertical
  const last = window.__ktxStats?.[pair]?.last
  if(last && maxRate > minRate && last >= minRate && last <= maxRate){
    const lx = pad + ((last - minRate) / (maxRate - minRate)) * chartW
    const line = createHeatmapLine(lx, pad, lx, height - pad, {
      stroke: "#4a6fb5", "stroke-width": "1", "stroke-dasharray": "3 3", "stroke-opacity": "0.75"
    })
    svg.appendChild(line)
    const t = document.createElementNS(NS, "text")
    t.setAttribute("x", Math.min(lx + 3, width - pad - 30)); t.setAttribute("y", pad + 9)
    t.setAttribute("class", "market-axis-label market-lastline-label")
    t.textContent = "last " + formatRate(last)
    svg.appendChild(t)
  }

  heatmap.rows.forEach(row => {
    const layout = getHeatmapLayout(row,{minRate,maxRate,maxVolume,chartW,chartH,height,pad,barWidth,jitter})
    renderHeatmapBar(svg,row,layout,opacity)
    renderHeatmapFillLines(svg,row,layout)
    renderPendingFillStack(svg,row,layout)
    if(showSettled) renderSettledFillStack(svg,row,layout)
    // slice 5: my-order marker — ▾ above my own bars, the overlay traders use
    if(row.playerId === currentPlayerId){
      const m = document.createElementNS(NS, "text")
      m.setAttribute("x", layout.x + barWidth / 2)
      m.setAttribute("y", Math.max(10, layout.originalY - 4))
      m.setAttribute("text-anchor", "middle")
      m.setAttribute("class", "market-mine-marker")
      m.textContent = "▾"
      const mt = document.createElementNS(NS, "title")
      mt.textContent = `your order #${row.orderId}`
      m.appendChild(mt)
      svg.appendChild(m)
    }
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

// ORDER-FILTERS1: the three order filters remember their state DELIBERATELY (one key,
// written on change, applied at load) instead of relying on the browser's form-state
// restore, which survives a reload invisibly and can leave the box disagreeing with the
// markup default. Restored before the first render so the first paint is already right.
const ORDER_FILTER_KEY = "katomiaOrderFilters"
const ORDER_FILTER_IDS = ["showMyOrdersOnly", "showPendingOrdersOnly", "sortOrdersByPrice"]
function saveOrderFilters(){
  const out = {}
  ORDER_FILTER_IDS.forEach(id => { const el = document.getElementById(id); if(el) out[id] = !!el.checked })
  try { localStorage.setItem(ORDER_FILTER_KEY, JSON.stringify(out)) } catch {}
}
function restoreOrderFilters(){
  let saved = null
  try { saved = JSON.parse(localStorage.getItem(ORDER_FILTER_KEY) || "null") } catch {}
  if(!saved) return
  ORDER_FILTER_IDS.forEach(id => {
    const el = document.getElementById(id)
    if(el && typeof saved[id] === "boolean") el.checked = saved[id]
  })
}
document.addEventListener("DOMContentLoaded", restoreOrderFilters)
if(document.readyState !== "loading") restoreOrderFilters()

document.addEventListener("change",e => {
  // Order controls only filter the ORDERS list (hideExpiredTx has its own handler
  // in game.php). The tx list is intentionally NOT filtered by "Only mine" — a
  // filled order is purged, so its settled tx can't be proven "mine" and would
  // wrongly disappear.
  if(ORDER_FILTER_IDS.includes(e.target.id)){
    saveOrderFilters()
    renderOrders()
  }
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
    ".orders-market-summary"   // ORDERS-LAYOUT1: now a top-level full-width chart section
  )

  if(!el) return

  el.innerHTML = ""

  const markets = getSimpleFxMarkets()

  const selectedPair = getSelectedPair()

  Object.entries(markets).forEach(([pair, rows]) => {

    if(selectedPair && pair != selectedPair)
      return

    // ── ORDER-UIPASS1 slice 2: market header strip ───────────────────────────
    // The anchor traders look for first: pair picker · last · session change ·
    // bid/ask · spread · trades · my open orders · ＋ New order. All client-side
    // (order rows here, trade stats cached by renderTransactions).
    const stats = window.__ktxStats?.[pair] || {}
    const buys = rows.filter(r => r.side === "buy").map(r => r.displayRate)
    const sells = rows.filter(r => r.side === "sell").map(r => r.displayRate)
    const bid = buys.length ? Math.max(...buys) : null
    const ask = sells.length ? Math.min(...sells) : null
    const spread = bid && ask && ask > 0 ? ((ask - bid) / ask) * 100 : null
    const myOpen = rows.filter(r => r.playerId === currentPlayerId).length
    const chg = stats.last && stats.first ? ((stats.last - stats.first) / stats.first) * 100 : null

    const hdr = document.createElement("div")
    hdr.className = "market-header"

    const pairSel = document.createElement("select")
    pairSel.className = "market-pair-select"
    const allPairs = Object.keys(markets)
    ;(allPairs.length ? allPairs : [pair]).forEach(pk => {
      const o = document.createElement("option")
      o.value = pk; o.textContent = pk; o.selected = pk === pair
      pairSel.appendChild(o)
    })
    pairSel.onchange = () => { location.search = "?pair=" + encodeURIComponent(pairSel.value) }
    hdr.appendChild(pairSel)

    const kv = (val, label, cls = "") => {
      const w = document.createElement("span")
      w.className = "market-kv " + cls
      const b = makeSpan("market-kv-val num", val)
      const l = makeSpan("market-kv-label", label)
      w.append(b, l)
      return w
    }
    if(stats.last) hdr.appendChild(kv(formatRate(stats.last), "last", "market-kv--last"))
    if(chg !== null && isFinite(chg))
      hdr.appendChild(kv((chg >= 0 ? "▲ +" : "▼ ") + chg.toFixed(1) + "%", "session", chg >= 0 ? "market-kv--up" : "market-kv--down"))
    if(bid !== null || ask !== null)
      hdr.appendChild(kv(`${bid !== null ? formatRate(bid) : "—"} / ${ask !== null ? formatRate(ask) : "—"}`, "bid / ask"))
    if(spread !== null && isFinite(spread) && spread >= 0)
      hdr.appendChild(kv(spread.toFixed(1) + "%", "spread"))
    hdr.appendChild(kv(String(stats.count || 0), "trades"))
    hdr.appendChild(kv(String(myOpen), "my orders"))

    const newBtn = document.createElement("button")
    newBtn.className = "market-neworder-btn"
    newBtn.textContent = "＋ New order"
    newBtn.onclick = () => openCreateOrderModal()
    hdr.appendChild(newBtn)
    hdr.appendChild(createTradeBtn(pair))   // debug-only "Take" keeps its home
    el.appendChild(hdr)


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

    // slice 3: two-line legend — every encoding on the chart, spelled out once
    // (the dashed originals were the "one unexplained encoding" complaint)
    const legend = document.createElement("div")
    legend.className = "market-legend subtle"
    legend.innerHTML =
      `<span><i class="mleg mleg-buy"></i>buy</span>` +
      `<span><i class="mleg mleg-sell"></i>sell</span>` +
      `<span><i class="mleg mleg-orig"></i>original size (outline) vs remaining (solid)</span>` +
      `<span><i class="mleg mleg-last"></i>last trade</span>` +
      `<span>▾ your orders</span>`
    el.appendChild(legend)

    // KAT-CHARTSETTLED1: order-page nerd settings home — a single gated row for
    // now (see chartSettledOn above); more rows join here, not a full panel
    const nerdRow = document.createElement("label")
    nerdRow.className = "nerd-only market-nerd-settings subtle"
    const settledCb = document.createElement("input")
    settledCb.type = "checkbox"
    settledCb.checked = chartSettledOn()
    settledCb.onchange = () => {
      try { settledCb.checked ? localStorage.setItem("katomiaChartSettled","1") : localStorage.removeItem("katomiaChartSettled") } catch {}
      renderOrderMarketSummary()
    }
    nerdRow.append(settledCb, document.createTextNode(" show settled fills on chart"))
    el.appendChild(nerdRow)
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

      // ORDER-UIPASS1 slice 5: price-sorted = LADDER density — cards compress
      // to one line each (CSS .orders-ladder) so the list scans like a book
      listEl.classList.toggle("orders-ladder", !!sortByPrice)

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

        return b.orderId - a.orderId   // newest first
      })



      const selectedPair = getSelectedPair()


      const myOnly = document.getElementById("showMyOrdersOnly")?.checked
      let inPair = 0, shown = 0, mineTotal = 0

      orders.forEach(orderRec => {

        const pair = enrichOrder(orderRec.order)?.market?.pair

        if(orderRec.playerId == currentPlayerId) mineTotal++

        if(selectedPair && pair != selectedPair)
          return

        inPair++

        if(myOnly && orderRec.playerId != currentPlayerId)
          return

        const fillStatus = getOrderFillStatus(orderRec.orderId)

        if(pendingOnly && fillStatus.fullySettled)
          return

        shown++
        listEl.appendChild(createOrderRow(orderRec))
      })

      // ORDER-FILTERS1: say out loud what the filters left on screen. A book that turns
      // over every few seconds gives no other way to tell a working filter from a broken
      // one — which is exactly how "only mine doesn't do anything" was read.
      const nEl = document.getElementById("myOrdersCount")
      if(nEl) nEl.textContent = mineTotal ? `(${mineTotal})` : ""
      const cEl = document.getElementById("orderFilterCount")
      if(cEl){
        const filters = [myOnly && "mine", pendingOnly && "pending"].filter(Boolean)
        cEl.textContent = filters.length
          ? `showing ${shown} of ${inPair} — filtered by ${filters.join(" + ")}`
          : `showing ${shown} order${shown === 1 ? "" : "s"}`
        cEl.title = mineTotal
          ? `${mineTotal} of these ${mineTotal === 1 ? "is" : "are"} yours`
          : "none of these are yours"
      }

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
    const type = enriched.market?.type || getOrderType(order) || ""
    const fullOrder = getAllOrders().find(x => String(x.orderId) === String(orderId))?.order
    const tifDefaults = { timeInForce: fullOrder?.timeInForce || "GTC", expiresAt: fullOrder?.expiresAt || null }

    if(type === "simple-ft"){
      const fxRow = enrichSimpleFxMarketRow({ orderId, playerId, market: enriched.market })
      if(!fxRow) return
      openCreateOrderModal({
        mode: "order", orderId, playerId, type: "simple-ft",
        pair:        `${fxRow.baseAsset}/${fxRow.quoteAsset}`,
        side:        fxRow.side,
        volume:      fxRow.originalDisplayBaseAmount,
        rate:        fxRow.displayRate,
        accountId:   `${playerId}:${fxRow.accountId}`,
        minFill:     fullOrder?.minFill || null,
        ...tifDefaults,
      })
      return
    }

    if(type === "simple-nft" || type === "simple-le"){
      const bundle = order?.bundle || []
      const collectibleLeg = bundle.find(x => { const t = getAssetType(x.asset, Math.abs(x.amount)); return t === "NFT" || t === "LE" })
      const currencyLeg = bundle.find(x => x !== collectibleLeg)
      if(!collectibleLeg || !currencyLeg) return

      const orderSide = collectibleLeg.amount < 0 ? "sell" : "buy"
      const asset = collectibleLeg.asset
      let token = asset, serial = ""
      if(asset.includes("#")){ [token, serial] = asset.split("#") }

      const currencyAsset = currencyLeg.asset
      const allPairs = getAcceptedPairs()
      const matchPair = allPairs.find(p => p.base === currencyAsset) || allPairs.find(p => p.quote === currencyAsset)
      const currDecimals = currencyAsset === "HBAR" ? 8
        : matchPair ? (matchPair.base === currencyAsset ? (matchPair.baseDecimals ?? 0) : (matchPair.quoteDecimals ?? 0))
        : Number(getAssetMeta?.(currencyAsset)?.token_class?.decimals || 0)
      const priceDisplay = Math.abs(currencyLeg.amount) / (10 ** currDecimals)

      const isOther = playerId !== currentPlayerId
      openCreateOrderModal({
        // Viewing another player's order: "Take" — flip side, no orderId context
        // Viewing own order: edit/replicate — keep same side
        mode:      isOther ? undefined  : "order",
        orderId:   isOther ? undefined  : orderId,
        playerId:  isOther ? undefined  : playerId,
        side:      isOther ? (orderSide === "sell" ? "buy" : "sell") : orderSide,
        accountId: isOther ? undefined  : `${playerId}:${collectibleLeg.accountId}`,
        type, token,
        serial: serial || undefined,
        qty: type === "simple-le" ? Math.abs(collectibleLeg.amount) : undefined,
        currency: currencyAsset,
        price: priceDisplay,
        ...tifDefaults,
      })
      return
    }
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

  const el = document.createElement("span")
  el.className = "order-prefix"

  // Type icon — always visible
  el.appendChild(orderTypeIconEl(orderType))

  // TIF icon — always visible
  const tif = order.timeInForce || "GTC"
  const tifEl = makeSpan("order-tif", " " + getTifIcon(tif))
  tifEl.title = tif
  el.appendChild(tifEl)

  // Relative time — sits right after the icons (mirrors the tx list, where time
  // follows the status icon rather than trailing the whole descriptive line).
  if(order.issuedAt){
    const timeEl = makeSpan("order-time", ` ${formatRelativeTime(order.issuedAt)}`)
    timeEl.title = new Date(order.issuedAt).toISOString()
    el.appendChild(timeEl)
  }

  // Nerd: full order type bracket
  el.appendChild(makeSpan("nerd-only order-nerd-type", ` [${orderType}]`))

  // Market label — always visible (rate, side, volume, pair)
  el.appendChild(makeSpan("order-market", ` ${marketLabel}`))

  // Nerd: minFill fraction
  if(order.minFill)
    el.appendChild(makeSpan("nerd-only order-nerd-minfill", ` min ${order.minFill.numerator}/${order.minFill.denominator}`))

  // Nerd: proposed fill (debug trading mode only)
  if(document.body.dataset.tradingMode == "debug")
    el.appendChild(makeSpan("nerd-only order-fill-debug", ` proposed ${fill.numerator}/${fill.denominator}`))

  // Pending kpool indicator — always visible (amber icon); detail nerd-only
  if(pendingText){
    const pEl = makeSpan("order-fill-pending", " ⏳")
    pEl.title = `Matching in progress: ${pendingText.replace(/ \|$/, "")}`
    el.appendChild(pEl)
    el.appendChild(makeSpan("nerd-only order-fill-pending-detail", ` ${pendingText.replace(/ \|$/, "")}`))
  }

  // Settled status — always visible (shows ✅ when complete)
  if(settledText)
    el.appendChild(makeSpan("order-fill-settled", ` ${settledText}`))

  // Nerd: #id (who) — trailing so the primary line is identical in normal mode;
  // in nerd mode it reads as a muted annotation at the end (ORDERS-UI1).
  const keySuffix = getOrderSignerSuffix(order)
  const who = `${playerId}${keySuffix}${mine ? "=you" : ""}`
  el.appendChild(makeSpan("nerd-only order-nerd-id", ` #${orderId} (${who})`))

  el.appendChild(document.createTextNode(": "))
  return el
}

// ── main ─────────────────────────────────────────────────────────────────────

// ORDER-AUTHBADGE1: reputation binding on an account, read from the getState-stamped
// authenticated/authWeight/authThreshold on the broadcast account view (PROFILE-AUTH3).
// Returns null when unknown/unbound. Spectrum: weight>0 = bound; weight>=threshold = full.
// This is the WIREFRAME account-level view (per PROFILE-AUTH-PURPOSE1: reputation, not a
// gate). Refinements deferred: (a) match the order's signing key to the binding's bound
// intent key rather than just "account has a binding"; (b) a 'verified' state once the
// backend actually verifies the signatureMap (PROFILE-AUTH3 stores unverified for now).
function katomiaNormKey(h){ return String(h || "").replace(/^0x/, "").toLowerCase() }

function getAccountAuthState(publicAccountId){
  const acc = state?.accounts?.[publicAccountId]
  if(!acc || !acc.authenticated) return null
  const weight = acc.authWeight || 0
  if(weight <= 0) return null
  const threshold = acc.authThreshold || 1
  return { weight, threshold, full: weight >= threshold, intentKeys: acc.authIntentKeys || [] }
}

// Placing account of an order = the account on the offer (amount<0) side of the bundle
// (falls back to the first entry). Order playerId is the public id; the account view is
// keyed publicId:accountId.
// ORDER-AUTHBADGE2: keyMatch confirms the order was SIGNED by the key the binding covers
// (intentSignature.pubkeyHex ∈ the account's bound intent keys) — not merely placed by a
// bound account. An account that bound one key but now signs with another → keyMatch false.
// Is a given (bare) account verified-bound for THIS order's signing key? An account is
// verified if some game account with that label published a verified binding whose bound
// intent key == the order's signing key. Scans by label so it works for any player's order.
function isAccountVerifiedForKey(accountId, signingKey){
  if(!accountId || !signingKey) return false
  return !!Object.values(state?.accounts || {}).find(a =>
    (a.accountId === accountId || a.label === accountId) &&
    a.authenticated &&
    (a.authIntentKeys || []).map(katomiaNormKey).includes(signingKey))
}

// Per-account auth for an order. An order's bundle can have MULTIPLE offer-side accounts
// (complex/pro orders), and the binding is per-account — so we return one entry per
// distinct account whose assets LEAVE (amount<0; those are the ones needing authorisation).
// Each is checked against the order's single signing key. Falls back to all bundle accounts
// if nothing is on the offer side. (Design: lets a complex trade show a mix of 💠/△.)
function getOrderAccountAuthList(order){
  const bundle = order?.bundle
  if(!Array.isArray(bundle)) return []
  const signingKey = katomiaNormKey(order?.intentSignature?.pubkeyHex)
  let accts = [...new Set(bundle.filter(x => x.amount < 0).map(x => x.accountId).filter(Boolean))]
  if(!accts.length) accts = [...new Set(bundle.map(x => x.accountId).filter(Boolean))]
  return accts.map(accountId => ({ accountId, verified: isAccountVerifiedForKey(accountId, signingKey) }))
}

// One marker per account: 💠 verified (bound & backend-verified) / △ not verified.
// Binary — the backend rejects unverified bindings, so 💠 always means verified. △ = this
// account has NOT authorised the order's key (no binding, expired, or a different key).
function makeAccountAuthMarker(entry){
  const nerd = document.body.classList.contains("nerd")
  const el = document.createElement("span")
  el.className = "order-auth-badge " + (entry.verified ? "auth-verified" : "auth-unverified")
  el.textContent = entry.verified ? "🔷" : "△"
  el.title = entry.verified
    ? (nerd
        ? `${entry.accountId}: reputation-bound & verified — this account published a wallet binding for the order's signing key, verified on the backend.`
        : `${entry.accountId}: reputation-bound & verified`)
    : (nerd
        ? `${entry.accountId}: NOT verified — this account has not authorised the order's signing key (no binding, expired, or a different key).`
        : `${entry.accountId}: not reputation-bound`)
  return el
}

// ── ORDER-AUTHBADGE3: verification on transactions ───────────────────────────
// A tx collapses many fills → a set of CONTRIBUTING orders (tx.source.orders), each
// with a signing key + placing account. Verification is per-contributing-order (one-to-
// many), so we derive the set of verified contributor accounts for the tx: an order whose
// signing key matches that account's verified binding (same keyMatch rule as orders).
// Accounts that only received assets (counterparties with no signed order here) get no
// 💠 — correct. All derived from existing state (authIntentKeys); no backend change.
function getTxContributorAuth(tx){
  const orders = tx?.source?.orders || {}
  const verifiedAccts = new Set()
  const contributorAccts = new Set()   // every offer-side account across the tx's orders
  for(const oid of getTxOrderIds(tx)){
    const order = orders[oid]
    // reuse the per-account order logic so orders + tx agree on what "verified" means
    for(const entry of getOrderAccountAuthList(order)){
      contributorAccts.add(entry.accountId)
      if(entry.verified) verifiedAccts.add(entry.accountId)
    }
  }
  // PROP-LOCKSIGN1: proposal-mode txs carry source.proposal — a settlement-time
  // SNAPSHOT of signed lock commitments with per-account bound flags (backend-derived;
  // TRUST: katomia-trusted, chain-verifiable later via PROP-MEMO-BIND1). An account is
  // verified here iff its player's commitment was signed AND the account's binding
  // covered that intent key at settlement. Unsigned lockers appear as contributors
  // (△) — full visibility of who was party to the tx and who signed.
  for(const c of tx?.source?.proposal?.commitments || []){
    for(const a of c.accounts || []){
      contributorAccts.add(a.accountId)
      if(c.signature && a.bound) verifiedAccts.add(a.accountId)
    }
  }
  return { verifiedAccts, contributorAccts, verifiedCount: verifiedAccts.size, contributorCount: contributorAccts.size }
}

function makeTxAuthBadge(txAuth){
  const nerd = document.body.classList.contains("nerd")
  const badge = document.createElement("span")
  badge.className = "order-auth-badge tx-auth-badge"
  badge.textContent = "🔷"
  const list = [...txAuth.verifiedAccts].join(", ")
  badge.title = nerd
    ? `${txAuth.verifiedCount} of ${txAuth.contributorCount} contributing account(s) reputation-verified: ${list}. Each contributed an order signed by a wallet-bound & verified key.`
    : `${txAuth.verifiedCount}/${txAuth.contributorCount} contributors reputation-verified`
  return badge
}

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

  const pubkeyHex = order?.intentSignature?.pubkeyHex || null

  if(order?.bundle?.error){
    row.textContent = `Order #${orderId} (${playerId}): ❌  ${order?.bundle?.error}`
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

  if(pubkeyHex) row.dataset.kemojiKey = pubkeyHex.slice(-12)

  row.dataset.orderSide = enriched.market?.side || ""
  // ghosts are display-only: no row interactions
  if(!ghost)
    row.onclick = makeOrderRowOnClick(orderId, playerId, enriched, order)

  // ── ORDER-UIPASS1 slice 1 (user-approved 2026-08-05): price-hero card grid ──
  // row1: side badge · price hero (@rate + pair) · status chip
  // row2: the offer → request legs (chips, full account ids — user: Hedera ids
  //       are short, never ellipsise them)
  // row3: avatar + 💠/△ + #id + time + TIF/expiry footer (identity is chrome,
  //       not content). buildOrderPrefix retired in favour of this structure.
  const fxRow = enriched.market?.type === "simple-ft"
    ? enrichSimpleFxMarketRow({ orderId, playerId, market: enriched.market }) : null

  const hero = document.createElement("div")
  hero.className = "order-hero"

  const sideVal = enriched.market?.side || ""
  if(sideVal){
    const badge = makeSpan("order-side-badge order-side-badge--" + sideVal, sideVal.toUpperCase())
    hero.appendChild(badge)
  } else {
    hero.appendChild(orderTypeIconEl(orderType))
  }

  const priceEl = document.createElement("span")
  priceEl.className = "order-price num"
  if(fxRow){
    priceEl.textContent = formatRate(fxRow.displayRate)
    const pairEl = makeSpan("order-price-pair", " " + fxRow.pair)
    priceEl.appendChild(pairEl)
  } else {
    // non-fx orders (NFT / LE / baskets): the derived label is the hero
    priceEl.textContent = marketLabel || enriched.derivedLabel || ""
    priceEl.classList.add("order-price--label")
  }
  hero.appendChild(priceEl)

  // status chip — one lifecycle vocabulary (shared palette with the signing glow)
  const chip = ghost
    ? makeSpan("kchip kchip--muted", "clearing")
    : fillStatus.fullySettled
      ? makeSpan("kchip kchip--ok", "filled ✓")
      : fillStatus.pendingText
        ? makeSpan("kchip kchip--pend", "matching ⏳")
        : makeSpan("kchip kchip--open", "open")
  if(fillStatus.pendingText) chip.title = fillStatus.pendingText.replace(/ \|$/, "")
  hero.appendChild(chip)
  row.appendChild(hero)

  const legs = document.createElement("div")
  legs.className = "order-legs"
  if(fxRow){
    // simple fx: one quantity line beats repeating the account per leg
    const qty = makeSpan("order-qty num", `${fxRow.originalDisplayBaseAmount} ${fxRow.pair.split("/")[0]}`)
    legs.appendChild(qty)
    const acct = makeSpan("order-qty-acct num", fxRow.accountId || "")
    legs.appendChild(acct)
  } else {
    legs.appendChild(createOrderSide(offer, "order-offer"))
    legs.appendChild(makeSpan("tx-arrow", "→"))
    legs.appendChild(createOrderSide(request, "order-request"))
  }
  row.appendChild(legs)

  const foot = document.createElement("div")
  foot.className = "order-foot"
  if(typeof kemojiEl === "function"){
    const avatarKey = pubkeyHex || playerId || "unknown"
    foot.appendChild(kemojiEl(avatarKey, { size: 18, isSelf: mine }))
  }
  // ORDER-AUTHBADGE1/2/3: one reputation marker per offer-side account (💠 verified / △
  // not) — a complex/pro order with several offering accounts shows several markers.
  getOrderAccountAuthList(order).forEach(entry => foot.appendChild(makeAccountAuthMarker(entry)))
  if(order.issuedAt){
    const timeEl = makeSpan("order-time", formatRelativeTime(order.issuedAt))
    timeEl.title = new Date(order.issuedAt).toISOString()
    foot.appendChild(timeEl)
  }
  const tif = order.timeInForce || "GTC"
  const tifEl = makeSpan("order-tif", getTifIcon(tif) + " " + tif)
  tifEl.title = tif
  foot.appendChild(tifEl)
  if(order.minFill)
    foot.appendChild(makeSpan("order-minfill", `min ${order.minFill.numerator}/${order.minFill.denominator}`))
  if(mine) foot.appendChild(makeSpan("order-mine-tag", "you"))
  // nerd trailers (same detail set as before, footer-resident now)
  foot.appendChild(makeSpan("nerd-only order-nerd-type", `[${orderType}]`))
  const keySuffix = getOrderSignerSuffix(order)
  foot.appendChild(makeSpan("nerd-only order-nerd-id", `#${orderId} (${playerId}${keySuffix}${mine ? "=you" : ""})`))
  if(document.body.dataset.tradingMode == "debug")
    foot.appendChild(makeSpan("nerd-only order-fill-debug", `proposed ${fillStatus.fill.numerator}/${fillStatus.fill.denominator}`))
  row.appendChild(foot)

  // Fill bar — 3px track at the bottom of the row; hidden when 0% filled
  const settledRatio = fillStatus.settled.numerator / (fillStatus.settled.denominator || 1)
  const pendingRatio = fillStatus.fill.numerator   / (fillStatus.fill.denominator   || 1)
  const barPending   = Math.max(pendingRatio - settledRatio, 0)
  if(settledRatio > 0 || barPending > 0){
    const bar = document.createElement("div")
    bar.className = "order-fill-bar"
    const s = document.createElement("div")
    s.className = "order-fill-bar-settled"
    s.style.width = `${Math.round(settledRatio * 100)}%`
    const p = document.createElement("div")
    p.className = "order-fill-bar-pending"
    p.style.left  = `${Math.round(settledRatio * 100)}%`
    p.style.width = `${Math.round(barPending  * 100)}%`
    bar.appendChild(s)
    bar.appendChild(p)
    row.appendChild(bar)
  }

  // Left stripe is now coloured by buy/sell side via CSS (data-order-side) — the
  // avatar already conveys player identity, so the old owner-colour sleeve is gone.

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


// signOrder moved to katomia-core.js (2026-08-21) — it was only reachable on
// game.php from here, and board.php needs it too: see the note there. Every page
// that loads this file loads core first, so nothing changes for the order book.

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

  // RELIABLE GATE: if the chosen account is a WalletConnect account not yet in this game
  // (merge-on-form __wcadd__ sentinel — including the auto-selected case where no change
  // event fired), add + asset-seed it before building the order. Otherwise the order
  // bundle references an accountId the game doesn't know and can never match. (Root cause
  // of the "order won't match" report — the account was never actually added to the game.)
  const _acctSel = document.getElementById("createOrderAccount")
  const _acctVal = _acctSel?.value || ""
  if(typeof WC_ORDER_ADD_PREFIX === "string" && _acctVal.startsWith(WC_ORDER_ADD_PREFIX)){
    const _accountId = _acctVal.slice(WC_ORDER_ADD_PREFIX.length)
    const _ok = await ensureAccountInGame(_accountId)
    if(!_ok){ alert(`Couldn't add account ${_accountId} to the game — try the ➕ Add account button, then submit again.`); return }
    // re-select the now-real game account so the order value is a clean publicId:accountId
    const _real = getAccounts().find(a => isMyAccount(a) && a.label === _accountId)
    if(_real) refreshCreateOrderAccounts(_real.id)
  }

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

  const _orderType = document.getElementById("createOrderType")?.value
  const _isCollectible = _orderType === "simple-nft" || _orderType === "simple-le"
  const { ok, minFill } = parseMinFill(_isCollectible ? "" : document.getElementById("createOrderMinFill")?.value)
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
      order: { ...order, orderType: _orderType }
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
// ── ORDER-UIPASS1 slice 4: mobile tab behaviour ───────────────────────────────
// Tabs are display-gated to narrow viewports by CSS; this only tracks the
// active tab (body[data-ktab]) and keeps Book/Mine in sync with the existing
// "Only mine" filter so the two controls can never disagree.
document.addEventListener("click", e => {
  // ORDER-KTABSCOPE1 (user 2026-09-04: "only mine isn't even allowing me to tick").
  // The selector was bare [data-ktab] — and the load handler below stamps data-ktab on
  // document.body, so closest() walked past the tab bar and matched BODY. Every click
  // anywhere on the page therefore ran the "Book tab" branch and switched "Only mine"
  // back off, one frame after the browser had just switched it on. Scope it to the bar.
  const b = e.target.closest?.(".ktabs [data-ktab]")
  if(!b) return
  document.body.dataset.ktab = b.dataset.ktab
  try { sessionStorage.setItem("katomiaKtab", b.dataset.ktab) } catch {}
  document.querySelectorAll(".ktabs [data-ktab]").forEach(x => x.classList.toggle("on", x === b))
  const mineCb = document.getElementById("showMyOrdersOnly")
  if(b.dataset.ktab === "book" && mineCb?.checked){ mineCb.checked = false; saveOrderFilters(); renderOrders() }
  if(b.dataset.ktab === "mine" && mineCb && !mineCb.checked){ mineCb.checked = true; saveOrderFilters(); renderOrders() }
})
window.addEventListener("load", () => {
  if(!document.querySelector(".ktabs")) return
  let tab = null
  try { tab = sessionStorage.getItem("katomiaKtab") } catch {}
  tab = tab || "book"
  document.body.dataset.ktab = tab
  document.querySelectorAll(".ktabs [data-ktab]").forEach(x => x.classList.toggle("on", x.dataset.ktab === tab))
})

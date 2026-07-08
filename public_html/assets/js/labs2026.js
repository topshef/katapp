// ╔═╗╔═╗  ┬  ┌─┐┌┐ ┌─┐  
// ║ ║║ ╦  │  ├─┤├┴┐└─┐  
// ╚═╝╚═╝  ┴─┘┴ ┴└─┘└─┘  
// OG labs 2026

// wip refactoring the og gomint ui
// https://github.com/topshef/phpjabbers/issues/50
// could also be moved to hootstrap

// it was called ubid as was gonna refactor towards that
// but for ubid we're tunnelling from a clean start
// see /m/bid/index.ph
// https://github.com/topshef/phpjabbers/issues/48
// however there is lots of ref to ubid below due to that intention

// 2026 mucho en flux. gonna iterate here as a baseline working framework

'use strict'  // eg can detect mutation with deepFreeze

let productId //= getParm('productId')
let dealId //= getParm('dealId')

// ┌┬┐┌─┐┌┬┐┌─┐  ┌┬┐┌─┐┌┬┐┌─┐┬  
//  ││├─┤ │ ├─┤  ││││ │ ││├┤ │  
// ─┴┘┴ ┴ ┴ ┴ ┴  ┴ ┴└─┘─┴┘└─┘┴─┘
// data model


//temp get approvals info to decide what gomint deals to showDelayOption
//eg https://kpos.uk/deal/query/?legacy=1&network=mainnet&dealId=428dc6
async function fetchLegacyDeal(dealId) {

	const url = `https://kpos.uk/deal/query/?legacy=1&dealId=${dealId}`
	const response = await fetch(url)
	let data = await response.json()
	// console.log({url,data})
	return data
}

	// ┌─┐┌─┐┌┬┐┌─┐┬ ┬╔═╗┬─┐┌─┐┌┬┐┬ ┬┌─┐┌┬┐
	// ├┤ ├┤  │ │  ├─┤╠═╝├┬┘│ │ │││ ││   │ 
	// └  └─┘ ┴ └─┘┴ ┴╩  ┴└─└─┘─┴┘└─┘└─┘ ┴ 
	// fetchProduct

function fetchProduct(productId) {
  if (!productId) {
    console.log('fetchProduct: no productId')
    return Promise.resolve(null)
  }

  const url = `https://tools.gomint.me/explore/NFT/?json&productId=${productId}`
  // console.log('fetchProduct URL:', url)
	

  return fetch(url)
    .then(response => {
      // console.log('fetchProduct response:', response.status, response.ok)
      return response.json()
    })
    .then(data => {
      // console.log('fetchProduct data:', data)
      return data
    })
    .catch(err => {
      console.error('fetchProduct error:', err)
      throw err
    })
}

	// ┌─┐┌─┐┌┬┐┌─┐┬ ┬╔╦╗┌─┐┌─┐┬  
	// ├┤ ├┤  │ │  ├─┤ ║║├┤ ├─┤│  
	// └  └─┘ ┴ └─┘┴ ┴═╩╝└─┘┴ ┴┴─┘
	// fetchDeal
	// could ditch this and use kpos fetchDeals instead - though kpos is not live (db based on cron) 
	// Function to fetch data for dealId or return null if dealId is not present
async function fetchDeal(dealId) {
  if (!dealId) return null

  const response = await fetch(`https://kpos.uk/deal/query/?dealId=${dealId}`)
  let data = await response.json()
	// console.log(data)
	// console.log(data.deal?.addNftTransfer?.[0]?.userInput)

  if (Array.isArray(data)) // todo check upstream shape
    data = data[0]

  const deal = data.deal || data 

	// console.log('normalisePreKatomicDeal before', deal)
	normalisePreKatomicDeal(deal) // this mutates deal
	// console.log('normalisePreKatomicDeal after', deal)

	return deal
}


function normalisePreKatomicDeal(deal) {
	
	deal.network ||= deal.header?.network
	deal.alias ||= {}
	deal.parameters ||= {}
	deal.addHbarTransfer  ||= []
	deal.addTokenTransfer ||= []
	deal.addNftTransfer   ||= []
	deal.display ||= {}
	deal.display.title       ||= deal.header?.dealName
  deal.display.description ||= deal.header?.dealDescription

	// deepFreeze(deal)  // detect mutation when 'use strict'
	return deal

}


	// ┌─┐┌─┐┌┬┐┌─┐┬ ┬  ┌┬┐┌─┐┌─┐┬  ┌─┐
	// ├┤ ├┤  │ │  ├─┤   ││├┤ ├─┤│  └─┐
	// └  └─┘ ┴ └─┘┴ ┴  ─┴┘└─┘┴ ┴┴─┘└─┘
	// fetch deals
   /*
    eg
    https://kpos.uk/deal/query/?productId=mainnet;0.0.3729729
    expand with &detail
    
    product id can also be a specific serial, and or owner (eg gomint)
    https://kpos.uk/deal/query/?productId=mainnet;0.0.3729729-592;0.0.2721498
   
    or separate query parms can be passed in: network tokenId serial sender 
    later probably more options: receiver, dates, etc
    and instances ie txid hashpool etc
    
    [
    {
        "network": "mainnet",
        "dealId": "b8b93760beb01930bf41c87259975960977987b64c9c56075b882ab479630c0e",
        "domain": "gmws3.gomint.me",
        "created": "2023-10-08 07:09:38"
    },
    {
        "network": "mainnet",
        "dealId": "515c43ea6e797c013b474494c7281f59831433d5e92aa8d88de01edd8c05e139",
        "domain": "gmws3.gomint.me",
        "created": "2023-10-08 07:08:55"
    },
    {
        "network": "mainnet",
        "dealId": "1fe1d025ba897704d25df8be81f5a6c08988c219c698b209b924b93f9fe34115",
        "domain": "gmws3.gomint.me",
        "created": "2023-10-08 07:07:58"
    },
    
		
		note: there are now 2 more endpoints:
		did these having forgotten about above but i think they probably serve faster (no joins)
		they return actual line items from the deals, with various filter options
			https://kpos.uk/deal/query/NFT
			https://kpos.uk/deal/query/FT
		
    */
    
    
	// ┌─┐┌─┐┌┬┐┌─┐┬ ┬╔╦╗┌─┐┌─┐┬  ┌─┐
	// ├┤ ├┤  │ │  ├─┤ ║║├┤ ├─┤│  └─┐
	// └  └─┘ ┴ └─┘┴ ┴═╩╝└─┘┴ ┴┴─┘└─┘
	// fetchDeals    
	//on hold    	
function zz_hold_fetchDeals(params) {
    //feb 2026 todo check if this is needed and vs endpoints above
		
    //this will work for serial ranges if exact match to deal eg serial=226to250
    // so we can split product id and process OG requests
    const query = new URLSearchParams(params).toString()
    const url = `https://kpos.uk/deal/query/?${query}`
    console.log("fetchDeals url=", url)
    return fetch().then(response => response.json())
}

	// ┌─┐┌─┐┌┬┐┌─┐┬ ┬╔╦╗┌─┐┌─┐┬  ┌─┐╔═╗┬─┐┌─┐┌┬┐╔═╗┬─┐┌─┐┌┬┐┬ ┬┌─┐┌┬┐
	// ├┤ ├┤  │ │  ├─┤ ║║├┤ ├─┤│  └─┐╠╣ ├┬┘│ ││││╠═╝├┬┘│ │ │││ ││   │ 
	// └  └─┘ ┴ └─┘┴ ┴═╩╝└─┘┴ ┴┴─┘└─┘╚  ┴└─└─┘┴ ┴╩  ┴└─└─┘─┴┘└─┘└─┘ ┴ 
	// fetchDealsFromProduct

async function fetchDealsFromProduct(productId) {
  const parts = splitProductId(productId)
  const query = new URLSearchParams(parts).toString()
  const url = `https://kpos.uk/deal/query/NFT/?limit=100&order=desc&sort=id&${query}`
	//this is then specific to the serial range provided
	// untested for single serial deal
	
  console.log('fetchDealsFromProduct url =', url)

  const response = await fetch(url)
  console.log('fetchDealsFromProduct status =', response.status)

  const data = await response.json()
  console.log('fetchDealsFromProduct data =', data)

  return data
}

async function fetchDealsFromProductV1(productId) {
  const parts = splitProductId(productId)
  const query = new URLSearchParams(parts).toString()
  const url = `https://kpos.uk/deal/query/?legacy=1&format=json&${query}`
	//https://kpos.uk/deal/query/NFT/?limit=100&order=asc&sort=id&tokenId=0.0.1276737&serialFrom=350&serialTo=400
	
  console.log('fetchDealsFromProduct url =', url)

  const response = await fetch(url)
  console.log('fetchDealsFromProduct status =', response.status)

  const data = await response.json()
  console.log('fetchDealsFromProduct data =', data)

  return data
}


	// ┌─┐┌─┐┬  ┬┌┬┐╔═╗┬─┐┌─┐┌┬┐┬ ┬┌─┐┌┬┐╦┌┬┐
	// └─┐├─┘│  │ │ ╠═╝├┬┘│ │ │││ ││   │ ║ ││
	// └─┘┴  ┴─┘┴ ┴ ╩  ┴└─└─┘─┴┘└─┘└─┘ ┴ ╩─┴┘
	// splitProductId
function splitProductId(productId) {
  let [network, tokenSerial, holder] = productId.split(';')
	
	tokenSerial = tokenSerial.replace(':', 'to') // normalise to db version, more caveman
	
	let [tokenId, serialRange] = tokenSerial.split('-')
	serialRange ||= ''
	
	serialRange.replace('to', ':')  //normalise to colon
	
	let [serialFrom, serialTo] = serialRange.split('to')
	serialTo ||= serialFrom
	

	const out = { network, tokenId, serialRange, serialFrom, serialTo, holder }
	// if (serialRange) // offer back collection id for expanded searches
	out.collectionProductId = `${network};${tokenId}`  // offer back collection id for expanded searches

	// notes on holder
	// OG market allows productId to include the holder - this is handy for splitting offers by seller
	// but we are not yet filtering on this.. todo link with xproof etc and also get pre-signing status etc
	// eg we could call for bytes and see if the holders signature is included.. bit hacky but coudl work
	// anyway meanwhile we could display a bare product id that does not include the holder
	// nah.. that woudl be a hack.. we just put the holder into the input.. park for now it will come
	// out.bareProductId = `${network};${tokenId}-${serialRange}` //ignore filter on holder
	
	console.log({productId, out})
  return out
}

	// ┌┬┐┬─┐┌─┐┌┐┌┌─┐┌─┐┌─┐┬─┐┌┬┐  ┌┬┐┌─┐┌┬┐┌─┐
	//  │ ├┬┘├─┤│││└─┐├┤ │ │├┬┘│││   ││├─┤ │ ├─┤
	//  ┴ ┴└─┴ ┴┘└┘└─┘└  └─┘┴└─┴ ┴  ─┴┘┴ ┴ ┴ ┴ ┴
	// transform data

async function transformDealData({deal}) {  
    console.log({deal})

    let out = {}
		out.network = deal.network
		// ubid.deal = deal // return the input ?
		out.allTransfers = await mergeAllTransfers(deal) // add this back into the input
    out.title       = deal.display.title ?? 'untitled RH45323'
    out.description = deal.display.description ?? 'no desc WK83843'

		// fall back to the traded NFT's own image rather than a generic stock
		// thumbnail when the deal author didn't set one - only handles the
		// common single-NFT case; multiple NFTs in one deal falls through to
		// the generic thumbnail for now (todo: image carousel/click-through)
		const nftImages = out.allTransfers
			.filter(x => x.assetType === 'NFT' && x.imageURL)
			.map(x => x.imageURL)
		const singleNftImage = (nftImages.length === 1) ? nftImages[0] : null

		out.image = deal.display.thumbnail || singleNftImage || ''
		out.button      = deal.display.button || 'Buy now'

    if (hasParm('operatorId'))
        deal.parameters.operatorId = 'Operator account ID [eg 0.0.12345] hentity'

    if (hasParm('node')) // optionally choose a specific Hedera node to submit to
        deal.parameters.node = 'Hedera node account ID [eg 5] hentity'
    
    const hasApi = deal.api && Array.isArray(deal.api) && deal.api.length > 0
    const maxDelaySeconds = deal?.constants?.maxDelaySeconds ?? 0
    
    let showDelayOption = false
    if (hasParm('starttime')) showDelayOption = true
    if (hasApi && !maxDelaySeconds) showDelayOption = false // suppress if there's an api involved, unless maxDelaySeconds > 0

    if (showDelayOption)
        deal.parameters.starttime = '⏱️ Delay execution by [eg 30 mins] text'

    const hasUserParameters = deal.parameters && Object.keys(deal.parameters).length > 0

		out.parameters = []

		if (hasUserParameters)
			Object.entries(deal.parameters).forEach(([parmname, parminfo]) => {
				const regex = /^(.*?) \[(.*?)\] (.*)$/
				const [, parmlabel, placeholder, type] = parminfo.match(regex) || []
				if (!parmlabel) return

				out.parameters.push({
					name: parmname,
					label: parmlabel,
					placeholder,
					type,
					defaultValue: getParm(parmname) || ''
				})
			})

		out.alias = deal.alias
		out.aliasReversed = Object.entries(deal.alias)
			.reduce((acc, [a, id]) => {
				if (!(id in acc))
					acc[id] = a
				return acc
			}, {})


		console.log("out=", out)
		return out
}


function parseAmount(value) {
  const str = String(value).trim()

  const isNegative = str.startsWith('-')
  const absAmount = isNegative ? str.slice(1).trim() : str

  return {
    sign: isNegative ? '-' : '+',
		verb: isNegative ? 'sends' : 'receives',  // GMDEALDISPLAY1: was inverted - a negative
		                                           // transfer value means the account is SENDING
		                                           // that asset, not receiving it (confirmed
		                                           // against authored userInput text, eg
		                                           // {"value":"-0.3","userInput":"buyer sends 0.3 hbar"})
    absAmount
  }
}

// ─── Asset type + decimal-aware display ──────────────────────────────────
// Ported from swap.kpay.live/public_html/m/katomia/katomia-helpers.js
// (getAssetType) and katomia-enrich.js (getDisplayDecimals / formatAssetDisplay)
// as of 2026-07-08. Deliberately duplicated rather than shared, for GoMint
// stability while it's mid-sync with Katomia - see GMDEALDISPLAY1. If
// Katomia's asset classification/formatting changes, check whether this copy
// needs the same update. Longer term this should become a shared library
// both projects import instead of each keeping its own copy.

function getAssetType(tokenClass, amount = 1) {
	if (!tokenClass) return 'UNKNOWN'
	if (tokenClass.type === 'NON_FUNGIBLE_UNIQUE') return 'NFT'

	const decimals = Number(tokenClass.decimals || 0)
	if (decimals === 0) return (Math.abs(amount) <= 10000) ? 'LE' : 'FT0'  // LE = limited-edition / zero-decimal collectible fungible
	return 'FT'
}

function getDisplayDecimals(tokenClass) {
	const decimals = Number(tokenClass?.decimals || 0)
	return Math.min(decimals, 8)
}

function getTokenLabel(tokenClass, fallbackId) {
	if (!tokenClass) return fallbackId

	const symbol = tokenClass.symbol || fallbackId
	const name = tokenClass.name || fallbackId

	// some legacy tokens (eg KT1) carry a hedera://...roothash=... URI as their
	// "symbol" - fall back to name in that case, same special-case as Katomia's
	// formatAssetDisplay
	let label = (symbol && String(symbol).toLowerCase().startsWith('hedera://')) ? name : symbol

	if (name && label !== name) label += ` (${name})`
	return label || fallbackId
}

function formatFungibleAmount(rawValue, tokenClass) {
	const decimals = Number(tokenClass?.decimals || 0)
	if (!decimals) return String(Math.abs(Number(rawValue)))

	const value = Math.abs(Number(rawValue)) / (10 ** decimals)
	const displayDecimals = getDisplayDecimals(tokenClass)
	const rounded = value.toFixed(displayDecimals).replace(/\.?0+$/, '')
	return rounded || '0'
}

// {var} tokens and the bare "buyer" placeholder both render as mono chips -
// "buyer" is a reserved word substituted server-side at signing time (see
// hbarlive_hts/dealEngine.js injectString()), so it's not a real account id
// yet at display time; showing it as a chip like any other unresolved
// variable is clearer than a "You send/receive" guess this early.
function chipify(text) {
	if (text == null) return text
	return String(text)
		.replace(/\{([^}]*)\}/g, "<span class='code'>$1</span>")
		.replace(/\bbuyer\b/g, "<span class='code'>buyer</span>")
}

// ─── Merge + enrich all transfers ─────────────────────────────────────────
// Fetches token/NFT metadata (name, symbol, decimals) for everything
// referenced in the deal so amounts and labels render properly instead of
// raw token ids and unscaled integers (GMDEALDISPLAY1).
async function mergeAllTransfers(deal) {

	const network = deal.network

	window.gmAssetMetaCache ||= {}
	const cache = window.gmAssetMetaCache

	const metaKeys = new Set()
	;(deal.addTokenTransfer || []).forEach(x => metaKeys.add(`${network};${x.tokenId}`))
	;(deal.addNftTransfer || []).forEach(x => {
		if (/^\d+$/.test(String(x.serial))) metaKeys.add(`${network};${x.tokenId}-${x.serial}`)
	})

	const jobs = [...metaKeys]
		.filter(key => cache[key] === undefined)
		.map(key => fetchProduct(key).then(meta => { cache[key] = meta }).catch(() => { cache[key] = null }))

	if (jobs.length) await Promise.all(jobs)

  const normaliseHbar = xfer => {
    const {verb, absAmount} = parseAmount(xfer.value)

    return {
			assetType: 'FT',
			accountId: xfer.accountId,
			amount: xfer.value,
			displayAmount: absAmount,  // deal hbar values are already decimal hbar, not tinybar
			tokenLabel: 'hbar',
			tokenLink: 'https://hedera.com/hbar',
			verb,
			userInput: xfer.userInput,
    }
  }

  const normaliseFT = xfer => {
		const {verb, absAmount} = parseAmount(xfer.value)
		const isVar = String(xfer.value).includes('{')
		const meta = cache[`${network};${xfer.tokenId}`]
		const tokenClass = meta?.token_class

    return {
			asset: xfer.tokenId,
			assetType: getAssetType(tokenClass, Number(absAmount) || 1),
			accountId: xfer.accountId,
      amount: xfer.value,
			displayAmount: isVar ? absAmount : formatFungibleAmount(absAmount, tokenClass),
			tokenLabel: getTokenLabel(tokenClass, xfer.tokenId),
			tokenLink: `https://hashscan.io/${network}/token/${xfer.tokenId}`,
			verb,
			userInput: xfer.userInput,
    }
  }

  const normaliseNFT = xfer => {
		const productId = `${network};${xfer.tokenId}-${xfer.serial}`
		const meta = cache[productId]

    return {
      assetType: 'NFT',
      asset: xfer.tokenId,
			serialRange: xfer.serial,
			productId: productId,
			sender: xfer.sender,
			receiver: xfer.receiver,
			tokenLabel: meta?.token_instance_name || `${xfer.tokenId} #${xfer.serial}`,
			imageURL: meta?.token_asset_image_URL || null,
			userInput: xfer.userInput,
    }
  }

  const allTransfers = [
    ...(deal.addHbarTransfer || []).map(normaliseHbar),
    ...(deal.addTokenTransfer || []).map(normaliseFT),
    ...(deal.addNftTransfer || []).map(normaliseNFT)
  ]

  return allTransfers
}





async function transformProductData({product}) {  
    if (isFlagSet('dealonly'))
      return console.log('KR37432 dont supply productId if presenting dealonly') || false

    console.log({product})

    let ubid = {}
    ubid.transfers = []  // remove
    ubid.title = product?.token_instance_name ?? 'untitled DJ93844'
    ubid.description = product.token_instance_description ?? 'no desc PJ92384'
    ubid.image = product.token_asset_image_URL ?? ''
		ubid.button = 'N/A HJ76444 shoudl be hidden'
		
		console.log("ubid=", ubid)
		return ubid
}

// combine product vs deals
//deprecated. but keepign old notes for now..

		//2024 notes...
    // in the OG gomint, if product was not set we defaulted by looking it up
    // but thinking afresh maybe best not to have any user-driven focus on a single product
    // if we want to highlight a particular product as part of a deal, then set the deal parameters accordingly (title desc thumbnail etc)
    // gomint can still separately detail the contents of the deal 
    // for simple OG deals this can still look like a regular product sale
    // but for multiasset it can present as a kind of bundle or proposal




// ┬─┐┌─┐┌┐┌┌┬┐┌─┐┬─┐  ┬  ┬┬┌─┐┬ ┬
// ├┬┘├┤ │││ ││├┤ ├┬┘  └┐┌┘│├┤ │││
// ┴└─└─┘┘└┘─┴┘└─┘┴└─   └┘ ┴└─┘└┴┘
// render view



function renderProductPanel(data) {
	  document.querySelector('#product-panel .ubid-title').innerHTML = data.title
	  document.querySelector('#product-panel .ubid-description').innerHTML = data.description
	  document.querySelector('#combo-container .ubid-media img').src = data.image
	  document.querySelector('#product-panel .ubid-asset-link').innerHTML =  `Hedera <a href='https://tools.gomint.me/explore/NFT/?productId=${productId}' target='_blank'>${productId.replaceAll(';', ' | ')}</a>`

 		// const img = document.querySelector('#combo-container .ubid-media img')
		// if (img)
			// img.addEventListener('load', () => img.classList.remove('skeleton'), { once: true })
		
		// document
			// .querySelectorAll('#product-panel .skeleton:not(img)')
			// .forEach(el => el.classList.remove('skeleton'))
			
		// document.querySelector('#product-panel').style.display = 'block'
	
}



// An alias (deal.alias, eg {"treasury":"0.0.196823"}) is just the deal
// author's own convenience label for an account - not a trusted/reserved
// name like "buyer", so it's plain parenthetical text, not a code chip.
// Rendered as "<link to hashscan>0.0.196823</link> (treasury)".
function renderAccountId(accountId, network, dealdata) {
	if (accountId === 'buyer') return 'buyer'  // chipify() wraps this below
	if (String(accountId).includes('{')) return accountId  // unresolved {var} - chipify() wraps below

	const alias = dealdata?.aliasReversed?.[accountId]
	const linked = `<a href='https://hashscan.io/${network}/account/${accountId}' target='hashscan'>${accountId}</a>`
	return alias ? `${linked} (${alias})` : linked
}

function renderTransfer(xfer, dealdata) {
	const network = dealdata.network

	// legacy fallback: transfers with no structured accountId/sender-receiver
	// (rare/old records that only ever had a freeform narrative) can't build
	// the enriched line below - fall back to showing that text alone rather
	// than a blank/broken auto line
	const hasStructuredData = xfer.assetType === 'NFT'
		? (xfer.sender != null && xfer.receiver != null)
		: (xfer.accountId != null)

	if (!hasStructuredData)
		return chipify(xfer.userInput || xfer.txt || '')

	let primary

	if (xfer.assetType === 'NFT') {
		const href = `?v=labs&productId=${xfer.productId}`
		const tooltip = `Product Id ${xfer.productId}`

		const localLink = renderLocalLink({href, label: xfer.tokenLabel, tooltip})
		const elNft = renderTooltip(localLink, tooltip)

		const sender = renderAccountId(xfer.sender, network, dealdata)
		const receiver = renderAccountId(xfer.receiver, network, dealdata)

		primary = `${sender} sends ${elNft} to ${receiver}`

	} else {
		// LE/FT0 (zero-decimal fungible - eg limited editions) read better without
		// a redundant "1" when only a single unit is changing hands
		let amountPart
		if (xfer.assetType === 'LE' || xfer.assetType === 'FT0') {
			const n = Number(xfer.displayAmount)
			amountPart = (!isNaN(n) && n > 1) ? `×${xfer.displayAmount} ` : ''
		} else {
			amountPart = `${xfer.displayAmount} `
		}

		const tokenLinkHtml = xfer.tokenLink
			? `<a href='${xfer.tokenLink}' target='hashscan'>${xfer.tokenLabel}</a>`
			: xfer.tokenLabel

		const account = renderAccountId(xfer.accountId, network, dealdata)

		primary = `${account} ${xfer.verb} ${amountPart}${tokenLinkHtml}`
	}

	// the authored userInput sentence is no longer shown alongside this line -
	// once we have structured data, it was purely restating the same transfer
	// (often via an alias name, which now renders inline above via
	// renderAccountId instead of as a separate line). Kept on the xfer object
	// though, in case a future "view raw script" toggle wants it.
	return chipify(primary)
}


function renderDealPanel(data) {
	  document.querySelector('#deal-panel .ubid-title').innerHTML = data.title
	  document.querySelector('#deal-panel .ubid-description').innerHTML = data.description
	  document.querySelector('#combo-container .ubid-media img').src = data.image || 'https://katomic.org/demo/defaultDealThumbnail.png'
		
		document.querySelector('#deal-panel .ubid-transfers').innerHTML
			= data.allTransfers.map(x => renderTransfer(x, data)).join('<BR>')

		document.querySelector('#deal-panel .ubid-user-inputs').innerHTML = (data.parameters || []).map(renderParameter).join('')
		
	  document.querySelector('#deal-panel .ubid-asset-link').innerHTML = `#katomic <a href='https://katomic.org/labs/?dealId=${dealId}' target='_blank'>${dealId.slice(0, 6)}</a>`

		// document.getElementById('create-tx').innerText = data.button
		// updateButtonNowLater()
	
		const btn = document.getElementById('create-tx')
		if (btn && data.button) {
			btn.innerText = data.button
			updateButtonNowLater()
		}
		
		// const img = document.querySelector('#combo-container .ubid-media img')
		// if (img)
			// img.addEventListener('load', () => img.classList.remove('skeleton'), { once: true })
		
		// document
			// .querySelectorAll('#combo-container .skeleton:not(img)')
			// .forEach(el => el.classList.remove('skeleton'))
		
}

async function renderRelatedDeals(productId, selector = '#product-panel .ubid-related-by-serial') {
  try {
    // const dealsV1 = await fetchDealsFromProductV1(productId) // og query maybe useful for testing
    const deals = await fetchDealsFromProduct(productId)
		console.log(deals)
		
		const elRelatedDeals = document.querySelector(selector)
		// elRelatedDeals.innerHTML = ''
		
		// todo think about list length eg offer detail summary expand especially if list is long
    for (const dealInfo of deals) {

			// ┬  ┌─┐┌─┐┌─┐┌─┐┬ ┬  ┌─┐┌─┐┌┬┐┌─┐┬ ┬
			// │  ├┤ │ ┬├─┤│  └┬┘  ├┤ ├┤  │ │  ├─┤
			// ┴─┘└─┘└─┘┴ ┴└─┘ ┴   └  └─┘ ┴ └─┘┴ ┴
			// legacy fetch			
			//***** to review.. for now only show deals approved via legacy process
			const legacyDeal = await fetchLegacyDeal(dealInfo.dealId)
			const isApproved = legacyDeal.isApproved == true
			// console.log(legacyDeal)
			if (!isApproved) continue;

		
			const dealIdShort = dealInfo.dealId.slice(0,6)
			
			const href = `?dealonly&v=labs&dealId=${dealInfo.dealId}`
			// const label = `${dealIdShort}`
			const created = dealInfo.created?.slice(0,10) || ''
			
      // fetch full deal detail
      const deal = await fetchDeal(dealInfo.dealId)
							
			const title = stripHtml(deal.display?.title || '')
			const description = stripHtml(deal.display?.description || '')
			
			// const tooltip = `${title} | ${description} | ${created}`
			// elRelatedDeals.innerHTML += renderLocalLink({href, label, tooltip})
			const label = title || dealIdShort
			const tooltip = `${description} | ${created} (${dealIdShort})`

			elRelatedDeals.innerHTML += `
				<div>
					${renderLocalLink({href, label, tooltip})}
				</div>
			`
      // const ubid = await transformDealData({ deal })  // not needed yet
			// console.log(ubid)
    }

  } catch (err) {
    console.error('Related deal hydration failed', err)
  }
}

function renderTooltip(text, tooltipText) { //requires hoot
  return `<span class="utooltip" data-tooltip="${escapeHtml(tooltipText)}">${text}</span>`
}

function renderLocalLink({
  href,
  label,
  tooltip = '',
  title = '',
  onNavigate = 'navigateLocal'
}) {
	// v0.1
	// Renders a local navigation link with optional custom click handler
	// Defaults to navigateLocal for SPA routing, falls back to hard reload if needed
	// Designed to tolerate base href environments and embedded browser contexts
	// Allows flexible click behaviour while preserving normal anchor semantics
	// Supports tooltip/title metadata for UI enrichment
  const safeTitle = title || tooltip

  const action = onNavigate
    ? `${onNavigate}('${href}'); return false;`  // if a function name is provided run this function
    : `window.location.search='${href}'; return false;`  // else directly navigate to the link

	const basePath = window.location.origin + window.location.pathname
	const resolvedHref = basePath + href

  return `
    <a
      href="${resolvedHref}"
      onclick="${action}"
      class="utooltip"
      data-tooltip="${tooltip}"
      title="${safeTitle}"
    >
      ${label}
    </a>
  `
}


function renderParameter(p) {
  return `
    <div>
      <label for='${p.name}'>${p.label}</label>
    </div>
    <div>
      <input
        class='user_input'
        type='text'
        id='${p.name}'
        placeholder='${p.placeholder}'
        value='${p.defaultValue}'
      >
    </div>
  `
}



function resolveEntityType(productId, dealId) {
  if (dealId) return 'deal'
  if (productId) return 'product'
  return null
}

function updateButtonNowLater() {
  const btn = document.getElementById('create-tx')
  const input = document.getElementById('starttime')
  if (!btn || !input) return

  const v = (input.value || '').trim().toLowerCase()
  const isNow = v === '' || v === 'now' || v === '0'

  btn.innerText = btn.innerText
    .replace(/\blater\b/i, 'now')
    .replace(/\bnow\b/i, isNow ? 'now' : 'later')
}


// ┌─┐┌─┐┌┐┌┌┬┐┬─┐┌─┐┬  ┬  ┌─┐┬─┐
// │  │ ││││ │ ├┬┘│ ││  │  ├┤ ├┬┘
// └─┘└─┘┘└┘ ┴ ┴└─└─┘┴─┘┴─┘└─┘┴└─
// controller


function parseSearchParams(search) {
  const params = new URLSearchParams(search)
  productId = params.get('productId')
	if (productId) productId = productId.replace('to',':') //normalise to colon
	
  dealId = params.get('dealId')
	// console.log(location.pathname)
	//todo other fixes eg KWC for flexible path
	if (!dealId) {
    const match = location.pathname.match(/^\/deal\/([a-fA-F0-9]+)/)
    if (match)
      dealId = match[1]
  }
}

async function navigateLocal(search) {
	// v0.1
	// Performs SPA-style navigation by updating only the query string (no reload)
	// Mirrors window.location.search behaviour while preserving path + hash
	// Normalises pathname to avoid double-slash issues and base href conflicts
	// Safe for embedded/restricted browsers (e.g. Hashpack) using pushState
	// Re-parses params and re-renders combo container deterministically
   const s = search.startsWith('?') ? search : `?${search}`

	 const path = window.location.pathname.replace(/^\/+/, '/')

   history.pushState(
     {},
     '',
// -    window.location.pathname + s + window.location.hash
     path + s + window.location.hash
   )

   parseSearchParams(s)

   renderPage()
   // await renderPage()
 }

window.addEventListener('popstate', () => {
  parseSearchParams(window.location.search)
  renderPage()
})


function showPanel(type) {
  document.querySelectorAll('.panel')
    .forEach(p => p.classList.remove('is-active'))

  const target = document.getElementById(`${type}-panel`)
  if (target)
    target.classList.add('is-active')
}


async function renderPage() {
  parseSearchParams(window.location.search)

  // reset entire UI state
  // document.querySelectorAll('.skeleton').forEach(el => el.classList.add('skeleton'))

  document.querySelector('#product-panel .ubid-related-by-serial').innerHTML = ''
  document.querySelector('#product-panel .ubid-related-by-collection').innerHTML = ''
  document.querySelector('#deal-panel .ubid-transfers').innerHTML = ''
  document.querySelector('#deal-panel .ubid-user-inputs').innerHTML = ''

  // reset the shared image so the shimmer placeholder shows again on SPA
  // navigation between products/deals, not just the very first page load
  const img = document.querySelector('#combo-container .ubid-media img')
  if (img) { img.classList.remove('loaded'); img.removeAttribute('src') }

  const entityType = resolveEntityType(productId, dealId)
	showPanel(entityType)

  let raw = {}

  if (entityType === 'deal') {
    raw.deal = await fetchDeal(dealId)
    window.__dealNetwork = raw.deal?.network || null // wallet bar reads this for ensureNetwork
    const processed = await transformDealData(raw)
    renderDealPanel(processed)
  }

  if (entityType === 'product') {
    raw.product = await fetchProduct(productId)
    const processed = await transformProductData(raw)
    renderProductPanel(processed)
		
		const {collectionProductId, serialRange} = splitProductId(productId)
		if (serialRange) renderRelatedDeals(productId,'#product-panel .ubid-related-by-serial')
		if (collectionProductId) renderRelatedDeals(collectionProductId,'#product-panel .ubid-related-by-collection')
  }

}



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
		out.allTransfers = mergeAllTransfers(deal) // add this back into the input
    out.title       = deal.display.title ?? 'untitled RH45323'
    out.description = deal.display.description ?? 'no desc WK83843'
    out.image       = deal.display.thumbnail ?? ''
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
		verb: isNegative ? 'receives' : 'sends',
    absAmount
  }
}

function mergeAllTransfers(deal) {  // too long atm.. todo remove narrative and handle in render
 
	
  const normaliseHbar = xfer => {
    const {sign, verb, absAmount} = parseAmount(xfer.value) 
		console.log({xfer,sign, verb,absAmount})
    // const verb = amount < 0 ? 'sends' : 'receives'
		const asset = 'HBAR'
		
    return {
      // ...xfer,
			asset,
			sign, verb, absAmount, 
      assetType: 'FT',
			accountId: xfer.accountId,
			amount: xfer.value,
      // narrative: xfer.userInput || `${xfer.accountId} ${verb} ${absAmount} HBAR`
      narrative: `${xfer.accountId} ${verb} ${absAmount} ${asset}`
    }
  }

  const normaliseFT = xfer => {
		const {sign, verb, absAmount} = parseAmount(xfer.value) 
		const asset = xfer.tokenId
		
    return {
      // ...xfer,
			asset, needsHydration: true,
			sign, verb, absAmount,
      assetType: 'FT',
			accountId: xfer.accountId,
      amount: xfer.value,
      // narrative: xfer.userInput || `${xfer.accountId} ${verb} ${abs} ${xfer.tokenId}`,
			narrative: `${xfer.accountId} ${verb} ${absAmount} ${asset}`,
      
    }
  }

  const normaliseNFT = xfer => {
		const productId = `${deal.network};${xfer.tokenId}-${xfer.serial}`
    return {
      ...xfer,
      assetType: 'NFT',
      asset: xfer.tokenId,
			serialRange: xfer.serial,
			productId: productId,
      narrative:
        xfer.userInput ||
        `${xfer.sender} sends NFT ${xfer.tokenId}#${xfer.serial} to ${xfer.receiver}`
    }
  }

  const allTransfers = [
    ...(deal.addHbarTransfer || []).map(normaliseHbar),
    ...(deal.addTokenTransfer || []).map(normaliseFT),
    ...(deal.addNftTransfer || []).map(normaliseNFT)
  ]

	console.log(allTransfers)
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



function renderTransfer(xfer, dealdata) {
	console.log(xfer)  // todo build narrative from primitives
	const entityLabels = dealdata.aliasReversed || []
	console.log({entityLabels})
	
	let debug = xfer.userInput || xfer.narrative || ''
	
	let narrative
	if (xfer.assetType == 'NFT') {
		console.log(xfer)
		const nftProductId = `${dealdata.network};${xfer.asset}-${xfer.serialRange}`
		const label = `${xfer.asset} #${xfer.serial}`
		
		const href = `?v=labs&productId=${nftProductId}`
		const tooltip = `Product Id ${nftProductId}`
		
		const localLink = renderLocalLink({href, label, tooltip})
		
		const elNft = renderTooltip(localLink, tooltip)
		
		narrative = `${xfer.sender} sends ${elNft} to ${xfer.receiver}` // test9ng ony
		
	} else {
		
		narrative = `${xfer.accountId} ${xfer.verb} ${xfer.absAmount} ${xfer.asset} ${xfer.assetType}` // test9ng ony
	}
		
  
	
	
  narrative = narrative.replace(/\{(.*?)\}/g, "<span class='code'>$1</span>")

	// todo later depending on wallet connect state
	// narrative = narrative
		// .replace(/\bbuyer receives\b/g, 'You receive')
		// .replace(/\bbuyer sends\b/g, 'You send')


  // for (const [key, value] of Object.entries(entityLabels)) {
    // const link = `<a href='https://kpay.uk/${value}' target='${value}'>${key}</a>`
    // const regex = new RegExp(`\\b${key}\\b`, 'g')
    // text = text.replace(regex, link)
  // }
		
	return  narrative
	// return  renderTooltip(narrative, `debug YU87457: ${debug}`)
}


function renderDealPanel(data) {
	  document.querySelector('#deal-panel .ubid-title').innerHTML = data.title
	  document.querySelector('#deal-panel .ubid-description').innerHTML = data.description
	  document.querySelector('#combo-container .ubid-media img').src = data.image || 'https://katomic.org/demo/defaultDealThumbnail.png'
		
		console.log(data)
		console.log(data.transfers)
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



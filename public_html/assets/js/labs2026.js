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
  console.log('fetchProduct URL:', url)

  return fetch(url)
    .then(response => {
      console.log('fetchProduct response:', response.status, response.ok)
      return response.json()
    })
    .then(data => {
      console.log('fetchProduct data:', data)
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
	console.log(data)
	console.log(data.deal?.addNftTransfer?.[0]?.userInput)

  if (Array.isArray(data)) // todo check upstream shape
    data = data[0]

  const deal = data.deal || data 

	console.log('normalisePreKatomicDeal before', deal)
	normalisePreKatomicDeal(deal) // this mutates deal
	console.log('normalisePreKatomicDeal after', deal)

	return deal
}


function normalisePreKatomicDeal(deal) {
	
	// or do this if mutating the input
	// deal.network ||= deal.header?.network
	const network = deal.network || deal.header?.network
	
  const data = {
    ...deal,
    network: deal.network || deal.header?.network,
    display: {
      title: deal.display?.title || deal.header?.dealName,
      description: deal.display?.description || deal.header?.dealDescription
    },
		
		// ensure modern-safe defaults
    alias: deal.alias || {},
    parameters: deal.parameters || {},
    addHbarTransfer: deal.addHbarTransfer || [],
    addTokenTransfer: deal.addTokenTransfer || [],
    addNftTransfer: deal.addNftTransfer || []
		
  }

	// deepFreeze(data)  // detect mutation when 'use strict'
	// return buildTransferNarratives(data)  //same .. output mutates input
	// buildTransferNarratives(data)  // builds narrative, but cheats and uses userInput where available
	
	return data

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
  const url = `https://kpos.uk/deal/query/?legacy=1&format=json&${query}`

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
  const parts = productId.split(';')
	const tokenPart = parts[1] || ''
	let [tokenId, serialFromTo] = tokenPart.split('-')
	serialFromTo = (serialFromTo || '').replace(':', 'to')
  //kfund/kpos has serial range stored to separator "to"
  serialFromTo = serialFromTo.replace(':', 'to')

  return {
    network: parts[0],
    tokenId: tokenId,
    serial: serialFromTo,
    sender: parts[2] || ''
  }
}

function zzsimpler_splitProductId(productId) {
  const parts = productId.split(';')
  let [tokenId, serialFromTo] = parts[1].split('-')
  // const [serialFrom, serialTo] = serialFromTo.split(':')
  
  //kfund/kpos has serial range stored to separator "to"
  serialFromTo = serialFromTo.replace(':', 'to')

  return {
    network: parts[0],
    tokenId: tokenId,
    serial: serialFromTo,
    sender: parts[2]
  }
}

	// ┌┬┐┬─┐┌─┐┌┐┌┌─┐┌─┐┌─┐┬─┐┌┬┐  ┌┬┐┌─┐┌┬┐┌─┐
	//  │ ├┬┘├─┤│││└─┐├┤ │ │├┬┘│││   ││├─┤ │ ├─┤
	//  ┴ ┴└─┴ ┴┘└┘└─┘└  └─┘┴└─┴ ┴  ─┴┘┴ ┴ ┴ ┴ ┴
	// transform data

async function transformDealData({deal}) {  
    console.log({deal})

    let out = {}
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



function mergeAllTransfers(deal) {
  

  const normaliseHbar = xfer => {
    const amount = xfer.value
    const abs = Math.abs(amount)
    const verb = amount < 0 ? 'sends' : 'receives'

    return {
      // ...xfer,
      assetType: 'HBAR',
      asset: 'HBAR',
      amount,
      narrative: xfer.userInput || `${xfer.accountId} ${verb} ${abs} HBAR`
    }
  }

  const normaliseFT = xfer => {
    const amount = xfer.value
    const abs = Math.abs(amount)
    const verb = amount < 0 ? 'sends' : 'receives'

    return {
      // ...xfer,
      assetType: 'FT',
      asset: xfer.tokenId,
      amount,
      narrative: xfer.userInput || `${xfer.accountId} ${verb} ${abs} ${xfer.tokenId}`,
      needsHydration: true
    }
  }

  const normaliseNFT = xfer => {
    return {
      // ...xfer,
      assetType: 'NFT',
      asset: xfer.tokenId,
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

 		const img = document.querySelector('#combo-container .ubid-media img')
		if (img)
			img.addEventListener('load', () => img.classList.remove('skeleton'), { once: true })
		
		document
			.querySelectorAll('#product-panel .skeleton:not(img)')
			.forEach(el => el.classList.remove('skeleton'))
			
		document.querySelector('#product-panel').style.display = 'block'
	
}



function renderTransfer(xfer, entityLabels) {
	console.log(xfer)  // todo build narrative from primitives
  let text = xfer.narrative ?? xfer.userInput
  text = text.replace(/\{(.*?)\}/g, "<span class='code'>$1</span>")
	
  for (const [key, value] of Object.entries(entityLabels)) {
    const link = `<a href='https://kpay.uk/${value}' target='${value}'>${key}</a>`
    const regex = new RegExp(`\\b${key}\\b`, 'g')
    text = text.replace(regex, link)
  }
  
	return  text
	// return  renderTooltip(text, 'example tooltip ' + xfer.narrative)
}

function zzrenderTransfer(xfer, entityLabels = {}) {
  const label = id => entityLabels[id] || id

  if (xfer.assetType === 'NFT') {
    const from = label(xfer.sender)
    const to = label(xfer.receiver)

    return `${from} sends NFT ${xfer.asset}#${xfer.serial} to ${to}`
  }

  const { isNegative, abs } = parseAmount(xfer.amount)
  const verb = isNegative ? 'sends' : 'receives'
  const account = label(xfer.accountId)

  if (xfer.assetType === 'HBAR') {
    return `${account} ${verb} ${abs} HBAR`
  }

  if (xfer.assetType === 'FT') {
    return `${account} ${verb} ${abs} ${xfer.asset}`
  }

	
	// renderTooltip(text, 'example tooltip ' + xfer.narrative)
	
  return 'Unknown transfer type'
}


function parseAmount(value) {
  const str = String(value).trim()

  const isNegative = str.startsWith('-')
  const abs = isNegative ? str.slice(1).trim() : str

  return {
    isNegative,
    abs
  }
}



function renderDealPanel(data) {
	  document.querySelector('#deal-panel .ubid-title').innerHTML = data.title
	  document.querySelector('#deal-panel .ubid-description').innerHTML = data.description
	  document.querySelector('#combo-container .ubid-media img').src = data.image || 'https://katomic.org/demo/defaultDealThumbnail.png'
		
		console.log(data)
		const entityLabels = data.aliasReversed || []
		console.log({entityLabels})
		console.log(data.transfers)
		document.querySelector('#deal-panel .ubid-transfers').innerHTML 
			= data.allTransfers.map(x => renderTransfer(x, entityLabels)).join('<BR>')
			// = data.allTransfers.map(x => renderTransfer(x, entityLabels)).join('<BR>')

		document.querySelector('#deal-panel .ubid-user-inputs').innerHTML = (data.parameters || []).map(renderParameter).join('')
		
	  document.querySelector('#deal-panel .ubid-asset-link').innerHTML = `#katomic <a href='https://katomic.org/labs/?dealId=${dealId}' target='_blank'>${dealId.slice(0, 6)}</a>`

		document.getElementById('create-tx').innerText = data.button
		updateButtonNowLater()
	
		const btn = document.getElementById('create-tx')
		if (btn && data.button) {
			btn.innerText = data.button
			updateButtonNowLater()
		}
		
		const img = document.querySelector('#combo-container .ubid-media img')
		if (img)
			img.addEventListener('load', () => img.classList.remove('skeleton'), { once: true })
		
		document
			.querySelectorAll('#combo-container .skeleton:not(img)')
			.forEach(el => el.classList.remove('skeleton'))
			
		document.querySelector('#deal-panel').style.display = 'block'
		// document.querySelector('#combo-panel').style.display = 'block'
		
}

async function renderRelatedDeals(productId) {
  try {
    const deals = await fetchDealsFromProduct(productId)
		console.log(deals)
		
		const elRelatedDeals = document.querySelector('#product-panel .ubid-related')
		// elRelatedDeals.innerHTML = ''
		
    for (const dealInfo of deals) {
      // fetch full deal detail
      const deal = await fetchDeal(dealInfo.dealId)
			// console.log(deal)
			
			const dealIdShort = dealInfo.dealId.slice(0,6)
			
			const href = `?dealonly&v=labs&dealId=${dealInfo.dealId}`
			const label = `${dealIdShort}`
			const tooltip = `${deal.display?.title} | ${deal.display?.description} | ${dealInfo.created?.slice(0,10)}`
			elRelatedDeals.innerHTML += renderLocalLink({href, label, tooltip})
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

  return `
    <a
      href="${href}"
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
  dealId = params.get('dealId')
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

   await renderPage()
 }

window.addEventListener('popstate', () => {
  parseSearchParams(window.location.search)
  renderPage()
})

async function renderPage() {
  parseSearchParams(window.location.search)

  // reset entire UI state
  document.querySelector('#combo-container .ubid-media img').src = ""
  document.querySelectorAll('.skeleton').forEach(el => el.classList.add('skeleton'))

  document.querySelector('#product-panel').style.display = 'none'
  document.querySelector('#deal-panel').style.display = 'none'

  document.querySelector('#product-panel .ubid-related').innerHTML = 'Related deals '
  document.querySelector('#deal-panel .ubid-transfers').innerHTML = ''
  document.querySelector('#deal-panel .ubid-user-inputs').innerHTML = ''

  const entityType = resolveEntityType(productId, dealId)

  let raw = {}

  if (entityType === 'deal') {
    raw.deal = await fetchDeal(dealId)
    const processed = await transformDealData(raw)
    renderDealPanel(processed)
  }

  if (entityType === 'product') {
    raw.product = await fetchProduct(productId)
    const processed = await transformProductData(raw)
    renderProductPanel(processed)
    renderRelatedDeals(productId)
  }
}



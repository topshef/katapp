// ╔═╗╔═╗  ┬  ┌─┐┌┐ ┌─┐  
// ║ ║║ ╦  │  ├─┤├┴┐└─┐  
// ╚═╝╚═╝  ┴─┘┴ ┴└─┘└─┘  
// OG labs 2024

// wip refactoring the og gomint ui
// https://github.com/topshef/phpjabbers/issues/50
// could also be moved to hootstrap

// it was called ubid as was gonna refactor towards that
// but for ubid we're tunnelling from a clean start
// see /m/bid/index.ph
// https://github.com/topshef/phpjabbers/issues/48
// however there is lots of ref to ubid below due to that intention




// ┌─┐┌─┐┌┬┐┌─┐┬ ┬╔╦╗┌─┐┌┬┐┌─┐
// ├┤ ├┤  │ │  ├─┤ ║║├─┤ │ ├─┤
// └  └─┘ ┴ └─┘┴ ┴═╩╝┴ ┴ ┴ ┴ ┴
// fetchData
function fetchData(productId, dealId) {
  return Promise.all([fetchProduct(productId), fetchDeal(dealId)])
    .then(([product, deal]) => ({ product, deal })) // Return an object with both product and deal
}

function zz_longer_fetchData(productId, dealId) {
  console.log('fetchData called with', productId, dealId)

  return Promise.all([
    fetchProduct(productId),
    fetchDeal(dealId)
  ])
    .then(([product, deal]) => {
      console.log('fetchData results', { product, deal })
      return { product, deal }
    })
    .catch(err => {
      console.error('fetchData failed', err)
      throw err
    })
}

// ┌─┐┌─┐┌┬┐┌─┐┬ ┬╔═╗┬─┐┌─┐┌┬┐┬ ┬┌─┐┌┬┐
// ├┤ ├┤  │ │  ├─┤╠═╝├┬┘│ │ │││ ││   │ 
// └  └─┘ ┴ └─┘┴ ┴╩  ┴└─└─┘─┴┘└─┘└─┘ ┴ 
// fetchProduct
function zzfetchProduct(productId) {
  return productId
    ? fetch(`https://tools.gomint.me/explore/NFT/?json&productId=${productId}`)
    .then(response => response.json())
    : Promise.resolve(null)
}

function zzdummy_fetchProduct(productId) {
  if (!productId) return Promise.resolve(null)

  // expected format: network;tokenId-serial;owner
  const parts = productId.split(';')
  const network = parts[0] || 'unknown'
  const [tokenId, serial] = (parts[1] || '').split('-')

  return Promise.resolve({
    token_instance_name: `Test NFT ${tokenId || ''} #${serial || ''}`.trim(),
    token_instance_description: `Placeholder description for ${network} ${tokenId || ''}${serial ? `-${serial}` : ''}`,
    token_asset_image_URL: `https://placehold.co/600x600?text=${encodeURIComponent(tokenId || 'NFT')}`
  })
}


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
function zzfetchDeal(dealId) {
  return dealId
    ? fetch(`https://kpos.uk/deal/query/?dealId=${dealId}`).then(response => response.json())
    : Promise.resolve(null)
}

async function fetchDeal(dealId) {
  if (!dealId) return null

  const response = await fetch(`https://kpos.uk/deal/query/?dealId=${dealId}`)
  let data = await response.json()
	console.log(data)

  if (Array.isArray(data))
    data = data[0]

  const deal = data.deal || data
	console.log(deal)
	const out = deal.header
    ? normalisePreKatomicDeal(deal)
    : deal
  console.log(out)
	return out
}


function normalisePreKatomicDeal(deal) {
  const { dealName, dealDescription, network } = deal.header

  const data = {
    ...deal,
    network,
    display: {
      title: dealName,
      description: dealDescription
    },
		
		// ensure modern-safe defaults
    alias: deal.alias || {},
    parameters: deal.parameters || {},
    addHbarTransfer: deal.addHbarTransfer || [],
    addTokenTransfer: deal.addTokenTransfer || [],
    addNftTransfer: deal.addNftTransfer || []
		
  }
	
	// return buildTransferNarratives(data)  //same .. output mutates input
	buildTransferNarratives(data)  // this is kinda enrichment.. consider putting in different Function
																	// katomic outputs userInput whereas this reverses it.. so naming isn't accurate
																	// consider intent and .kat mime type rules for katomic
	return data

}

function buildTransferNarratives(deal) {
	const network = deal.network
	
  const buildHbar = xfer => {
    const amount = Number(xfer.value)
    const abs = Math.abs(amount)
    const verb = amount < 0 ? 'sends' : 'receives'

    xfer.assetType = 'HBAR'
    xfer.asset = 'HBAR'
    xfer.userInput = `${xfer.accountId} ${verb} ${abs} HBAR`
  }

  const buildFT = xfer => {
    const amount = Number(xfer.value)
    const abs = Math.abs(amount)
    const verb = amount < 0 ? 'sends' : 'receives'
		
		// do this later as async that swaps the dom values.. use a class to flip
		// const tokenInfo = getTokenInfo(network, xfer.tokenId)
		// const tokenInfo = await getTokenInfo(network, xfer.tokenId)
		// console.log(tokenInfo)
		
    xfer.assetType = 'FT'
    xfer.asset = xfer.tokenId
    xfer.userInput = `${xfer.accountId} ${verb} ${abs} ${xfer.tokenId}`
		xfer.needsHydration = true
  }

  const buildNFT = xfer => {
    xfer.assetType = 'NFT'
    xfer.asset = xfer.tokenId
    xfer.userInput = `${xfer.sender} sends NFT ${xfer.tokenId}#${xfer.serial} to ${xfer.receiver}`
  }

  ;(deal.addHbarTransfer || []).forEach(buildHbar)
  ;(deal.addTokenTransfer || []).forEach(buildFT)
  ;(deal.addNftTransfer || []).forEach(buildNFT)

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
    
    */
    
    
// ┌─┐┌─┐┌┬┐┌─┐┬ ┬╔╦╗┌─┐┌─┐┬  ┌─┐
// ├┤ ├┤  │ │  ├─┤ ║║├┤ ├─┤│  └─┐
// └  └─┘ ┴ └─┘┴ ┴═╩╝└─┘┴ ┴┴─┘└─┘
// fetchDeals    
//on hold    
function zz_hold_fetchDeals(params) {
    
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

// ┌─┐┬─┐┌─┐┌─┐┌─┐┌─┐┌─┐╔╦╗┌─┐┌┬┐┌─┐
// ├─┘├┬┘│ ││  ├┤ └─┐└─┐ ║║├─┤ │ ├─┤
// ┴  ┴└─└─┘└─┘└─┘└─┘└─┘═╩╝┴ ┴ ┴ ┴ ┴
// processData
// combine product vs deals
async function processData({ product, deal }) {  // todo split so we dont handle both deals and products(assets) in one
    const dealonly = isFlagSet('dealonly')

    if (dealonly && product)
      return console.log('KR37432 dont supply productId if presenting dealonly') || false

    console.log("product=", product)
    console.log("deal=", deal)
    console.log("dealonly=", dealonly)
    
    // handle case if productId supplied but no deal
    // ie discover deals related to that product (token)
    if (!deal && !dealonly) {
        // lookup deals associated with this product
        // const deals = await fetchDealsFromProduct({format: 'json', productId: productId, 'detail':1})
        //keep it simple OG for now
        const deals = await fetchDealsFromProduct(productId)
        console.log(deals)
        // deal = deals[0].deal
				deal = deals?.[0]?.deal

        console.log("deal=", deal)
    }

    // in the OG gomint, if product was not set we defaulted by looking it up
    // but thinking afresh maybe best not to have any user-driven focus on a single product
    // if we want to highlight a particular product as part of a deal, then set the deal parameters accordingly (title desc thumbnail etc)
    // gomint can still separately detail the contents of the deal 
    // for simple OG deals this can still look like a regular product sale
    // but for multiasset it can present as a kind of bundle or proposal


    deal = deal?.deal || deal
    console.log("deal is now=",deal) // todo align input format of deal object

    let ubid = {}
    ubid.transfers = []
    ubid.title = product?.token_instance_name ?? deal.display.title ?? 'untitled RH45323'
    ubid.description = product?.token_instance_description ?? deal.display.description ?? 'no desc WK83843'
    ubid.image = product?.token_asset_image_URL ?? deal.display.thumbnail ?? ''
		ubid.button = deal?.display?.button || 'Buy now'

		
		if (!deal) return ubid
		
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

    ubid.user_inputs = []
    if (hasUserParameters) Object.entries(deal.parameters).forEach(([parmname, parminfo]) =>  {
        const regex = /^(.*?) \[(.*?)\] (.*)$/
        const [, parmlabel, placeholder, type] = parminfo.match(regex) || []
        if (!parmlabel) return ubid.user_inputs.push('Error HD34423') 

        const defaultValue = getParm(parmname) || ''
        const defaultAttr = defaultValue ? ` value='${defaultValue}'` : ''

        // Optionally add parameter name to the label if 'detail' is present in the URL
        let label = parmlabel
        if (isFlagSet('detail')) label += ` &nbsp<span class='code'>${parmname}</span>`

        ubid.user_inputs.push(`<div><label for='${parmname}'>${label}</label></div>
        <div><input class='user_input' type='text' id='${parmname}' placeholder='${placeholder}'${defaultAttr}></div>`)
    })



    const allTransfers = [...deal.addHbarTransfer, ...deal.addTokenTransfer, ...deal.addNftTransfer]
		console.log(allTransfers)
    allTransfers.forEach(xfer => {
        let line_item = xfer.userInput.replace(/\{(.*?)\}/g, "<span class='code'>$1</span>")

        for (const [key, value] of Object.entries(deal.alias)) {
            const link = `<a href='https://kpay.uk/${value}' target='${value}'>${key}</a>`
            const regex = new RegExp(`\\b${key}\\b`, 'g')
            line_item = line_item.replace(regex, link)
        }

        ubid.transfers.push(line_item)
    })
    
    /*
    deal.addHbarTransfer.forEach(xfer => 
        ubid.transfers.push(xfer.userInput)
    )
    
    deal.addTokenTransfer.forEach(xfer => 
        ubid.transfers.push(xfer.userInput)
    )
    
    deal.addNftTransfer.forEach(xfer => 
        ubid.transfers.push(xfer.userInput)
    )
    */
    
    console.log("ubid=", ubid)
    return ubid
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



function hydratePage(data) {
   console.log(data)
    document.getElementById('ubid-title').textContent = data.title
    document.getElementById('ubid-description').innerHTML = data.description
    document.querySelector('#ubid-media img').src = data.image


    document.getElementById('ubid-transfers').innerHTML = data.transfers.join('<BR>')


		
    document.getElementById('ubid-user-inputs').innerHTML = (data.user_inputs || []).join('<BR>')
    document.querySelectorAll('.user_input').forEach(input => {
        input.addEventListener('input', () => setParm(input.id, input.value)) //save to url
    })

		document.getElementById('starttime')?.addEventListener('input', updateButtonNowLater)


		if (dealId) {
			// const dealIdshort = dealId.slice(0, 6)
			document.getElementById('ubid-asset-link').innerHTML = `#katomic <a href='https://katomic.org/labs/?dealId=${dealId}' target='_blank'>${dealId.slice(0, 6)}</a>`
															
		} else if (productId) {
			document.getElementById('ubid-asset-link').innerHTML = `Hedera <a href='https://tools.gomint.me/explore/NFT/?productId=${productId}' target='_blank'>${productId.replaceAll(';', ' | ')}</a>`
		}

	
		document.getElementById('create-tx').innerText = data.button
		updateButtonNowLater()
	
		const btn = document.getElementById('create-tx')
		if (btn && data.button) {
			btn.innerText = data.button
			updateButtonNowLater()
		}
		
		// document.getElementById('deal-container')?.classList.remove('skeleton')
		// document
    // .querySelectorAll('#deal-container .skeleton')
			// .forEach(el => el.classList.remove('skeleton'))

		const img = document.querySelector('#ubid-media img')

		if (img) {
			img.addEventListener('load', () => img.classList.remove('skeleton'), { once: true })
		}

		document
			.querySelectorAll('#deal-container .skeleton:not(img)')
			.forEach(el => el.classList.remove('skeleton'))


}


async function hydrateRelatedDeals(productId) {
  try {
    const deals = await fetchDealsFromProduct(productId)

    for (const dealInfo of deals) {
      // fetch full deal detail
      const fullDeal = await fetchDeal(dealInfo.dealId)
			console.log(fullDeal)
      // process it minimally
      const ubid = await processData({ product: null, deal: fullDeal })
			console.log(ubid)
			//do nothing yet
      // append to DOM progressively
      // appendDealToPage(ubid)  //tbc
    }

  } catch (err) {
    console.error('Related deal hydration failed', err)
  }
}


async function ubid_init() {  // later export as ubid object
  try {
    const raw = await fetchData(productId, dealId)
    const processed = await processData(raw)
    hydratePage(processed)

    // 🔥 Fire-and-forget branch
    if (productId && !dealId) {
      hydrateRelatedDeals(productId) // DO NOT await
    }

  } catch (err) {
    console.error(err)
  }
}

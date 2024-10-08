
// ┬ ┬┌┐ ┬┌┬┐
// │ │├┴┐│ ││
// └─┘└─┘┴─┴┘
// ubid

// placeholder location for js code refactoring
// https://github.com/topshef/phpjabbers/issues/50

// could also be moved to hootstrap


function hasParm(name) {
  const params = new URLSearchParams(window.location.search)
  return params.has(name)
}


function getParm(name) {
  const params = new URLSearchParams(window.location.search)
  return params.get(name)
}


function setParm(name, value) {
  const url = new URL(window.location)
  url.searchParams.set(name, value)
  window.history.replaceState({}, '', url)
}

function isFlagSet(name) {
  const value = getParm(name) // null means parameter was missing
    // Missing parameter (?): isFlagSet('dealonly') → false
    // ?dealonly: isFlagSet('dealonly') → true
    // ?dealonly=1: isFlagSet('dealonly') → true
    // ?dealonly=0: isFlagSet('dealonly') → false
    // ?dealonly=false: isFlagSet('dealonly') → false
    // ?dealonly=anythingelsetruthy: isFlagSet('dealonly') → true

  return value !== null && value !== '0' && value !== 'false'
}

const productId = getParm('productId')
const dealId = getParm('dealId')

// ┌─┐┌─┐┌┬┐┌─┐┬ ┬╔╦╗┌─┐┌┬┐┌─┐
// ├┤ ├┤  │ │  ├─┤ ║║├─┤ │ ├─┤
// └  └─┘ ┴ └─┘┴ ┴═╩╝┴ ┴ ┴ ┴ ┴
// fetchData
function fetchData(productId, dealId) {
  return Promise.all([fetchProduct(productId), fetchDeal(dealId)])
    .then(([product, deal]) => ({ product, deal })) // Return an object with both product and deal
}

// ┌─┐┌─┐┌┬┐┌─┐┬ ┬╔═╗┬─┐┌─┐┌┬┐┬ ┬┌─┐┌┬┐
// ├┤ ├┤  │ │  ├─┤╠═╝├┬┘│ │ │││ ││   │ 
// └  └─┘ ┴ └─┘┴ ┴╩  ┴└─└─┘─┴┘└─┘└─┘ ┴ 
// fetchProduct
function fetchProduct(productId) {
  return productId
    ? fetch(`https://tools.gomint.me/explore/NFT/?json&productId=${productId}`)
    .then(response => response.json())
    : Promise.resolve(null)
}

// ┌─┐┌─┐┌┬┐┌─┐┬ ┬╔╦╗┌─┐┌─┐┬  
// ├┤ ├┤  │ │  ├─┤ ║║├┤ ├─┤│  
// └  └─┘ ┴ └─┘┴ ┴═╩╝└─┘┴ ┴┴─┘
// fetchDeal
// could ditch this and use kpos fetchDeals instead - though kpos is not live (db based on cron) 
// Function to fetch data for dealId or return null if dealId is not present
function fetchDeal(dealId) {
  return dealId
    ? fetch(`https://kpos.uk/deal/query/?dealId=${dealId}`).then(response => response.json())
    : Promise.resolve(null)
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
function fetchDealsFromProduct(productId) {
    const parts = splitProductId(productId)
    const query = new URLSearchParams(parts).toString()
    //kpos supports query by product id directly but not for serial range
    const url = `https://kpos.uk/deal/query/?detail&format=json&${query}`
    
    console.log("fetchDealsFromProduct url=", url)
    return fetch(url).then(response => response.json())
}

// ┌─┐┌─┐┬  ┬┌┬┐╔═╗┬─┐┌─┐┌┬┐┬ ┬┌─┐┌┬┐╦┌┬┐
// └─┐├─┘│  │ │ ╠═╝├┬┘│ │ │││ ││   │ ║ ││
// └─┘┴  ┴─┘┴ ┴ ╩  ┴└─└─┘─┴┘└─┘└─┘ ┴ ╩─┴┘
// splitProductId
function splitProductId(productId) {
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
async function processData({ product, deal }) {
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
        deal = deals[0].deal
        console.log("deal=", deal)
    }

    // in the OG gomint, if product was not set we defaulted by looking it up
    // but thinking afresh maybe best not to have any user-driven focus on a single product
    // if we want to highlight a particular product as part of a deal, then set the deal parameters accordingly (title desc thumbnail etc)
    // gomint can still separately detail the contents of the deal 
    // for simple OG deals this can still look like a regular product sale
    // but for multiasset it can present as a kind of bundle or proposal

    let ubid = {}
    ubid.title = product?.token_instance_name ?? deal?.deal?.display.title ?? 'untitled RH45323'
    ubid.description = product?.token_instance_description ?? deal?.deal?.display.description ?? 'no desc WK83843'
    ubid.image = product?.token_asset_image_URL ?? deal?.deal?.display.thumbnail ?? ''

    console.log("ubid=", ubid)
    return ubid
}


function hydratePage(data) {
   
    document.getElementById('ubid-title').textContent = data.title
    document.getElementById('ubid-description').textContent = data.description
    document.querySelector('#ubid-media img').src = data.image
  
}


function fetchDataAndHydratePage() {
  fetchData(productId, dealId)
    .then(processData) // Pass the combined { product, deal } object to processData
    .then(hydratePage) // Pass the processed data to hydratePage
    .catch(error => console.error('WJ76673 Error fetching data:', error))
}

// Trigger the main flow
fetchDataAndHydratePage()

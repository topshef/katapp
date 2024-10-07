
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

function fetchData(productId, dealId) {
  return Promise.all([fetchProduct(productId), fetchDeal(dealId)])
    .then(([product, deal]) => ({ product, deal })) // Return an object with both product and deal
}

function fetchProduct(productId) {
  return productId
    ? fetch(`https://tools.gomint.me/explore/NFT/?json&productId=${productId}`)
    .then(response => response.json())
    : Promise.resolve(null)
}

// Function to fetch data for dealId or return null if dealId is not present
function fetchDeal(dealId) {
  return dealId
    ? fetch(`https://kpos.uk/deal/query/?dealId=${dealId}`).then(response => response.json())
    : Promise.resolve(null)
}


function processData({ product, deal }) {
    const dealonly = isFlagSet('dealonly')

    if (dealonly && product)
      return console.log('KR37432 dont supply productId if presenting dealonly') || false

    console.log("product=", product)
    console.log("deal=", deal)
    console.log("dealonly=", dealonly)

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

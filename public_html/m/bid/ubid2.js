// ╦ ╦╔╗ ╦╔╦╗
// ║ ║╠╩╗║ ║║
// ╚═╝╚═╝╩═╩╝
// UBID2

// ubid1 is the other end of the tunnel.. OG refactoring.. issue #50
// though who knows this tunnel might end up somewhere else

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


// ┌─┐┌─┐┌┬┐  ╔╦╗┌─┐┬┌─┌─┐┌┐┌  ╦┌┐┌┌─┐┌─┐
// │ ┬├┤  │    ║ │ │├┴┐├┤ │││  ║│││├┤ │ │
// └─┘└─┘ ┴    ╩ └─┘┴ ┴└─┘┘└┘  ╩┘└┘└  └─┘
// get Token Info
async function getTokenInfo(network, tokenId) {
  try {
    const url = 'https://tools.gomint.me/explore/NFT/'
    const params = { json: '', network, tokenId }

    const tokenInfo = await getData(url, params, 'infinite') // cache never expires
    if (!tokenInfo) throw new Error('Failed to fetch token info')

    return tokenInfo
  } catch (error) {
    console.error('Error fetching token info:', error)
    return null // Return null or handle the error as needed
  }
}



// ┌─┐┌─┐┌┬┐  ╦ ╦┌─┐┌┬┐┌─┐┬─┐┌─┐  ╔╦╗┬┬─┐┬─┐┌─┐┬─┐  ╔╦╗┌─┐┌┬┐┌─┐
// │ ┬├┤  │   ╠═╣├┤  ││├┤ ├┬┘├─┤  ║║║│├┬┘├┬┘│ │├┬┘   ║║├─┤ │ ├─┤
// └─┘└─┘ ┴   ╩ ╩└─┘─┴┘└─┘┴└─┴ ┴  ╩ ╩┴┴└─┴└─└─┘┴└─  ═╩╝┴ ┴ ┴ ┴ ┴
// get Hedera Mirror Data
async function getHederaMirrorData(network, endpoint, queryObject) {
  try {
    // Construct the base URL based on the network
    const baseUrl = network === 'mainnet' 
      ? 'https://mainnet-public.mirrornode.hedera.com/api/v1/' 
      : 'https://testnet.mirrornode.hedera.com/api/v1/'

    const data = await getData(`${baseUrl}${endpoint}`, queryObject, 30)
    if (!data) throw new Error('Failed to fetch data')

    return data
  } catch (error) {
    console.error('Error fetching Hedera mirror data:', error)
    return null // Return null or handle the error as needed
  }
}




// ┬┌─┐┌┐┌┌─┐┬─┐┌─┐  ╦ ╦┌─┐┌┬┐┌─┐┬─┐┌─┐  ╔═╗┌─┐┌─┐┌─┐┬ ┬┌┐┌┌┬┐┌─┐
// ││ ┬││││ │├┬┘├┤   ╠═╣├┤  ││├┤ ├┬┘├─┤  ╠═╣│  │  │ ││ ││││ │ └─┐
// ┴└─┘┘└┘└─┘┴└─└─┘  ╩ ╩└─┘─┴┘└─┘┴└─┴ ┴  ╩ ╩└─┘└─┘└─┘└─┘┘└┘ ┴ └─┘
// ignore Hedera Accounts
function ignoreHederaAccounts(xfers) {
    return xfers.filter(line => {
        const accountNumber = parseInt(line.account.split('.')[2])
        const isHederaAccount = accountNumber < 100 || line.account === '0.0.800'
        return !isHederaAccount
    })
}



//todo refactor..
async function fetchNftTransfers({ tokenId, sender, receiver, serialNumber }) {
    const params = {
        network,
        size: 5
      }
      
      if (tokenId) params.tokenId = tokenId
      if (sender) params.sender = sender
      if (receiver) params.receiver = receiver
      if (serialNumber) params.serialNumber = serialNumber

      const data = await getData('./api/nft/transfers', params, 30)
      console.log(data)

  
    const container = document.createElement('div')
    container.className = 'container mt-4'
    for (const item of data.data)  { //data.data.forEach(item => {
        
        
      const tokenInfo = await getTokenInfo(network, `${item.tokenId}-${item.serialNumber}`)
      console.log(`getTokenInfo ${network} ${item.tokenId}-${item.serialNumber}`, tokenInfo)
      const txids = convertTxId(item.transactionId)
      if (!txids) {
          console.log(`skipping ${item.transactionId} as failed to convert`)
          continue
      }
      console.log(`converting txid ${item.transactionId}`,txids)

      const txns = await getHederaMirrorData(network, `transactions/${txids.hyphen}`)
      if (!txns) continue
      
      const tx = txns.transactions[0]
      let hbarXfers = ignoreHederaAccounts(tx.transfers)
      let senderHbarXfers = hbarXfers.filter(line => line.amount < 0)
      let mainSenderXfer = senderHbarXfers.sort((a, b) => a.amount - b.amount)[0]
      const price = Math.abs(mainSenderXfer.amount / 100000000).toFixed(4)
      const unit = 'hbar'
      console.log("mainSenderXfer=", mainSenderXfer)

      // todo expand to FT and generally to pricing algorithm based on historic data
      // let ftXfers = ignoreHederaAccounts(tx.token_transfers)
      // let senderFtXfers = ftXfers.filter(line => line.value < 0)
      // let mainSenderFtXfer = senderFtXfers.sort((a, b) => a.value - b.value)[0]
      // console.log("mainSenderFtXfer=", mainSenderFtXfer)

      const memo = atob(tx.memo_base64)
      

      
      const urlExploreNFT = `https://hashscan.io/${network}/token/${item.tokenId}/${item.serialNumber}`
      
      const urlExploreTx = `https://hashscan.io/${network}/transaction/${tx.consensus_timestamp}`
      
      //💱🔄🪙
      
      const delaySeconds = '90 secs' 
      const dealId = '087e095b465c65d91c58cd224b71d94dad8ea260d06f74597fd5433b9be7e812'
      const seller = item.receiver // ie the past person to receive it - we coudl check this
      const bid_amount = price * 1.05 // 5% more example
      
      const shopDomain = (network == 'testnet') ? 'dev4.shop.gomint.me' : 'shop.gomint.me'
      const bidUrl = `https://${shopDomain}/m/?dealonly=&dealId=${dealId}&v=labs&detail=&serial=${item.serialNumber}&seller=${seller}&bid_amount=${bid_amount}&tokenId=${item.tokenId}&starttime=${delaySeconds}`
      
      console.log(`bidUrl=${bidUrl}`)
      
      
      
      const card = document.createElement('div')
      card.className = 'card mb-3'
      const cardBody = document.createElement('div')
      cardBody.className = 'card-body'
      cardBody.innerHTML = `
        <p class="card-text">#️⃣   <a href='${urlExploreTx}' target='${tx.transaction_id}'>${tx.transaction_id}</a></p>
        <p class="card-text">🕘 ${item.consensusTime}</p>
        <p class="card-text">📝 ${memo}</p>
        <p class="card-text">💳 ${item.sender} → ${item.receiver}</p>
        <p class="card-text">🖼️ ${item.tokenId}#${item.serialNumber}</p>
        <p class="card-text">🪙 ${price} ${unit}</p>
        <p class="card-text">🔨 <a href='${bidUrl}' target='_blank'>Bid ${bid_amount} ${unit}</a></p>
        <span class="card-text"><a href='${urlExploreNFT}' target='${network}-${item.tokenId}'><img src='${tokenInfo.token_asset_image_URL}' height='100px'></a>
        </span>
        
      `
      card.appendChild(cardBody)
      container.appendChild(card)
    }
    document.body.appendChild(container)

}




// ┌─┐┌─┐┌┐┌┌─┐┬─┐┌─┐┌┬┐┌─┐  ╔═╗┌─┐┌─┐┬ ┬┌─┐  ╦╔═┌─┐┬ ┬
// │ ┬├┤ │││├┤ ├┬┘├─┤ │ ├┤   ║  ├─┤│  ├─┤├┤   ╠╩╗├┤ └┬┘
// └─┘└─┘┘└┘└─┘┴└─┴ ┴ ┴ └─┘  ╚═╝┴ ┴└─┘┴ ┴└─┘  ╩ ╩└─┘ ┴ 
// generate Cache Key
// Helper to generate a unique cache key based on the URL and parameters
function generateCacheKey(url, params) {
  return `${url}?${new URLSearchParams(params).toString()}`
}

// ┌─┐┌─┐┌┬┐  ╔═╗┬─┐┌─┐┌┬┐  ╔═╗┌─┐┌─┐┬ ┬┌─┐
// │ ┬├┤  │   ╠╣ ├┬┘│ ││││  ║  ├─┤│  ├─┤├┤ 
// └─┘└─┘ ┴   ╚  ┴└─└─┘┴ ┴  ╚═╝┴ ┴└─┘┴ ┴└─┘
// get From Cache
// Get cached data if available, and recent enough
async function getFromCache(url, params, expirySeconds = 'infinite') {
  const key = generateCacheKey(url, params)
  const record = await db.collection('apiCache').doc(key).get()
  
  if (!record) return null
  if (!record.data) return null

  console.log(`🗄️ cache from ${url}`, record)
  
  if (expirySeconds === 'infinite') return record.data
  const ageSeconds = (Date.now() - record.timestamp) / 1000
  if (ageSeconds > expirySeconds) return null

  return record.data
}

// ┌─┐┌─┐┬  ┬┌─┐  ╔╦╗┌─┐  ╔═╗┌─┐┌─┐┬ ┬┌─┐
// └─┐├─┤└┐┌┘├┤    ║ │ │  ║  ├─┤│  ├─┤├┤ 
// └─┘┴ ┴ └┘ └─┘   ╩ └─┘  ╚═╝┴ ┴└─┘┴ ┴└─┘
// save To Cache
async function saveToCache(url, params, data) {
  const key = generateCacheKey(url, params)
  await db.collection('apiCache').doc(key).set({ url, params, data, timestamp: Date.now() })
}

// ┌─┐┌─┐┌┬┐  ╔╦╗┌─┐┌┬┐┌─┐
// │ ┬├┤  │    ║║├─┤ │ ├─┤
// └─┘└─┘ ┴   ═╩╝┴ ┴ ┴ ┴ ┴
// get Data
async function getData(url, params, expirySeconds = 0) {
  if (expirySeconds) {
    const cachedData = await getFromCache(url, params, expirySeconds)
    if (cachedData) return cachedData
  }
  // Make the API call if cache not available or expired
  
  const response = await fetch(`${url}?${new URLSearchParams(params)}`)
  const data = await response.json()
  console.log(`⚡ live call to ${url}`, data)
  if (data) await saveToCache(url, params, data)
  return data
}





// ┌─┐┬ ┬┌─┐┌─┐  ╔═╗┬┬─┐┌─┐┌┬┐  ╔╦╗┌─┐┌┬┐┌─┐┬ ┬
// └─┐│││├─┤├─┘  ╠╣ │├┬┘└─┐ │   ║║║├─┤ │ │  ├─┤
// └─┘└┴┘┴ ┴┴    ╚  ┴┴└─└─┘ ┴   ╩ ╩┴ ┴ ┴ └─┘┴ ┴
// swap First Match
function swapFirstMatch(str, swaps) {
    for (let { find, replace } of swaps)
        if (find.test(str))
            return str.replace(find, replace)
    return str
}


//todo tidy..
// ┌─┐┌─┐┌┐┌┬  ┬┌─┐┬─┐┌┬┐  ╔╦╗─┐ ┬  ╦┌┬┐
// │  │ ││││└┐┌┘├┤ ├┬┘ │    ║ ┌┴┬┘  ║ ││
// └─┘└─┘┘└┘ └┘ └─┘┴└─ ┴    ╩ ┴ └─  ╩─┴┘
// convert Tx Id
// copied from php explore.hbar
function convertTxId(txid) { // input any txid and return various formats and elements
    let out = {}
    out.input = txid

    // detect numeric
    //txid = txid.replace(/^(\d)(\d)(\d+)(\d{10})(\d{9})$/, '$1.$2.$3-$4-$5')
    
    // total fudge for DG fuckup
    // reported on DG NFT transfers 005823833172962711969325840
    // missing leading zero for nanoseconds
    // correct txid 0.0.5823833-1729627119-069325840

    // txid = txid.replace(
      // /^00(\d{1,8})17(\d{8})(\d{7,9})$/,
      // (_, acct, secsRest, nanos) =>
        // `0.0.${parseInt(acct, 10)}-17${secsRest}-${nanos.padStart(9, '0')}`
    // )

//why does this not match?

//0010514021729634287739085329
//0010514021729634287739085329
//001051402
//1729634287
//739085329

    let swaps = [
        { find: /^00(\d{4})17(\d{8})(\d{9})$/, replace: '0.0.$1-17$2-$3' },
        { find: /^00(\d{5})17(\d{8})(\d{9})$/, replace: '0.0.$1-17$2-$3' },
        { find: /^00(\d{6})17(\d{8})(\d{9})$/, replace: '0.0.$1-17$2-$3' },
        { find: /^00(\d{7})17(\d{8})(\d{9})$/, replace: '0.0.$1-17$2-$3' },
        { find: /^00(\d{7})17(\d{8})(\d{8})$/, replace: '0.0.$1-17$2-0$3' },
    ]
    
    // ok until
    // Epoch time 1800000000 (10 digits)
    // This corresponds to November 15, 2027, 00:00:00 UTC.

    txid = swapFirstMatch(txid, swaps)
    
    // txid = txid.replace(
      // /^00(\d{1,8})(?=17)(17)(\d{8})(\d{7,9})$/,
      // (_, acct, seventeen, secsRest, nanos) =>
        // `0.0.${parseInt(acct, 10)}-${seventeen}${secsRest}-${nanos.padStart(9, '0')}`
    // )

    //0.0.7326527
    
    //00500820
    //1729630337
    //88953719

    let regex = /^(?<operatorId>\d+\.\d+\.\d+)[-@](?<startSeconds>\d+)[-\.](?<startNanos>\d+)$/
    let matches = txid.match(regex)

    if (!matches) return console.error("no match found HJ52399/" + txid) && false

    let { operatorId, startSeconds, startNanos } = matches.groups
    txid = `${operatorId}-${startSeconds}-${startNanos}`

    out.hyphen = `${operatorId}-${startSeconds}-${startNanos}`
    out.classic = `${operatorId}@${startSeconds}.${startNanos}`
    out.numeric = operatorId.replace(/\./g, '') + startSeconds + startNanos

    let patternHyphen = /^(\d+\.\d+\.\d+)-(\d+)-(\d+)$/
    if (patternHyphen.test(txid)) {
        out.hyphen = txid
        let [, opId, sSeconds, sNanos] = txid.match(patternHyphen)
        out.classic = `${opId}@${sSeconds}.${sNanos}`
    }

    out.operatorId = operatorId
    out.startSeconds = startSeconds
    out.startNanos = startNanos
    out.startSecondsNanos = `${startSeconds}.${startNanos}`
    out.startDateTime = new Date(parseInt(startSeconds) * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })

    return out
}
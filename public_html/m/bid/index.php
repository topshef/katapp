<!--

//tire kickign discovery

// todo demo links to eg 
//https://dev4.shop.gomint.me/m/?dealonly=&dealId=087e095b465c65d91c58cd224b71d94dad8ea260d06f74597fd5433b9be7e812&v=labs&detail=&serial=26&seller=0.0.1532&bid_amount=0.1&tokenId=0.0.3626892&starttime=40secs&node=3&operatorId=0.0.1819

reported on DG NFT transfers 005823833172962711969325840
missing leading zero for nanoseconds
correct txid 0.0.5823833-1729627119-069325840

this is retarded. there is no way to reliably decode the txid
as a fudge for now we could look for the 17 as start of seconds, which must be 10 digits



-->
<head>
<!-- Bootstrap CSS -->
<link href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" rel="stylesheet">

<!-- Optional Bootstrap JavaScript and dependencies -->
<script src="https://code.jquery.com/jquery-3.5.1.slim.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@4.5.2/dist/js/bootstrap.bundle.min.js"></script>

</head>
<script>


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

// ┌─┐┌─┐┌┬┐┌─┐┬ ┬  ╔╦╗┌─┐┬┌─┌─┐┌┐┌  ╦┌┐┌┌─┐┌─┐
// ├┤ ├┤  │ │  ├─┤   ║ │ │├┴┐├┤ │││  ║│││├┤ │ │
// └  └─┘ ┴ └─┘┴ ┴   ╩ └─┘┴ ┴└─┘┘└┘  ╩┘└┘└  └─┘
// fetch Token Info
async function fetchTokenInfo(network, tokenId) {
  try {
    const response = await fetch(`https://tools.gomint.me/explore/NFT/?json&network=${network}&tokenId=${tokenId}`)
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`)

    const tokenInfo = await response.json() // Await the response.json() call
    // console.log(tokenInfo)
    return tokenInfo
  } catch (error) {
    console.error('Error fetching token info:', error)
    return null // Return null or handle the error as needed
  }
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

// ┌─┐┌─┐┌┬┐┌─┐┬ ┬  ╦ ╦┌─┐┌┬┐┌─┐┬─┐┌─┐  ╔╦╗┬┬─┐┬─┐┌─┐┬─┐
// ├┤ ├┤  │ │  ├─┤  ╠═╣├┤  ││├┤ ├┬┘├─┤  ║║║│├┬┘├┬┘│ │├┬┘
// └  └─┘ ┴ └─┘┴ ┴  ╩ ╩└─┘─┴┘└─┘┴└─┴ ┴  ╩ ╩┴┴└─┴└─└─┘┴└─
// fetch Hedera Mirror
async function fetchHederaMirror(network, endpoint, queryObject) {
  try {
    // Construct the base URL based on the network
    const baseUrl = network === 'mainnet' 
      ? 'https://mainnet-public.mirrornode.hedera.com/api/v1/' 
      : 'https://testnet.mirrornode.hedera.com/api/v1/'
    
    // Add query parameters if provided
    const queryParams = queryObject 
      ? '?' + new URLSearchParams(queryObject).toString() 
      : ''
    
    //console.log(`fetchHederaMirror ${baseUrl}${endpoint}${queryParams}`)
    const response = await fetch(`${baseUrl}${endpoint}${queryParams}`)
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`)

    const data = await response.json()
    console.log(data)
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


const network = getParm('network') ?? 'testnet'
const tokenId = getParm('tokenId') ?? ''
const sender = getParm('sender') ?? ''
const receiver = getParm('receiver') ?? ''
const serialNumber = getParm('serialNumber') ?? ''


document.addEventListener('DOMContentLoaded', async () => {
  await fetchNftTransfers({ tokenId, sender, receiver, serialNumber })
})


// ┌─┐┌─┐┌┬┐┌─┐┬ ┬  ╔╗╔┌─┐┌┬┐  ╔╦╗┬─┐┌─┐┌┐┌┌─┐┌─┐┌─┐┬─┐┌─┐
// ├┤ ├┤  │ │  ├─┤  ║║║├┤  │    ║ ├┬┘├─┤│││└─┐├┤ ├┤ ├┬┘└─┐
// └  └─┘ ┴ └─┘┴ ┴  ╝╚╝└   ┴    ╩ ┴└─┴ ┴┘└┘└─┘└  └─┘┴└─└─┘
// fetch Nft Transfers
async function fetchNftTransfers({ tokenId, sender, receiver, serialNumber }) {
  const params = new URLSearchParams()
  params.append('network', network)
  
  // params.append('limit', 100)
  if (tokenId) params.append('tokenId', tokenId)
  if (sender) params.append('sender', sender)
  if (receiver) params.append('receiver', receiver)
  if (serialNumber) params.append('serialNumber', serialNumber)

  const response = await fetch(`./api/nft/transfers?${params.toString()}`)
  const data = await response.json()
  console.log(data)
  
    const container = document.createElement('div')
    container.className = 'container mt-4'
    for (const item of data.data)  { //data.data.forEach(item => {
        
        
      const tokenInfo = await fetchTokenInfo(network, `${item.tokenId}-${item.serialNumber}`)
      console.log(`fetchTokenInfo ${network} ${item.tokenId}-${item.serialNumber}`, tokenInfo)
      const txids = convertTxId(item.transactionId)
      if (!txids) {
          console.log(`skipping ${item.transactionId} as failed to convert`)
          continue
      }
      console.log(`converting txid ${item.transactionId}`,txids)

      const txns = await fetchHederaMirror(network, `transactions/${txids.hyphen}`)
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

/* https://testnet.dragonglass.me/hedera/apiview

query			Free text search
tokenId
* multiple values allowed
Fetch NFT transfersfor given token Id
serialNumber
* multiple values allowed
Fetch NFT tranfers for given serial Number
sender
* multiple values allowed
Fetch NFT tranfers from account
receiver
* multiple values allowed
Fetch NFT tranfers to account
*/




</script>
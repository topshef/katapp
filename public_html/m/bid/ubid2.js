// ╦ ╦╔╗ ╦╔╦╗
// ║ ║╠╩╗║ ║║
// ╚═╝╚═╝╩═╩╝
// UBID2

// ubid1 is the other end of the tunnel.. OG refactoring.. issue #50
// though who knows this tunnel might end up somewhere else



// ╔╦╗╦  ╦╔═╗  ┌─┐┌─┐┌┐┌┌┬┐┬─┐┌─┐┬  
// ║║║╚╗╔╝║    │  │ ││││ │ ├┬┘│ ││  
// ╩ ╩ ╚╝ ╚═╝  └─┘└─┘┘└┘ ┴ ┴└─└─┘┴─┘
// MVC control

// todo contiunue refactor
// top level concept of "possibility" card to be a product (ft or nft), not a tx
//hmm maybe not see below earth **
// tx exist to provide first simplest suggestion for a product offering 
// on basis that nfts that are currebtly trading have active users
// but refactor to generate a pool of products instead
// use tx to populate this product pool, both directly as products found in the tx
// but also indirectly via products that the participating users are holding ***
// This is early stage inference discovery on needs and wants of users
// later put in other feedback loops

// create a localbase of products? pulled from apiCache? if adding metadata to apicache eg tokens, account etc as array so cache can be mined
// later feedback what other users are searching, possibly sync cache info torrent Style

// ** but back to earth.. maybe keep the square cards as confirmed tx
// and animiated bubbles as future dated tx
// to create a new bubble, user clicks on existing tx
// popup with suggested new tx, but user can alter to suit, sign and add to kpool

// *** this could also be a better way around the DG nanos fuckup,
// eg just ignore the bullshit DG txid and instead use the sender receiver to query regular tx
// from hedera mirror, and we scoop up the nft transfers as a subset of these
// we could anyway refactor to have background processes async spider scrape from the users starting query


const displayedImages = []  // maintain array to avoid duplicates

async function initUbid() {

    // populate page by loading recent NFT transfers
    // see above ideas on extending this

    // Fetch NFT Transfers and Render Them Using View Functions

    initModal()
    

    // Define allowed parameters
    const allowedParms = 'network query tokenId serialNumber sender receiver transferAfter transferBefore from size sortOn sortBy'.split(' ') //https://app.dragonglass.me/hedera/apiview
    // transferAfter 2017-01-01T01:01:00.00Z
    //sortOn	consensusTime	token, serialNumber,consensusTime,transactionId	field on which the response will be sorted

    // Create URLSearchParams from window location
    const urlParams = new URLSearchParams(window.location.search)

    // Default values for specific parameters
    const defaultValues = {
        network: 'testnet',
        size: 5
    }

    // Create the params object by iterating over allowed parameters
    const params = {}
    allowedParms.forEach(parm => {
        const value = urlParams.get(parm) ?? defaultValues[parm] ?? ''
        if (value) params[parm] = value
    })

    network = params.network


  try {
    const result = await getData('./api/nft/transfers', params, 30)
    console.log('🔵ℹ️ ./api/nft/transfers', { params, result })

    const nftXfers = result.data  // nft transfers only
    
    const container = document.createElement('div')
    container.className = 'ubid-container'
    document.body.appendChild(container)

    // Process each tx and render as it loads
    nftXfers.forEach((nftXfer) => {
      // const cardBody = renderLoadingCard(container) // Render loading state

      processTx(nftXfer)
        .then(processedItem => {
          processedItem 
            ? renderItemCard(container, processedItem) 
            : console.warn(`Failed to process ${nftXfer.tokenId}-${nftXfer.serialNumber}`)
        })
        .catch(error => {
          console.error('Error processing nftXfer', error)
          renderErrorCard(cardBody)
        })
    })
  } catch (error) {
    console.error('Error fetching NFT transfers:', error)
  }
}


// Process each tx to prepare data for rendering
async function processTx(nftXfer) {
  try {
      // some issues tbc
    const expirySeconds = 0
    const tokenSerial = `${nftXfer.tokenId}-${nftXfer.serialNumber}`
    // const tokenInfoGoMint = await getTokenInfoFromGoMint(network, tokenSerial, expirySeconds)
    // console.log(`getTokenInfo ${network} ${tokenSerial}`, tokenInfo);
    // const urlImage = tokenInfoGoMint.token_asset_image_URL ?? 'https://tse4.mm.bing.net/th?id=OIP.CIKnUJBqUdu87khXGAyLVgHaHa&pid=Api'
    // const urlImage = tokenInfoGoMint.token_thumbnail_cache ?? tokenInfoGoMint.token_asset_image_URL ?? 'https://tse4.mm.bing.net/th?id=OIP.CIKnUJBqUdu87khXGAyLVgHaHa&pid=Api'
    

    const token_class = await getHederaMirrorData(network, `tokens/${nftXfer.tokenId}`)
    const token_instance = await getHederaMirrorData(network, `tokens/${nftXfer.tokenId}/nfts/${nftXfer.serialNumber}`)
    const metadata = atob(token_instance.metadata)
    
    let dataIPFS = await IPFS_cache.processMetadataFromIPFS(metadata)
    console.log('dataIPFS=', dataIPFS)
    
    const urlImage = dataIPFS?.imgSrc
        || getImageUrlFromGoMint(network, tokenSerial)
        || 'https://tse3.mm.bing.net/th?id=OIP.51wVQMynr7Zxo56CVLbwpQHaHa&pid=Api'
    
    
    const imageKey = dataIPFS?.ipfsAddress || urlImage
    console.log('imageKey=', imageKey)
    
    const isAlreadyDisplayed = displayedImages.includes(imageKey)
    if (isAlreadyDisplayed) return console.log(`already displayed ${tokenSerial}`) && false
        //todo maybe push the market info to an array for pricing assistance
        
    displayedImages.push(imageKey)
        
    // imgElement.src = dataIPFS.imgSrc
    
    
    // const currentOwner = token_instance.account_id // this shoudl match receiver of last tx
    // const urlMetadata = convertToPinataUrl(metadata)
    // const metadataExpanded = await getData(urlMetadata, {},'infinite')
    // const urlImage = metadataExpanded.image
    // const tokenInfo = {token_class, token_instance, metadata, urlMetadata, metadataExpanded}
    // console.log("🔵ℹ️ tokenInfo=", {urlImage, tokenInfo, tokenInfoGoMint})
    //"ipfs://bafybeihgsfwlhdfwnqztmgyjimjfpbfbya63kza46f42xsxtxa7sc7ct5m/3308.json"
    
    const txids = convertTxId(nftXfer.transactionId);
    if (!txids) {
      console.log(`Skipping ${nftXfer.transactionId} as failed to convert`);
      return null;
    }
    console.log(`Converting txid ${nftXfer.transactionId}`, txids);

    const txns = await getHederaMirrorData(network, `transactions/${txids.hyphen}`)
    if (!txns) return null;

    const tx = txns.transactions[0];
    const hbarXfers = ignoreHederaAccounts(tx.transfers);
    const senderHbarXfers = hbarXfers.filter((line) => line.amount < 0);
    const mainSenderXfer = senderHbarXfers.sort((a, b) => a.amount - b.amount)[0];
    const price = Math.abs(mainSenderXfer.amount / 100000000).toFixed(4);
    const unit = 'hbar';
    console.log('mainSenderXfer=', mainSenderXfer);

    const memo = atob(tx.memo_base64);

    const urlExploreNFT = `https://hashscan.io/${network}/token/${nftXfer.tokenId}/${nftXfer.serialNumber}`;
    const urlExploreTx = `https://hashscan.io/${network}/transaction/${tx.consensus_timestamp}`;

    const delaySeconds = '90 secs';
    
    const dealId = (network == 'mainnet')
    ? '5f07af91960ac463e652c5ff0521b66d8017aff3c237718ce570d14d2b65028a'
    : '087e095b465c65d91c58cd224b71d94dad8ea260d06f74597fd5433b9be7e812'
    const seller = nftXfer.receiver; // The previous receiver
    
    const bid_amount = (price * 1.05).toFixed(4); // Example: 5% more

    const shopDomain = network === 'testnet' ? 'dev4.shop.gomint.me' : 'shop.gomint.me';
    const bidUrl = `https://${shopDomain}/m/?dealonly=&dealId=${dealId}&v=labs&detail=&serial=${nftXfer.serialNumber}&seller=${seller}&bid_amount=${bid_amount}&tokenId=${nftXfer.tokenId}&starttime=${delaySeconds}`;

    console.log(`bidUrl=${bidUrl}`);

    return {
      last_tx: {...nftXfer, txids},
      // tx,
      urlImage,
      // tokenInfo,
      price,
      unit,
      bidUrl,
      urlExploreNFT,
      urlExploreTx,
      memo,
      bid_amount,
      network,
    };
  } catch (error) {
    console.error('⚠️ Error processing nftXfer:', error);
    return null;
  }
}



// ╔╦╗╦  ╦╔═╗  ┌┬┐┌─┐┌┬┐┌─┐┬  
// ║║║╚╗╔╝║    ││││ │ ││├┤ │  
// ╩ ╩ ╚╝ ╚═╝  ┴ ┴└─┘─┴┘└─┘┴─┘
// MVC model



async function getImageUrlFromGoMint(network, tokenId, expirySeconds = 'infinite') {
    const tokenInfoGoMint = await getTokenInfoFromGoMint(network, tokenId, expirySeconds)
    if (!tokenInfoGoMint) return null
    const urlImage = tokenInfoGoMint.token_asset_image_URL ?? null
    if (urlImage) console.log(`image retrieved via gomint`)
    
    return urlImage
}

// get Token Info from GoMint
async function getTokenInfoFromGoMint(network, tokenId, expirySeconds = 'infinite') {
  try {
    //todo reroute or fix this endpoint
    const url = 'https://tools.gomint.me/explore/NFT/'
    // const url = 'https://gmws3.gomint.me/explore/NFT/'
    // const params = { json: '', network, tokenId, refresh: 1, thumbnail: 1 }
    const params = { json: '', network, tokenId}

    // expirySeconds = 0
    const tokenInfo = await getData(url, params, expirySeconds)
    if (!tokenInfo) throw new Error('Failed to fetch token info')

    return tokenInfo
  } catch (error) {
    console.error('Error fetching token info:', error)
    return null // Return null or handle the error as needed
  }
}

// get Hedera Mirror Data
async function getHederaMirrorData(network, endpoint, queryObject) {
  try {
    // Construct the base URL based on the network
    const baseUrl = network === 'mainnet' 
      ? 'https://mainnet-public.mirrornode.hedera.com/api/v1/' 
      : 'https://testnet.mirrornode.hedera.com/api/v1/'

    let expirySeconds = 600
    if (baseUrl.startsWith('transactions/')) expirySeconds = 'infinite' // tx are final
    
    const data = await getData(`${baseUrl}${endpoint}`, queryObject, expirySeconds)
    if (!data) throw new Error('Failed to fetch data')

    return data
  } catch (error) {
    console.error('Error fetching Hedera mirror data:', error)
    return null // Return null or handle the error as needed
  }
}


// ignore Hedera Accounts
function ignoreHederaAccounts(xfers) {
    return xfers.filter(line => {
        const accountNumber = parseInt(line.account.split('.')[2])
        const isHederaAccount = accountNumber < 100 || line.account === '0.0.800'
        return !isHederaAccount
    })
}



// ╔╦╗╦  ╦╔═╗  ┬  ┬┬┌─┐┬ ┬
// ║║║╚╗╔╝║    └┐┌┘│├┤ │││
// ╩ ╩ ╚╝ ╚═╝   └┘ ┴└─┘└┴┘
// MVC view functions


function clearContainer(container) {
  container.innerHTML = ''; // Clear all child elements
}

function renderItemCard(container, data) {
    const {
    last_tx: { tokenId, serialNumber, sender, txids, consensusTime, receiver },
    urlImage,
    price,
    unit,
    bidUrl,
    urlExploreNFT,
    urlExploreTx,
    memo,
    bid_amount,
    } = data

    const displaySender = sender === '0.0.0' ? 'mint' : sender

    const card = document.createElement('div')
    card.className = 'card mb-3'
    const cardBody = document.createElement('div')

    // Apply the 'card' class directly to 'cardBody'
    cardBody.className = 'ubid-card'
    cardBody.innerHTML = `
      <a href='${urlExploreNFT}' target='_blank'>
        <img src='${urlImage}' height='100px'>
      </a>
      <p>🖼️ ${tokenId}#${serialNumber}</p>
      <button class="show-more-button">Show more</button>
    `

    card.appendChild(cardBody)
    container.appendChild(card) 

    // Set up modal data
    const modalInfo = {
    network,
    tokenId,
    serialNumber,
    bidUrl,
    bid_amount,
    unit,
    urlExploreNFT,
    urlImage,
    txid: txids.hyphen,
    consensusTime,
    memo,
    sender: displaySender,
    receiver,
    price,
    unit,
    urlExploreTx
    }

    // Attach event listener to the "Show more" button
    cardBody.querySelector('.show-more-button').addEventListener('click', () => showModal(modalInfo))
}

/*

so now we have a modal that links to a page where you can bid,
but.. it's shit and we want to bid directly on the page, so..
we need to add in the relevant user parameter inputs directly on the modal 
minimum is just the suggested bid price as is now except we allow the user to change it
eg with a slider (5% down, no change +5% etc) or type it in
Then we need to wire in the wallet connection
we can use the existing hashconnect or new walletconnect (todo see shimanto demo etc)

then we need to add in view for all the offline tx, so that's another version of processTx but for offline (kpos.uk/pool)

at this point though we may want to further refactor

*/


// Function to update and show modal
function showModal(info) {
  const modalBody = document.getElementById('modal-body')
  modalBody.innerHTML = `
    <a href='${info.urlExploreNFT}' target='_blank'><img src='${info.urlImage}' height='100px'></a>
    
    <p class="card-text">
        <a href='${info.urlExploreNFT}' target='_blank'>🖼️ ${info.tokenId}#${info.serialNumber}</a>
    </p>
    <p class="card-text">🔨 <a href='${info.bidUrl}' target='_blank'>Bid ${info.bid_amount} ${info.unit}</a></p>
    <p class="modal-text">Last transfer:</p>
    <p class="modal-text">🆔 <a href='${info.urlExploreTx}' target='_blank'>${info.txid}</a></p>
    <p class="modal-text">🕘 ${info.consensusTime}</p>
    <p class="modal-text">📝 ${info.memo}</p>
    <p class="modal-text">💳 ${info.sender} → ${info.receiver}</p>
    <p class="modal-text">🪙 ${info.price} ${info.unit}</p>
  `
  document.getElementById('modal').style.display = 'block'
}


function initModal() {
  // Close modal when 'X' button is clicked
  const closeButton = document.querySelector('.close-button');
  const modal = document.getElementById('modal');

  if (!closeButton || !modal) {
    console.error('Modal elements not found');
    return;
  }

  closeButton.addEventListener('click', function() {
    modal.style.display = 'none';
  });

  // Close modal when clicking outside of the modal content
  window.addEventListener('click', function(event) {
    if (event.target == modal) {
      modal.style.display = 'none';
    }
  });
}


function renderErrorCard(cardBody) {
  cardBody.innerHTML = `<p>⚠️ Error loading data ref KR94852</p>`
}







// ┬ ┬┌─┐┬  ┌─┐┌─┐┬─┐┌─┐
// ├─┤├┤ │  ├─┘├┤ ├┬┘└─┐
// ┴ ┴└─┘┴─┘┴  └─┘┴└─└─┘
// helpers


/* fuckem all 
pinata especially "abusive behaviour detected"
rotate requests 
https://ipfs.io/ipfs/
https://gateway.pinata.cloud/ipfs/
https://dweb.link/ipfs/

  let cidRegex = /bafy[0-9a-zA-Z]{46,}/
  let match = input.match(cidRegex)
  if (match) {
    let cid = match[0]

*/

// swap First Match
function swapFirstMatch(str, swaps) {
    for (let { find, replace } of swaps)
        if (find.test(str))
            return str.replace(find, replace)
    return str
}

//todo tidy..
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



/* not in use
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
*/
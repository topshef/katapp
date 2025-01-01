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
const displayedNFTs = []  // for use this instead

async function initUbid() {

    // populate page by loading recent NFT transfers

    // Fetch NFT Transfers and Render Them Using View Functions

    initModal()

    // Define allowed parameters
    const allowedParms = 'days network query tokenId serialNumber sender receiver transferAfter transferBefore from size sortOn sortBy'.split(' ') // https://app.dragonglass.me/hedera/apiview

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
        const result = await getData('./api/nft/transfers', params, 20)
        console.log('🔵ℹ️ ./api/nft/transfers', { params, result })

        const nftXfers = result.data  // nft transfers only
        
        // sort not needed here - already sorted in api call, but later the cards are sorted anyway
        // nftXfers.sort((a, b) => parseFloat(toEpochSecondsNanos(b.consensusTime)) - parseFloat(toEpochSecondsNanos(a.consensusTime)))
        // console.log('🔵ℹ️ nftXfers', nftXfers)

        const container = document.createElement('div')
        container.className = 'ubid-container'
        document.body.appendChild(container)

        // Introduce a counter to track completed renderings
        let remainingCards = nftXfers.length

        // Process each tx and render as it loads
        nftXfers.forEach((nftXfer) => {

            processNFT(nftXfer)
                .then(processedItem => {
                    if (processedItem) {
                        renderItemCard(container, processedItem)
                    } else {
                        const ct_seconds_nanos = toEpochSecondsNanos(nftXfer.consensusTime)
                        console.warn(`Failed to process ${nftXfer.tokenId}-${nftXfer.serialNumber} ${ct_seconds_nanos}`)
                    }
                })
                .catch(error => {
                    console.error('Error processing nftXfer', error)
                    // renderErrorCard(cardBody) // Uncomment if you have cardBody defined
                })
                .finally(() => {
                    remainingCards--
                    if (remainingCards === 0) {
                        // All cards are rendered, now process poolTx
                        addPoolPulse()
                    }
                })
        })
    } catch (error) {
        console.error('Error fetching NFT transfers:', error)
        addPoolPulse() // Proceed to poolTx processing even if fetching NFT transfers fails
    }

    //ai fuck this but it works
    
    // Function to process poolTx and update cards
    function addPoolPulse() {
        // Load up offline tx from kpos.uk/pool
        const poolParms = { network } // Additional parameters if needed
        fetchPoolTx(poolParms)
            .then(poolTx => {
                console.log(poolTx)

                for (const txid in poolTx) {

                    const hoot = poolTx[txid].hoot
                    if (!hoot) continue
                    if (hoot.secondsRemaining < -600) continue

                    const tx = hoot.tx
                    if (!tx) continue

                    const xfer = tx._nftTransfers?.[0]
                    if (!xfer) continue

                    let tokenId = xfer.tokenId?.num?.low ?? xfer.tokenId
                    if (!tokenId) continue
                    if (tokenId == +tokenId) tokenId = `0.0.${tokenId}`

                    let serialNumber = xfer.serialNumber.low ?? xfer.serialNumber
                    console.log(`pool tx exists for ${tokenId} #${serialNumber}`)

                    // Select the card using the tokenId and serialNumber attributes
                    const card = document.querySelector(`.card[data-token-id="${tokenId}"][data-serial-number="${serialNumber}"]`)

                    if (card) {
                        card.classList.add('poolNFT') // Add the class if the card is found
                    } else {
                        console.warn(`Card not found for ${tokenId} #${serialNumber}`)
                    }
                }
            })
            .catch(error => {
                console.error('Error fetching poolTx:', error)
            })
    }

}

// Process each tx to prepare data for rendering
async function processNFT(NFT) {
    /*
      wip refactor strategy:
      move towards NFT as the process entity (not last tx)
        so we can add in other NFT sources, eg the pool itself, user prefs etc
      get trading history eg last tx separately (maybe from localbase async db)
      
      so require only NFT input info, with optional consensusTime
         get seller from the ownership info on hedera mirror
         default price blank if consensusTime not provided, for now
    
    */
    
  try {
      // some issues tbc
    // const expirySeconds = 0
    const {tokenId, serialNumber, consensusTime} = NFT  // later drop consensusTime and get trading history separately
    
    const tokenSerial = `${tokenId}-${serialNumber}`
    // const tokenInfoGoMint = await getTokenInfoFromGoMint(network, tokenSerial, expirySeconds)
    // console.log(`getTokenInfo ${network} ${tokenSerial}`, tokenInfo);
    // const urlImage = tokenInfoGoMint.token_asset_image_URL ?? 'https://tse4.mm.bing.net/th?id=OIP.CIKnUJBqUdu87khXGAyLVgHaHa&pid=Api'
    // const urlImage = tokenInfoGoMint.token_thumbnail_cache ?? tokenInfoGoMint.token_asset_image_URL ?? 'https://tse4.mm.bing.net/th?id=OIP.CIKnUJBqUdu87khXGAyLVgHaHa&pid=Api'
    

    const token_class = await getHederaMirrorData(network, `tokens/${tokenId}`)
    // console.log(`token class info for ${tokenId}`,token_class)
    const treasury = token_class.treasury_account_id  // only for ref
    
    const token_instance = await getHederaMirrorData(network, `tokens/${tokenId}/nfts/${serialNumber}`)
    const metadata = atob(token_instance.metadata)
    const owner = token_instance.account_id
    
    //arweave example: ar://AuOqbfnqunPq6khupc0EK_SDgZ526koHKUt1spsq0kw

    let fileData
    const metadataSource = inferMetadataSource(metadata)

    
    switch (metadataSource) {
        case 'arweave':
            fileData = await Arweave_cache.processMetadataFromArweave(metadata)
            break

        case 'ipfs':
            fileData = await IPFS_cache.processMetadataFromIPFS(metadata)
            
            break

        case 'kns':
            // Add code to handle KNS resolution if needed
            break
        
        case 'https':
            // fileData = await fetchJsonFromUrl(metadata)
        
            // console.log(`Regular URL detected: ${metadata}`)
            // Add code here to handle fetching data from a regular URL if needed
            break

        default:
            // console.log(`Unknown metadata source: ${metadata}`)
    }
    
    console.log(`${metadataSource} metaData=${metadata} `, fileData)

    if (!fileData) return console.log(`RH87734 could not decode metadata for ${metadataSource}`) && false
    
    const urlImage = fileData.imgSrc || fileData.image
        || 'https://tse3.mm.bing.net/th?id=OIP.51wVQMynr7Zxo56CVLbwpQHaHa&pid=Api'
        // || getImageUrlFromGoMint(network, tokenSerial)
        // || 'https://tse3.mm.bing.net/th?id=OIP.51wVQMynr7Zxo56CVLbwpQHaHa&pid=Api'
    
    
    const imageKey = fileData?.address || urlImage
    console.log('imageKey=', imageKey)


    const isNftAlreadyDisplayed = displayedNFTs.includes(tokenSerial)
    if (isNftAlreadyDisplayed) return console.log(`already displayed ${tokenSerial}`) && false
        
    displayedNFTs.push(tokenSerial)
    
    const suppressDuplicateImages = false // todo grab from url or filter options
    if (suppressDuplicateImages) {
        const isAlreadyDisplayed = displayedImages.includes(imageKey)
        if (isAlreadyDisplayed) return console.log(`already displayed ${tokenSerial}`) && false
        //todo maybe push the market info to an array for pricing assistance
    }
        
    // displayedImages.push(imageKey)
        
    // imgElement.src = fileData.imgSrc
    
    // const currentOwner = token_instance.account_id // this shoudl match receiver of last tx
    // const urlMetadata = convertToPinataUrl(metadata)
    // const metadataExpanded = await getData(urlMetadata, {},'infinite')
    // const urlImage = metadataExpanded.image
    // const tokenInfo = {token_class, token_instance, metadata, urlMetadata, metadataExpanded}
    // console.log("🔵ℹ️ tokenInfo=", {urlImage, tokenInfo, tokenInfoGoMint})
    //"ipfs://bafybeihgsfwlhdfwnqztmgyjimjfpbfbya63kza46f42xsxtxa7sc7ct5m/3308.json"
    
//  /api/v1/tokens/{tokenId}/nfts/{serialNumber}

    // let price
    let unit = 'hbar'
    
//XX1 this can be moved to a getTradingHistory type function //
// yeah this is fucked anyway, so lets move to getTradingHistory(token) 
// just disable lookup and should still display NFTs but no price
// anyway we could instead call the trading history when the user clicks to open modal 
    // price = 1  // hbar placeconst bid_amount =holder
    if (false && consensusTime) { // get price from that tx for now 
        // using a consensus time as dragonglass messes up txid by using numeric
        const ct_seconds_nanos = toEpochSecondsNanos(consensusTime)
        
        //1728994828.850519000 correct
        //1728991228.850519000 incorrect - 1 hour too early
        
        const txns = await getHederaMirrorData(network, `transactions`, {'transactiontype' : 'CRYPTOTRANSFER', 'timestamp' : ct_seconds_nanos })
        
        if (!txns) return console.log(`WP98474 no txns from getHederaMirrorData for ct ${ct_seconds_nanos}`) && false
        console.log(txns)
        const tx = txns.transactions[0]
        if (!tx) return console.log(`EY66454 no tx found for ${tokenId} #${serialNumber}`) && false
        const txid = tx.transaction_id
        const txids = convertTxId(txid)
        console.log(txids)
        
        const hbarXfers = ignoreHederaAccounts(tx.transfers);
        const senderHbarXfers = hbarXfers.filter((line) => line.amount < 0);
        const mainSenderXfer = senderHbarXfers.sort((a, b) => a.amount - b.amount)[0];
        price = Math.abs(mainSenderXfer.amount / 100000000).toFixed(4);
        
        console.log('mainSenderXfer=', mainSenderXfer);
    }
//XX1  end of shite to ditch

    // const memo = atob(tx.memo_base64)

    const dealId = (network == 'mainnet')
    ? '5f07af91960ac463e652c5ff0521b66d8017aff3c237718ce570d14d2b65028a'
    : '087e095b465c65d91c58cd224b71d94dad8ea260d06f74597fd5433b9be7e812'
    // const seller = receiver // The previous receiver
    const seller = owner
    
    // const bid_amount = (price * 1.05).toFixed(4); // Example: 5% more
    const bid_amount = 1 //  '' // work out pricing when clicking modal  //

    // const shopDomain = network === 'testnet' ? 'dev4.shop.gomint.me' : 'shop.gomint.me';


    return {

       bid: { // single line item for now
        urlImage,
        network,
        dealId,
        tokenId,
        treasury, // for display ref only
        serialNumber,
        seller,
        bid_amount, 
        unit,
        starttime: '60 secs',
        },
        history: [{consensusTime}] //
    }
  } catch (error) {
    console.error('⚠️ Error processing nftXfer:', error);
    return null;
  }
}





// ╔╦╗╦  ╦╔═╗  ┬  ┬┬┌─┐┬ ┬
// ║║║╚╗╔╝║    └┐┌┘│├┤ │││
// ╩ ╩ ╚╝ ╚═╝   └┘ ┴└─┘└┴┘
// MVC view functions


function clearContainer(container) {
  container.innerHTML = ''; // Clear all child elements
}

function renderItemCard(container, data) {
    
    // const displaySender = sender === '0.0.0' ? 'mint' : sender  //uh-oh we also need the treasury if mint
    const {network, tokenId, treasury, serialNumber, seller, urlImage} = data.bid
    

    const card = document.createElement('div')
    card.className = 'card mb-3'
    const cardBody = document.createElement('div')

    // Apply the 'card' class directly to 'cardBody' 🗂️📚
    cardBody.className = 'ubid-card'
    
    
    const consensusTimeOfLastTx = data.history[0].consensusTime
    card.setAttribute('data-consensus-time', parseFloat(toEpochSecondsNanos(consensusTimeOfLastTx)))
    
    card.setAttribute('data-token-id', tokenId)
    card.setAttribute('data-serial-number', serialNumber)
    
    const sellerIcon = (seller == treasury) ? '🏦' : '👤'
    
    cardBody.innerHTML = `
      <button class="show-more-button"><img src='${urlImage}' width='125px'></button>
      <a href='${linkToken(network, tokenId, serialNumber)}' target='_blank'>
        <p>🖼️ ${tokenId} # ${serialNumber}</p>
      </a>
      <p>🕘 ${formatLocalTime(consensusTimeOfLastTx)}</p>
      <p>${sellerIcon} ${seller}</p>
    `

    card.appendChild(cardBody)
    container.appendChild(card) 

    const urlParams = new URLSearchParams(window.location.search)
    const sortField = urlParams.get('sortField') || 'consensus-time'
    const sortOrder = urlParams.get('sortOrder') || 'desc'
    // sortCards(container, 'consensus-time', 'desc')
    sortCards(container, sortField, sortOrder)

    // Attach event listener to the "Show more" button
    cardBody.querySelector('.show-more-button').addEventListener('click', () => showModal(data))
}

/*

then we need to add in view for all the offline tx eg kpos.uk/pool

at this point though we may want to further refactor ....

*/


// Function to update and show modal
async function showModal(data) {

  console.log("showModal data", data)
  
  const {network, dealId, tokenId, serialNumber, seller, urlImage, bid_amount, unit, starttime} = data.bid

  const modalBody = document.getElementById('modal-body')
  modalBody.innerHTML = `
    <a href='${linkToken(network, tokenId, serialNumber)}' target='_blank'><img src='${urlImage}' height='250px'></a>
    
    <p class="card-text">
        <a href='${linkToken(network, tokenId, serialNumber)}' target='_blank'>🖼️ ${tokenId}#${serialNumber}</a>
    </p>
    <p>Token ID <input class='user_input' id='tokenId' value='${tokenId}'></p>
    <p>Serial <input class='user_input' id='serial' value='${serialNumber}'></p>
    <p>Seller <input class='user_input' id='seller' value='${seller}'></p>
    <p>Bid amount <input class='user_input' id='bid_amount' value='${bid_amount}'> ${unit}</p>
    <p>Strike time <input class='user_input' id='starttime' value='${starttime}'></p>
   
    
    <span id="widget-container">
        
    </span> <!-- Widget will be moved here -->
    
  `
  
  document.getElementById('dealId').value = dealId // atm this only varies by network
  const bidWidget = document.getElementById('bid-widget')
  document.getElementById('widget-container').appendChild(bidWidget) 
  
  // todo update url parms so that hashconnect bundle.js can process tx
  // also makes the modal bookmarkable
  // todo draw the high level flow and decide on ideal level for certain actions
  // eg price discovery/ suggestions/ see also etc

  // document.getElementById('bid_parameters').innerHTML = `
  // <input class='user_input' id='seller' value='${seller}'>
  // `
  
  // document.getElementById('modal').style.display = 'block'
  document.getElementById('modal').style.display = 'flex'
  
  //show existing pool tx.. 
  const poolParms = {network, tokenId, serialNumber} //noddy: '1'
  const poolTx = await fetchPoolTx(poolParms)
  console.log(poolTx)
  if (poolTx && Object.keys(poolTx).length > 0) modalBody.innerHTML += '<br>Current bids:<br>'

    for (const txid in poolTx) {
        
        const link = `/future/?network=${network}&txid=${txid}`
        
        const hoot = poolTx[txid].hoot
        const current_emoji = hoot.current_emoji
        const validStartStr = hoot.validStartStr
        const secondsRemaining = Math.round(hoot.secondsRemaining)
        let comment
        
        if (secondsRemaining < -600) continue // more than 10 mins past
        
        if (secondsRemaining < 6000) {
          let id = `rem-${tokenId}-${serialNumber}`
          comment = ` [<span id="${id}" data-secs="${secondsRemaining}">${formatSecondsRemaining(secondsRemaining)}</span>]`
          modal.dataset.timerId = manageModalTimer(secondsRemaining, id)
        }
        
        // Create a link element
        const linkElement = document.createElement('a')
        linkElement.href = link
        linkElement.innerHTML = `${current_emoji} ${validStartStr} ${comment}`
        linkElement.target = '_blank' // Open link in a new tab

        // Append the link to the modal
        modalBody.appendChild(linkElement)

        // Optionally, add a line break for readability
        modalBody.appendChild(document.createElement('br'))


    }

 const urlParams = new URLSearchParams(window.location.search)
 if (urlParams.has('dev'))
 // urlParams.get('sortField') || 'consensus-time'
      modalBody.innerHTML += `
        <details>
            <summary>Show Data Details</summary>
            <pre>${JSON.stringify(data, null, 2)}</pre>
        </details>     
      `
  //or maybe get data globally..sdfghfjwsd
  
}


function initModal() {
  // Close modal when 'X' button is clicked
  const closeButton = document.querySelector('.close-button')
  const modal = document.getElementById('modal')

  if (!closeButton || !modal)
    return console.error('Modal elements not found') && false

  closeButton.addEventListener('click', function() {
    closeModal()  // Use closeModal function to handle button reset
  })

  // Close modal when clicking outside of the modal content
  window.addEventListener('click', function(event) {
    if (event.target == modal) 
        closeModal()
  })
}

// Function to close modal and reset button
function closeModal() {
  const modal = document.getElementById('modal')
  const bidWidget = document.getElementById('bid-widget')

  modal.style.display = 'none'
  // Move button back to the hidden parking space
  // (this keeps the bundle.js listener active)
  document.getElementById('last_tx').innerHTML = ''
  // document.getElementById('bid_parameters').innerHTML = '' // remove existing parameters
  document.getElementById('bid-widget-parked').appendChild(bidWidget)
  document.getElementById('modal-body').innerHTML = '' // remove existing modal info
  
  
  if (modal.dataset.timerId) { // not sure if this is working
    clearInterval(modal.dataset.timerId)
    delete modal.dataset.timerId // Remove the data attribute
  }
  

}


function renderErrorCard(cardBody) {
  cardBody.innerHTML = `<p>⚠️ Error loading data ref KR94852</p>`
}



// ╔╦╗╦  ╦╔═╗  ┌┬┐┌─┐┌┬┐┌─┐┬  
// ║║║╚╗╔╝║    ││││ │ ││├┤ │  
// ╩ ╩ ╚╝ ╚═╝  ┴ ┴└─┘─┴┘└─┘┴─┘
// MVC model

async function getImageUrlFromGoMint(network, tokenId, expirySeconds = 'infinite') {
    console.log(`fallback: attempt to get image via GoMint for token ${tokenId}`)
    const tokenInfoGoMint = await getTokenInfoFromGoMint(network, tokenId, expirySeconds)
    
    if (!tokenInfoGoMint)
        return console.log(`DK878374 failed to retrieve data for token ${tokenId}`) && false
    
    console.log(tokenInfoGoMint)
    const urlImage = tokenInfoGoMint.token_asset_image_URL ?? null
    if (urlImage) console.log(`image retrieved via gomint`)
    else console.log(`WY76463 failed to retrieve image for token ${tokenId}`)
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
    if (!tokenInfo)
        return console.log(`JU72663 failed to getTokenInfoFromGoMint ${url}`, params, expirySeconds) && false
        
    //throw new Error('Failed to fetch token info')

    return tokenInfo
  } catch (error) {
    console.error('Error fetching token info:', error)
    return null // Return null or handle the error as needed
  }
}

// get Hedera Mirror Data
async function getHederaMirrorData(network, endpoint, queryObject, expirySeconds = 20) {
  try {
    // Construct the base URL based on the network
    const baseUrl = network === 'mainnet' 
      ? 'https://mainnet-public.mirrornode.hedera.com/api/v1/' 
      : 'https://testnet.mirrornode.hedera.com/api/v1/'

    // let expirySeconds = 20
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



// ┬ ┬┌─┐┬  ┌─┐┌─┐┬─┐┌─┐
// ├─┤├┤ │  ├─┘├┤ ├┬┘└─┐
// ┴ ┴└─┘┴─┘┴  └─┘┴└─└─┘
// helpers


function manageModalTimer(secondsRemaining, id) {
  const intervalId = setInterval(() => {
    const el = document.getElementById(id)
    if (!el) {
      clearInterval(intervalId) // Stop timer if element is missing
      return
    }
    const currentSecs = parseInt(el.dataset.secs, 10) || 0
    if (currentSecs <= 180) {
      el.textContent = 'expired'
      clearInterval(intervalId)
      return
    }
    el.dataset.secs = currentSecs - 1
    el.textContent = formatSecondsRemaining(currentSecs - 1)
  }, 1000)
  return intervalId
}


// Generic sorter: sorts <div class="card"> children by chosen data attribute and order
function sortCards(container, dataAttr, order = 'desc') {
    const cardDivs = Array.from(container.querySelectorAll('.card'))
    cardDivs.sort((a, b) => {
        const valA = parseFloat(a.getAttribute(`data-${dataAttr}`)) || 0
        const valB = parseFloat(b.getAttribute(`data-${dataAttr}`)) || 0
        return order === 'asc' ? valA - valB : valB - valA
    })
    cardDivs.forEach(cardDiv => {
        container.appendChild(cardDiv)
    })
}


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

//https://kpos.uk/pool/?network=mainnet&noddy=1&&tokenId=0.0.878200&&serial=5428

async function fetchPoolTx(parms) {
    const baseUrl = 'https://kpos.uk/pool/'
    const queryParams = new URLSearchParams(parms).toString()
    const url = `${baseUrl}?${queryParams}`
    
    return await fetchJsonFromUrl(url) // yeah go ai finally, fuck try catch
}

async function fetchJsonFromUrl(url) {
    try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`)
        return await response.json()
    } catch (error) {
        console.error(`Failed to fetch data from ${url}:`, error)
        return null
    }
}


function inferMetadataSource(metadata) {
    const regexPatterns = [
        { type: 'arweave', pattern: /^ar:\/\/[a-zA-Z0-9_-]{43}$/ },
        { type: 'ipfs', pattern: /^ipfs:\/\/[a-zA-Z0-9]{46}(\/[\w.-]+\.json)?$/ },
        { type: 'ipfs', pattern: /^(ipfs:\/\/)?(baf[a-zA-Z0-9]{48,}|Qm[a-zA-Z0-9]{44})$/ },
        { type: 'ipfs', pattern: /^ipfs:\/\/(baf[a-zA-Z0-9]+|Qm[a-zA-Z0-9]+)(\/[\w.-]*)?$/ },
        { type: 'https', pattern: /^https:\/\/.+$/ },
        { type: 'kns', pattern: /^kns:[\w\W]+$/ }
    ]

    for (const { type, pattern } of regexPatterns)
        if (pattern.test(metadata)) return type
    
    return 'unknown'
}



function linkToken(network, tokenId, serialNumber = '') {
    return `https://hashscan.io/${network}/token/${tokenId}/${serialNumber}`
}

function linkTx(network, txid_or_consensus_timestamp) {
    return `https://hashscan.io/${network}/transaction/${txid_or_consensus_timestamp}`
}



// ┌─┐┌─┐┌┐┌┬  ┬┌─┐┬─┐┌─┐┬┌─┐┌┐┌┌─┐
// │  │ ││││└┐┌┘├┤ ├┬┘└─┐││ ││││└─┐
// └─┘└─┘┘└┘ └┘ └─┘┴└─└─┘┴└─┘┘└┘└─┘
// conversions

//cunted maybe - check data we sometimes get 1 hour out
function toEpochSecondsNanos(isoTimestamp) {
    const [seconds, nanosWithZ] = isoTimestamp.split('.')
    const nanos = nanosWithZ.slice(0, -1) // Remove the trailing 'Z'

    return `${new Date(seconds).getTime() / 1000}.${nanos}`
}

// cunted also
function zztoEpochSecondsNanos(isoTimestamp) {
    const [seconds, nanosWithZ] = isoTimestamp.split('.')
    const nanos = nanosWithZ ? nanosWithZ.slice(0, -1).padEnd(9, '0') : '000000000'

    const dateInMilliseconds = Date.parse(seconds + 'Z')
    const dateInSeconds = dateInMilliseconds / 1000

    return dateInSeconds + Number(`0.${nanos}`)
}


function formatLocalTime(isoTimestamp) {
    const [seconds] = toEpochSecondsNanos(isoTimestamp).split('.')
    const date = new Date(seconds * 1000) // Convert seconds to milliseconds
    return `${date.getDate()} ${date.toLocaleString('default', { month: 'short' })} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
}


function formatSecondsRemaining(secondsRemaining) {
    if (secondsRemaining < 0) return secondsRemaining
    const hours = Math.floor(secondsRemaining / 3600).toString().padStart(2, '0')
    const minutes = Math.floor((secondsRemaining % 3600) / 60).toString().padStart(2, '0')
    const seconds = (secondsRemaining % 60).toString().padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
}


// ┌─┐┌─┐┌┐┌┬  ┬┌─┐┬─┐┌┬┐  ╔╦╗─┐ ┬  ╦┌┬┐
// │  │ ││││└┐┌┘├┤ ├┬┘ │    ║ ┌┴┬┘  ║ ││
// └─┘└─┘┘└┘ └┘ └─┘┴└─ ┴    ╩ ┴ └─  ╩─┴┘
// convert Tx Id
function convertTxId(txid) { // input any txid and return various formats and elements
    let out = {}
    out.input = txid

    // detect numeric - note this is not reliable (see commit before this comment for ditched fudge)
    txid = txid.replace(/^(\d)(\d)(\d+)(\d{10})(\d{9})$/, '$1.$2.$3-$4-$5')

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



// swap First Match
function swapFirstMatch(str, swaps) {
    for (let { find, replace } of swaps)
        if (find.test(str))
            return str.replace(find, replace)
    return str
}



*/
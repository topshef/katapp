

// Cache-bust cache.js like every other widget module (it was the ONE bare import,
// so changes to it — e.g. the kpos timeout, OBSERV-MIRROR1 — never reached browsers).
// Top-level await is fine: this module is itself loaded via dynamic import().
const { getData } = await import(`./cache.js?v=${(typeof window !== 'undefined' && window.__BUILD_HASH__) || ''}`)



export async function getKeyInfo(network, accountId) {
	return getKeyInfoKpos(network, accountId)
	// todo replace this with local function that reads protobuf key from the mirror into we already have from getAccountInfo 
}

async function getKeyInfoKpos(network, accountId) {
	// todo consider replacing this as a local wrapper
	 try {
			// https://kpos.uk/sign/pop/getAccountInfo.php?accountId=0.0.27500&detail=1
			const url = 'https://kpos.uk/sign/pop/getAccountInfo.php'
			const detail = 1
			const params = { network, accountId, detail }
			// Account key STRUCTURE (threshold/pubkeys/Banzhaf) is stable, so cache it
			// client-side for 5 min instead of 30s — the readiness poll re-enriches keyInfo
			// every cycle, and a 30s TTL meant repeated kpos getAccountInfo.php hits (5-7.5s
			// on a cold kpos cache for testnet). Signatures come from txRead separately, so
			// this never staleness-affects who-has-signed. (WC-SLOW1 / FRONT-ENRICH1)
			// 5s timeout so a cold kpos call fails fast instead of hanging the signer ~25s;
			// on timeout fetch throws → the catch below returns null → render proceeds
			// without keyInfo (no pie/Banzhaf) rather than blocking.
			const data = await getData(url, params,  300, 5000) // note kpos has its own cache so BEWARE

			return data
		} catch (error) {
			console.error('HY83643 Error fetching data:', error)
			return null // Return null or handle the error as needed
		}
}

export async function getAccountInfo(network, accountId, expirySeconds = 20) {
  return await getHederaMirrorData(
    network,
    `accounts/${accountId}`,
    {},
    expirySeconds
  )
}

export async function getTokenInfo(network, tokenId, expirySeconds = 'infinite') {
  return await getHederaMirrorData(
    network,
    `tokens/${tokenId}`,
    {},
    expirySeconds
  )
}


// get Hedera Mirror Data
export async function getHederaMirrorData(network, endpoint, queryObject, expirySeconds = 20) {
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
export function ignoreHederaAccounts(xfers) {
    return xfers.filter(line => {
        const accountNumber = parseInt(line.account.split('.')[2])
        const isHederaAccount = accountNumber < 100 || line.account === '0.0.800'
        return !isHederaAccount
    })
}



async function zztestMirror() {
  const accountId = '0.0.27500'

  const info = await getHederaMirrorData(
    'mainnet',
    `accounts/${accountId}`,
    {},
    30
  )

  console.log('TY76465 Hedera account info:', info)
}

// zztestMirror()


import { getData } from './cache.js'


export async function getAccountInfo(network, accountId, expirySeconds = 20) {
  return await getHederaMirrorData(
    network,
    `accounts/${accountId}`,
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

zztestMirror()
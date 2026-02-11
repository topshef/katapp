


// ╦ ╦╦═╗╦    ┌─┐┌─┐┬─┐┌┬┐┌─┐
// ║ ║╠╦╝║    ├─┘├─┤├┬┘│││└─┐
// ╚═╝╩╚═╩═╝  ┴  ┴ ┴┴└─┴ ┴└─┘
// URL parms

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
  let value = getParm(name)
  if (value === null) return false
  if (value === '0') return false

	value = value.toLowerCase()
  if (value === 'false') return false
  if (value === 'off') return false

  return true
}


// ┬ ┬┌─┐┌┬┐┌─┐┬─┐┌─┐  ┌┬┐┬┬─┐┬─┐┌─┐┬─┐  ┌┬┐┌─┐┌┬┐┌─┐
// ├─┤├┤  ││├┤ ├┬┘├─┤  ││││├┬┘├┬┘│ │├┬┘   ││├─┤ │ ├─┤
// ┴ ┴└─┘─┴┘└─┘┴└─┴ ┴  ┴ ┴┴┴└─┴└─└─┘┴└─  ─┴┘┴ ┴ ┴ ┴ ┴
// hedera mirror data

async function getTokenInfo(network, tokenId, expirySeconds = 60 * 60 * 24 * 30) {
    const endpoint = getMirrorEndpoint(network)
    const url = `https://${endpoint}/api/v1/tokens/${tokenId}`

    const data = await fetchCacheData(url, expirySeconds)

    return {
        tokenId,
        name: data.name,
        symbol: data.symbol,
        decimals: data.decimals,
        totalSupply: data.total_supply
    }
}

function getMirrorEndpoint(network) {
    const map = {
        mainnet: 'mainnet-public.mirrornode.hedera.com',
        testnet: 'testnet.mirrornode.hedera.com',
        previewnet: 'previewnet.mirrornode.hedera.com'
    }

    if (!map[network]) throw new Error(`Unsupported network: ${network}`)

    return map[network]
}

async function fetchCacheData(url, expirySeconds = 120) {
    const hasStorage = typeof localStorage !== 'undefined'
    const hash = btoa(url)
    const now = Date.now()

    if (hasStorage) {
        const cachedData = localStorage.getItem(hash)

        if (cachedData) {
            const { timestamp, data } = JSON.parse(cachedData)

            if (now - timestamp < expirySeconds * 1000) {
                return data
            }
        }
    }

    const response = await fetch(url)

    if (!response.ok)
        throw new Error(`Fetch failed: ${response.status} ${response.statusText}`)

    const data = await response.json()

    if (hasStorage)
        localStorage.setItem(hash, JSON.stringify({ timestamp: now, data }))

    return data
}

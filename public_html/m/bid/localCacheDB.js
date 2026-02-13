
// ┌─┐┌─┐┌─┐┬ ┬┌─┐  ┌─┐┬ ┬┌┐┌┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
// │  ├─┤│  ├─┤├┤   ├┤ │ │││││   │ ││ ││││└─┐
// └─┘┴ ┴└─┘┴ ┴└─┘  └  └─┘┘└┘└─┘ ┴ ┴└─┘┘└┘└─┘
// cache functions

//v0.1 base version from 2025-ish at phpjabbers m/bid

// Initialize https://github.com/samuk190/localbase
let db = new Localbase('apiCache')

// generate Cache Key
// Helper to generate a unique cache key based on the URL and parameters
function generateCacheKey(url, params) {
  return `${url}?${new URLSearchParams(params).toString()}`
}

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

// save To Cache
async function saveToCache(url, params, data) {
  const key = generateCacheKey(url, params)
  await db.collection('apiCache').doc(key).set({ url, params, data, timestamp: Date.now() })
}

// get Data
async function getData(url, params, expirySeconds = 0) {
  if (expirySeconds) {
    const cachedData = await getFromCache(url, params, expirySeconds)
    if (cachedData) return cachedData
  }
  // Make the API call if cache not available or expired
  
  const response = await fetch(`${url}?${new URLSearchParams(params)}`)
  const data = await response.json()
  console.log(`⚡ live call to ${url}?${new URLSearchParams(params)}`, data)
  
  //todo add optional condition to save - ie response code and or regex on data
  //to avoid caching invalid data
  if (data) await saveToCache(url, params, data)
  return data
}



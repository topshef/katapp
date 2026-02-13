
// ┌─┐┌─┐┌─┐┬ ┬┌─┐  ┌─┐┬ ┬┌┐┌┌─┐┌┬┐┬┌─┐┌┐┌┌─┐
// │  ├─┤│  ├─┤├┤   ├┤ │ │││││   │ ││ ││││└─┐
// └─┘┴ ┴└─┘┴ ┴└─┘  └  └─┘┘└┘└─┘ ┴ ┴└─┘┘└┘└─┘
// cache functions

//v0.12 allow serve stale cache within window, and background update
//v0.11 don't cache invalid data
//v0.1 base version from 2025-ish at phpjabbers m/bid

// Initialize https://github.com/samuk190/localbase
let db = new Localbase('apiCache')
let refreshQueue = new Set()
let isRefreshing = false


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
async function getData(url, params, expirySeconds = 0, staleSeconds = 3600) {
// async function getData(url, params, expirySeconds = 0) {
  // if (expirySeconds) {
    // const cachedData = await getFromCache(url, params, expirySeconds)
    // if (cachedData) return cachedData
  // }
	if (expirySeconds) {
		const key = generateCacheKey(url, params)
		const record = await db.collection('apiCache').doc(key).get()

		if (record && record.data) {
			const ageSeconds = (Date.now() - record.timestamp) / 1000

			// Fresh
			if (expirySeconds === 'infinite' || ageSeconds <= expirySeconds) {
				console.log('🟢 fresh cache')
				return record.data
			}

			// Stale window
			if (staleSeconds && ageSeconds <= staleSeconds) {
				console.log('🟡 stale cache — serving + refreshing')

				refreshQueue.add({ url, params, expirySeconds })
				setTimeout(processRefreshQueue, 0)

				return record.data
			}
		}
	}
	
	
  // Make the API call if cache not available or expired
  const response = await fetch(`${url}?${new URLSearchParams(params)}`)
		
	let data
	try {
		data = await response.json()
	} catch (e) {
		data = null
	}	
	
	const type = classifyResponse(response, data)

	console.log(`⚡ live call to ${url}?${new URLSearchParams(params)}`, { type, data, expirySeconds })

	let finalExpiry = 0
	
	if (typeof expirySeconds === 'number') 
		finalExpiry = (type === 'ok') ? expirySeconds : 0
	
	else if (typeof expirySeconds === 'object' && expirySeconds !== null && !Array.isArray(expirySeconds)) 
		finalExpiry = expirySeconds[type] ?? 0
	
	else if (typeof expirySeconds === 'function')
		finalExpiry = expirySeconds({ response, data, type }) ?? 0
	
	else if (expirySeconds === 'infinite')
		finalExpiry = (type === 'ok') ? Infinity : 0
	
	if (finalExpiry > 0 && data)
		await saveToCache(url, params, data)
	
  return data
}



function isHttpError(response) {
  return !response.ok
}

function isJsonError(data) {
  return typeof data === 'object' &&
         data !== null &&
         data.error
}


function isStringError(data) {
  return typeof data === 'string' && data.toLowerCase().includes('error')
}

function classifyResponse(response, data) {
  if (isHttpError(response)) return 'httpError'
  if (isJsonError(data)) return 'jsonError'
  if (isStringError(data)) return 'stringError'
  return 'ok'
}



async function processRefreshQueue() {
  if (isRefreshing) return
  isRefreshing = true

  for (const item of refreshQueue) {
    refreshQueue.delete(item)
    const { url, params, expirySeconds } = item

    try {
      await getData(url, params, expirySeconds)
    } catch (e) {
      console.warn('Background refresh failed', url)
    }
  }

  isRefreshing = false
}




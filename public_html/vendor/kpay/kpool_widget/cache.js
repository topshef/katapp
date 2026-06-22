
// import Localbase from 'localbase'
// const db = new Localbase('apiCache')

import { loadLocalbase } from './localbase-loader.js'

const glog = globalThis.glog ?? (() => {})


let db = null

// ┌─┐┌─┐┌┬┐  ╔╦╗┌┐ 
// │ ┬├┤  │    ║║├┴┐
// └─┘└─┘ ┴   ═╩╝└─┘
// get Db
export async function getDb() {
  if (db) return db

  const Localbase = await loadLocalbase()
  db = new Localbase('apiCache')
  return db
}


// export { db }

// ---------- helpers ----------

function generateCacheKey(url, params = {}) {
  return `${url}?${new URLSearchParams(params).toString()}`
}

// ┌─┐┌─┐┌┬┐  ╔═╗┬─┐┌─┐┌┬┐  ╔═╗┌─┐┌─┐┬ ┬┌─┐
// │ ┬├┤  │   ╠╣ ├┬┘│ ││││  ║  ├─┤│  ├─┤├┤ 
// └─┘└─┘ ┴   ╚  ┴└─└─┘┴ ┴  ╚═╝┴ ┴└─┘┴ ┴└─┘
// get From Cache
// ---------- URL-based cache ----------
export async function getFromCache(url, params = {}, expirySeconds = 'infinite') {
	const db = await getDb() 
  const key = generateCacheKey(url, params)
  const record = await db.collection('apiCache').doc(key).get()

  if (!record?.data) return null

  if (expirySeconds !== 'infinite') {
    const ageSeconds = (Date.now() - record.timestamp) / 1000
    if (ageSeconds > expirySeconds) return null
  }

  glog('🗄️ cache hit', key)
  return record.data
}

// ┌─┐┌─┐┬  ┬┌─┐  ╔╦╗┌─┐  ╔═╗┌─┐┌─┐┬ ┬┌─┐
// └─┐├─┤└┐┌┘├┤    ║ │ │  ║  ├─┤│  ├─┤├┤ 
// └─┘┴ ┴ └┘ └─┘   ╩ └─┘  ╚═╝┴ ┴└─┘┴ ┴└─┘
// save To Cache
export async function saveToCache(url, params = {}, data) {
  const db = await getDb() 
	const key = generateCacheKey(url, params)

  await db.collection('apiCache').doc(key).set({
    type: 'url',
    key,
    url,
    params,
    data,
    timestamp: Date.now()
  })
}

// ┌─┐┌─┐┌┬┐  ╔╦╗┌─┐┌┬┐┌─┐
// │ ┬├┤  │    ║║├─┤ │ ├─┤
// └─┘└─┘ ┴   ═╩╝┴ ┴ ┴ ┴ ┴
// get Data
export async function getData(url, params = {}, expirySeconds = 0) {
  if (expirySeconds) {
    const cached = await getFromCache(url, params, expirySeconds)
    if (cached) return cached
  }

  const response = await fetch(`${url}?${new URLSearchParams(params)}`)
  const data = await response.json()

  glog('⚡ live call', url, params)

  if (data) await saveToCache(url, params, data)
  return data
}


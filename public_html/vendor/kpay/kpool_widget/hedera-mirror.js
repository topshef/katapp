

import { getData } from './cache.js'



export async function getKeyInfo(network, accountId) {
	return getKeyInfoFromMirror(network, accountId)
}

async function getKeyInfoFromMirror(network, accountId) {
	try {
		const accountData = await getAccountInfo(network, accountId, 300)
		if (!accountData?.key) throw new Error('no key field in mirror account HM92832')
		const { _type, key } = accountData.key
		if (_type === 'ED25519' || _type === 'ECDSA_SECP256K1') return key  // model.js wraps single keys
		if (_type === 'ProtobufEncoded') {
			const decoded = _kpbDecodeKey(key)
			if (decoded == null) throw new Error(`_kpbDecodeKey returned null for ${accountId} HM83721`)
			if (typeof decoded === 'string') return decoded
			const banzhafScores = _kpbBanzhaf(decoded)
			const keyControlScoresAll = _kpbControlAll(decoded)
			return { ...decoded, banzhafScores, keyControlScoresAll }
		}
		throw new Error(`unsupported mirror key type: ${_type} HM74291`)
	} catch (error) {
		console.error('HM64352 getKeyInfoFromMirror failed:', accountId, error)
		throw error
	}
}

function _kpbDecodeKey(hex) {
	const buf = new Uint8Array(hex.length >> 1)
	for (let i = 0; i < buf.length; i++) buf[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
	return _kpbKey(buf, 0, buf.length)
}

function _kpbVarint(buf, pos) {
	let val = 0, shift = 0, b
	do { b = buf[pos++]; val |= (b & 0x7f) << shift; shift += 7 } while (b & 0x80)
	return { val, pos }
}

function _kpbKey(buf, start, end) {
	let pos = start
	while (pos < end) {
		const tag = buf[pos++], field = tag >> 3, wire = tag & 7
		if (wire === 0) { const r = _kpbVarint(buf, pos); pos = r.pos; continue }
		if (wire !== 2) break
		const { val: len, pos: p } = _kpbVarint(buf, pos); pos = p; const from = pos; pos += len
		if (field === 2 || field === 7) return _kpbHex(buf, from, from + len)
		if (field === 5) return _kpbThreshold(buf, from, from + len)
		if (field === 6) { const ks = _kpbKeyList(buf, from, from + len); return { threshold: ks.length, keys: ks } }
	}
	return null
}

function _kpbThreshold(buf, start, end) {
	let pos = start, threshold = 1, keys = []
	while (pos < end) {
		const tag = buf[pos++], field = tag >> 3, wire = tag & 7
		if (wire === 0) { const r = _kpbVarint(buf, pos); if (field === 1) threshold = r.val; pos = r.pos; continue }
		if (wire !== 2) break
		const { val: len, pos: p } = _kpbVarint(buf, pos); pos = p; const from = pos; pos += len
		if (field === 2) keys = _kpbKeyList(buf, from, from + len)
	}
	return { threshold, keys }
}

function _kpbKeyList(buf, start, end) {
	const keys = []
	let pos = start
	while (pos < end) {
		const tag = buf[pos++], field = tag >> 3, wire = tag & 7
		if (wire === 0) { const r = _kpbVarint(buf, pos); pos = r.pos; continue }
		if (wire !== 2) break
		const { val: len, pos: p } = _kpbVarint(buf, pos); pos = p; const from = pos; pos += len
		if (field === 1) { const k = _kpbKey(buf, from, from + len); if (k != null) keys.push(k) }
	}
	return keys
}

function _kpbHex(buf, from, to) {
	let s = ''
	for (let i = from; i < to; i++) s += buf[i].toString(16).padStart(2, '0')
	return s
}

// ── Voting-power scoring (JS port of kpos getKeyVotingInfo.php) ────────────────
function _kpbFlatten(node) {
	if (typeof node === 'string') return { threshold: 1, weights: { [node]: 1 } }
	const weights = {}
	for (const slot of node.keys) _kpbCollect(slot, 1, weights)
	return { threshold: node.threshold ?? 1, weights }
}

function _kpbCollect(node, mult, weights) {
	if (typeof node === 'string') { weights[node] = (weights[node] || 0) + mult; return }
	const slotW = mult / (node.threshold ?? 1)
	for (const sub of node.keys) _kpbCollect(sub, slotW, weights)
}

function _kpbAuthorized(node, subset) {
	if (typeof node === 'string') return subset.includes(node)
	let yes = 0
	for (const c of node.keys) if (_kpbAuthorized(c, subset)) yes++
	return yes >= (node.threshold ?? 1)
}

function _kpbBanzhaf(tree, maxKeys = 15) {
	const { weights } = _kpbFlatten(tree)
	const keys = Object.keys(weights)
	const n = keys.length
	if (n > maxKeys) { console.warn('KB72913 too many keys for Banzhaf:', n); return false }
	const pivot = {}; keys.forEach(k => pivot[k] = 0)
	const MWC = []
	let total = 0
	const max = 1 << n
	for (let mask = 1; mask < max; mask++) {
		const subset = []
		for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(keys[i])
		if (!_kpbAuthorized(tree, subset)) continue
		let isMin = true
		for (const k of subset) if (_kpbAuthorized(tree, subset.filter(x => x !== k))) { isMin = false; break }
		if (isMin) MWC.push(subset)
		for (const k of subset) if (!_kpbAuthorized(tree, subset.filter(x => x !== k))) { pivot[k]++; total++ }
	}
	const scores = {}
	for (const k of keys) scores[k] = total ? pivot[k] / total : 0
	const redundancy = {}; keys.forEach(k => redundancy[k] = 0)
	const totalMWC = MWC.length
	if (totalMWC) {
		for (const coalition of MWC) for (const k of keys) if (!coalition.includes(k)) redundancy[k]++
		for (const k of keys) redundancy[k] = redundancy[k] / totalMWC
	}
	return { scores, redundancy }
}

function _kpbControlAll(tree) {
	const { threshold: T, weights } = _kpbFlatten(tree)
	const totalWeight = Object.keys(weights).length
	const out = {}
	for (const [k, w] of Object.entries(weights)) {
		const share = T ? w / T : 0
		const missing = Math.max(0, T - w)
		let bucket
		if (w === 0) bucket = 'none'
		else if (share < 1) bucket = 'partial'
		else bucket = (totalWeight - w) < T ? 'full-exclusive' : 'full'
		out[k] = { share, bucket, missing }
	}
	return out
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
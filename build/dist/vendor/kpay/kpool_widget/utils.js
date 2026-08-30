// utils.js

export const get = (obj, path) =>
	path.split('.').reduce(
		(o, k) => (o && k in o ? o[k] : undefined),
		obj
	)

// export const parseTxIdTime = txid => {
export const parseTxId = txid => {
	// 0.0.123@1769033572.006227887
	const [operatorId, startTime] = txid.split('@')
	const [shard, realm, entityNum] =
	operatorId.split('.').map(v => parseInt(v, 10))


	if (!startTime) return null

	
	const [seconds, nanos] =
		startTime.split('.').map(v => parseInt(v, 10))

	return {operatorId, shard, realm, entityNum, seconds, nanos }
}

export const formatUtcTime = seconds => {
	const d = new Date(seconds * 1000)

	const pad = v => (v < 10 ? '0' + v : v)

	return (
		`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
		`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
	)
}

// Singleton script loader — dedupes concurrent loads and retries after CDN errors.
const _scriptPromises = {}
export function loadScript(src, globalKey) {
	if (window[globalKey]) return Promise.resolve(window[globalKey])
	if (_scriptPromises[src]) return _scriptPromises[src]
	_scriptPromises[src] = new Promise(resolve => {
		const s = document.createElement('script')
		s.src = src
		s.onload  = () => resolve(window[globalKey] || null)
		s.onerror = () => { delete _scriptPromises[src]; resolve(null) }
		document.head.appendChild(s)
	})
	return _scriptPromises[src]
}

export const formatCountdown = diffSeconds => {
	const sign = diffSeconds < 0 ? '-' : ''
	let s = Math.abs(diffSeconds)

	const h = Math.floor(s / 3600)
	const m = Math.floor((s % 3600) / 60)
	const sec = s % 60

	const pad = v => (v < 10 ? '0' + v : v)
	return `${sign}${pad(h)}:${pad(m)}:${pad(sec)}`
}

// KEYLESS Hedera system accounts — the staking/fee reward collectors the mirror
// exposes NO key for (a lookup is doomed, so callers skip key enrichment and the
// "couldn't load signing keys" row). This used to be a blanket `n < 1000` range,
// which wrongly swallowed real signable accounts: 0.0.2 (17-of-32 council key),
// 0.0.69 / 0.0.481 (3-of-5), the node accounts — their pies and key lists silently
// never rendered (found testing 0.0.481, 2026-07-03). Almost every low account DOES
// expose a key; only these few are truly keyless. Accounts the mirror reports
// key:null for are additionally caught at fetch time in enrichAccountsKeyInfo.
// (KEYINFO-LOCAL1)
const KEYLESS_SYSTEM_ACCOUNTS = new Set([800, 801, 802])
export const isHederaSystemAccount = accountId => {
	const n = parseInt(String(accountId).split('.')[2], 10)
	return Number.isFinite(n) && KEYLESS_SYSTEM_ACCOUNTS.has(n)
}

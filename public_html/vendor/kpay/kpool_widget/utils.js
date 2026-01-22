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

export const formatCountdown = diffSeconds => {
	const sign = diffSeconds < 0 ? '-' : ''
	let s = Math.abs(diffSeconds)

	const h = Math.floor(s / 3600)
	const m = Math.floor((s % 3600) / 60)
	const sec = s % 60

	const pad = v => (v < 10 ? '0' + v : v)
	return `${sign}${pad(h)}:${pad(m)}:${pad(sec)}`
}

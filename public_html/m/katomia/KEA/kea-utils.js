// -----------------------------------------------------------------------------
// KEA low-level utilities
// -----------------------------------------------------------------------------

export function $(id) {
  return document.getElementById(id)
}

export function makeId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function cleanUrl(x) {
  return String(x || '').trim().replace(/\/$/, '')
}

export function canonicalJson(obj) {
  return JSON.stringify(obj)
}

export function hexToBytes(hex) {
  const clean = String(hex || '').trim()
  const pairs = clean.match(/.{1,2}/g) || []
  return Uint8Array.from(pairs.map(function(x) { return parseInt(x, 16) }))
}

export function bytesToHex(bytes) {
  return [...bytes].map(function(b) { return b.toString(16).padStart(2, '0') }).join('')
}

export function normaliseAssetId(asset) {
  return String(asset).toUpperCase() === 'HBAR' ? 'HBAR' : String(asset)
}

export function formatHost(url) {
  try { return new URL(url).host } catch { return String(url || '-') }
}

export function shortHash(x, n = 8) {
  x = String(x || '')
  return x.length > n ? x.slice(0, n) : x
}

export function shortKey(x) {
  x = String(x || '')
  return x.length > 12 ? `${x.slice(0, 8)}…${x.slice(-4)}` : x
}

export function shortText(x, n = 80) {
  x = String(x || '')
  return x.length > n ? `${x.slice(0, n - 1)}…` : x
}

export function parseTxStrikeAt(txid) {
  const raw = String(txid || '')
  const at = raw.match(/@(\d{9,})\.(\d{1,9})/)
  if (at) return txPartsToMs(at[1], at[2])

  const dash = raw.match(/-(\d{9,})-(\d{1,9})(?:\D|$)/)
  if (dash) return txPartsToMs(dash[1], dash[2])

  return null
}

export function formatShortTime(ms) {
  if (!ms) return '-'
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function txPartsToMs(seconds, nanos) {
  const sec = Number(seconds)
  const ns = Number(String(nanos || '0').padEnd(9, '0'))
  if (!Number.isFinite(sec) || !Number.isFinite(ns)) return null
  return sec * 1000 + Math.floor(ns / 1000000)
}

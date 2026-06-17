// -----------------------------------------------------------------------------
// KEA signing + local key store (DEMO)
//
// This module owns three concerns, kept out of app.html so the view stays thin:
//
//   1. A local "action key" store (generate / import / delete).
//      DEMO ONLY: private keys live in localStorage. In the real app this is
//      swapped for Android secure storage / a hardware-backed keystore.
//
//   2. A signing adapter. KEA signs the approval package's transaction bytes
//      with the chosen action key.
//
//   3. Sending the signed result back to KPool (txSave REST endpoint).
//
// The README deliberately flags ONE part as a swappable adapter:
//   "how to inject the local signature back into a Hedera transaction".
// That seam is isolated in `signApprovalPackage` (see SIGNER BOUNDARY below).
// Everything else here is concrete.
// -----------------------------------------------------------------------------

import { cleanUrl, hexToBytes, bytesToHex } from './kea-utils.js'

import * as ed from 'https://esm.sh/@noble/ed25519@2.1.0'
import { sha512 } from 'https://esm.sh/@noble/hashes@1.4.0/sha512'

ed.etc.sha512Sync = function(...m) { return sha512(ed.etc.concatBytes(...m)) }

const KEYS_KEY = 'keaActionKeys.v1'

// -------------------------------------------------------------------------
// KEY STORE
// -------------------------------------------------------------------------

export function loadKeys() {
  let keys
  try { keys = JSON.parse(localStorage[KEYS_KEY] || '[]') } catch { keys = [] }
  return Array.isArray(keys) ? keys.map(normaliseKey).filter(Boolean) : []
}

function saveKeys(keys) {
  localStorage[KEYS_KEY] = JSON.stringify(keys)
}

function normaliseKey(k) {
  if (!k || !k.privHex || !k.pubkeyHex) return null
  return {
    id: k.id || makeKeyId(),
    name: String(k.name || '').trim(),
    pubkeyHex: String(k.pubkeyHex).toLowerCase(),
    privHex: String(k.privHex).toLowerCase(),
    createdAt: k.createdAt || Date.now()
  }
}

function makeKeyId() {
  return `k_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function getKey(pubkeyHex) {
  const want = String(pubkeyHex || '').toLowerCase()
  return loadKeys().find(function(k) { return k.pubkeyHex === want }) || null
}

export function getKeyById(id) {
  return loadKeys().find(function(k) { return k.id === id }) || null
}

// Generate a fresh ed25519 action key and persist it.
export async function generateKey(name) {
  const seed = ed.utils.randomPrivateKey()              // 32-byte seed
  const pub = await ed.getPublicKeyAsync(seed)
  const key = normaliseKey({
    name: name || `Action key ${shortPub(bytesToHex(pub))}`,
    pubkeyHex: bytesToHex(pub),
    privHex: bytesToHex(seed)
  })
  const keys = loadKeys()
  keys.push(key)
  saveKeys(keys)
  return key
}

// Import a key from a 32-byte (64 hex char) ed25519 seed.
export async function importKey(name, seedHex) {
  const clean = String(seedHex || '').trim().toLowerCase().replace(/^0x/, '')
  if (!/^[0-9a-f]{64}$/.test(clean))
    throw new Error('Action key must be a 32-byte ed25519 seed (64 hex chars)')

  const seed = hexToBytes(clean)
  const pub = await ed.getPublicKeyAsync(seed)
  const pubHex = bytesToHex(pub)

  if (getKey(pubHex)) throw new Error('That key is already in the store')

  const key = normaliseKey({
    name: name || `Imported ${shortPub(pubHex)}`,
    pubkeyHex: pubHex,
    privHex: clean
  })
  const keys = loadKeys()
  keys.push(key)
  saveKeys(keys)
  return key
}

export function deleteKey(id) {
  saveKeys(loadKeys().filter(function(k) { return k.id !== id }))
}

// First-run convenience so the demo can sign out of the box.
export async function ensureDummyKey() {
  if (loadKeys().length) return loadKeys()[0]
  return generateKey('Demo action key')
}

function shortPub(hex) {
  hex = String(hex || '')
  return hex ? hex.slice(0, 6) : '?'
}

// -------------------------------------------------------------------------
// SIGNING ADAPTER  (SIGNER BOUNDARY)
// -------------------------------------------------------------------------
//
// Everything above this line is generic key management.
// Everything below is the part the README marks as swappable: turning an
// approved package into bytes a Hedera node will accept.
//
// DEMO adapter: we ed25519-sign the canonical transaction bytes that KPool
// already exposed and verified (kea.transaction.txBytesHex, whose sha256 is
// kea.transaction.txHash and is checked in kea-verify.js).
//
// REAL adapter (TODO): extract the inner TransactionBody bodyBytes, ed25519
// sign THOSE, and merge { pubkeyPrefix, signature } into the transaction's
// sigMap, returning a fully re-serialised signed transaction. That requires
// the Hedera protobuf/SDK and is intentionally out of scope for this prototype.

export async function signApprovalPackage(kea, key) {
  if (!kea?.transaction?.txBytesHex) throw new Error('Approval package has no transaction bytes')
  if (!key?.privHex) throw new Error('No action key selected to sign with')

  const seed = hexToBytes(key.privHex)
  const message = hexToBytes(kea.transaction.txBytesHex)
  const sig = await ed.signAsync(message, seed)

  return {
    pubkeyHex: key.pubkeyHex,
    keyId: key.id,
    keyName: key.name,
    signatureBase64: bytesToBase64(sig),
    signedOver: 'kea.transaction.txBytesHex',  // adapter swap point: should be bodyBytes
    txHash: kea.transaction.txHash || null,
    signedAt: new Date().toISOString()
  }
}

// Shape the payload KEA posts back to KPool after an approval.
// The server's txSave KEA-signature route is still TBC, so this is a clean,
// self-describing envelope rather than a reconstructed Hedera signedTx.
export function buildSignedPayload(e, signResult) {
  return {
    type: 'kea_signed',
    network: e.network,
    txid: e.txid,
    pch: e.pch,
    orderIds: (e.debug?.watchedOrderIds || []).filter(Boolean),
    signature: {
      pubkeyHex: signResult.pubkeyHex,
      sig: signResult.signatureBase64,
      signedOver: signResult.signedOver
    },
    txHash: signResult.txHash,
    signedAt: signResult.signedAt
  }
}

// Reject envelope. No endpoint exists yet (README: "option does not exist yet
// but we might add this later"), so this is built and stored locally only.
export function buildRejectPayload(e, reason) {
  return {
    type: 'kea_rejected',
    network: e.network,
    txid: e.txid,
    pch: e.pch,
    orderIds: (e.debug?.watchedOrderIds || []).filter(Boolean),
    reason: reason || 'Rejected by KEA operator',
    rejectedAt: new Date().toISOString()
  }
}

// -------------------------------------------------------------------------
// SEND-BACK
// -------------------------------------------------------------------------
//
// WebSocket is watch-only (kpool_watch -> kea_request), with no inbound
// signed-result handler, so the signed result goes back over REST txSave.
// Returns a structured result; never throws for HTTP errors so the UI can
// still record the local approval and show the server response.

export async function submitSignedResult(baseUrl, payload) {
  const url = `${cleanUrl(baseUrl)}/kpool/txSave`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    })

    let body
    try { body = await res.json() } catch { body = await res.text().catch(function() { return null }) }

    return { url, sent: true, ok: res.ok, status: res.status, statusText: res.statusText, response: body }
  } catch (err) {
    return { url, sent: false, ok: false, error: err.message }
  }
}

function bytesToBase64(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

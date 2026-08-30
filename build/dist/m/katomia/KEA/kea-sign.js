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

export function loadKeys(network) {
  let keys
  try { keys = JSON.parse(localStorage[KEYS_KEY] || '[]') } catch { keys = [] }
  const all = Array.isArray(keys) ? keys.map(normaliseKey).filter(Boolean) : []
  if (!network) return all
  const want = String(network).trim().toLowerCase()
  return all.filter(function(k) { return k.network === want })
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
    // Keys are scoped to a network. As a general principle we don't encourage
    // reusing the same key across testnet and mainnet, so the store keeps them
    // separate. Legacy keys (no network) migrate to mainnet, the app default.
    network: String(k.network || 'mainnet').trim().toLowerCase(),
    createdAt: k.createdAt || Date.now(),
    lastUsedAt: k.lastUsedAt || null
  }
}

function makeKeyId() {
  return `k_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

export function getKey(pubkeyHex, network) {
  const want = String(pubkeyHex || '').toLowerCase()
  return loadKeys(network).find(function(k) { return k.pubkeyHex === want }) || null
}

export function getKeyById(id) {
  return loadKeys().find(function(k) { return k.id === id }) || null
}

// Rename a key in place (inline edit from the keys list). No-op if missing.
export function renameKey(id, name) {
  const keys = loadKeys()
  const k = keys.find(function(x) { return x.id === id })
  if (!k) return null
  k.name = String(name || '').trim()
  saveKeys(keys)
  return k
}

// Record that a key was used to sign (diagnostics: "last used" column).
export function markKeyUsed(id) {
  const keys = loadKeys()
  const k = keys.find(function(x) { return x.id === id })
  if (!k) return null
  k.lastUsedAt = Date.now()
  saveKeys(keys)
  return k
}

// Generate a fresh ed25519 action key for a network and persist it.
export async function generateKey(name, network) {
  const seed = ed.utils.randomPrivateKey()              // 32-byte seed
  const pub = await ed.getPublicKeyAsync(seed)
  const key = normaliseKey({
    name: name || `Action key ${shortPub(bytesToHex(pub))}`,
    pubkeyHex: bytesToHex(pub),
    privHex: bytesToHex(seed),
    network: network || 'mainnet'
  })
  const keys = loadKeys()
  keys.push(key)
  saveKeys(keys)
  return key
}

// Import a key from a 32-byte (64 hex char) ed25519 seed into a network.
export async function importKey(name, seedHex, network) {
  const net = String(network || 'mainnet').trim().toLowerCase()
  const clean = String(seedHex || '').trim().toLowerCase().replace(/^0x/, '')
  if (!/^[0-9a-f]{64}$/.test(clean))
    throw new Error('Action key must be a 32-byte ed25519 seed (64 hex chars)')

  const seed = hexToBytes(clean)
  const pub = await ed.getPublicKeyAsync(seed)
  const pubHex = bytesToHex(pub)

  if (getKey(pubHex, net)) throw new Error(`That key is already in the ${net} store`)

  const key = normaliseKey({
    name: name || `Imported ${shortPub(pubHex)}`,
    pubkeyHex: pubHex,
    privHex: clean,
    network: net
  })
  const keys = loadKeys()
  keys.push(key)
  saveKeys(keys)
  return key
}

export function deleteKey(id) {
  saveKeys(loadKeys().filter(function(k) { return k.id !== id }))
}

// First-run convenience so the demo can sign out of the box on the given
// network (defaults to mainnet, matching the default watch network).
export async function ensureDummyKey(network) {
  const net = String(network || 'mainnet').trim().toLowerCase()
  if (loadKeys(net).length) return loadKeys(net)[0]
  return generateKey('Demo action key', net)
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
//edit: backend endpoint for addSig wip
export function buildSignedPayload(e, signResult) {
  return {
    network: e.network,
    txid: e.txid,
    pch: e.pch,
    pubKey: signResult.pubkeyHex,
    signature: signResult.signatureBase64,
    signedOver: signResult.signedOver,
    txHash: signResult.txHash,
    orderIds: (e.debug?.watchedOrderIds || []).filter(Boolean),
    source: {
      type: 'kea_signed',
      signedAt: signResult.signedAt,
      keyId: signResult.keyId,
      keyName: signResult.keyName
    }
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
// EXECUTION COMMITMENTS  (kpay.executionCommitment)
// -------------------------------------------------------------------------
//
// A commitment is the executor's (Sally's) signed promise to execute against a
// trader's (Tim's) intent key under a named deal policy. It is the standing
// counterpart to a per-transaction signature: signApprovalPackage signs ONE
// transaction, a commitment binds the watch rule itself.
//
// Built from a watch rule (rule.query.* + rule.expiresAt) and
// the executor's action key. Canonicalisation is plain JSON.stringify over the
// commitment in field order (matches kea-utils canonicalJson and the dealEngine
// hashJson convention), signed with ed25519, signature encoded base64url.

export async function buildExecutionCommitmentEnvelope(rule, key) {
  if (!key?.privHex) throw new Error('No action key selected to sign the commitment')

  const query = (rule && rule.query) || {}
  const nowIso = new Date().toISOString()
  const expiresAt = rule && rule.expiresAt ? rule.expiresAt : null

  const commitment = {
    type: 'kpay.executionCommitment',
    version: 1,
    id: randomUuid(),
    network: String(query.network || ''),
    issuer: {
      role: 'executor',
      executionPublicKey: key.pubkeyHex
    },
    subject: {
      role: 'trader',
      // Spec field stays `intentPublicKey`; it's sourced from the query's
      // backend-named `orderPubkey`.
      intentPublicKey: String(query.orderPubkey || '')
    },
    scope: {
      // Reflects the checks implied by the query at commitment time.
      // intentPublicKey means intent-sig checks; dealId means deal-template checks.
      intentPublicKey: String(query.orderPubkey || '') || null,
      dealId: String(query.dealId || '') || null,
      gameId: String(query.gameId || '') || null
    },
    validity: {
      issuedAt: nowIso,
      notBefore: nowIso,
      expiresAt: expiresAt
    },
    revocation: {
      mode: expiresAt ? 'irrevocableUntilExpiry' : 'replaceOrRevoke'
    }
  }

  // revocationNote only applies to open-ended (no-expiry) commitments.
  if (!expiresAt) {
    commitment.revocationNote = 'STUB: revocable by signed replacement or cancellation notice published to [path TBD]'
  }

  // Canonicalise -> UTF-8 -> ed25519 sign -> base64url.
  const bytes = new TextEncoder().encode(JSON.stringify(commitment))
  const sig = await ed.signAsync(bytes, hexToBytes(key.privHex))

  // STUB: POST envelope to commitment registry endpoint (path TBD). Not sent yet.
  return {
    type: 'kpay.executionCommitmentEnvelope',
    commitment,
    signature: {
      alg: 'EdDSA',
      value: bytesToBase64Url(sig)
    },
    attachments: {}
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
  const url = `${cleanUrl(baseUrl)}/kpool/addSig`
  const bodyJson = JSON.stringify(payload)

  console.log('[KEA addSig request]', {
    url,
    method: 'POST',
    headers: { 'content-type': 'application/json' }
  })

  console.log('[KEA addSig body]\n' + JSON.stringify(payload, null, 2))

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: bodyJson
    })

    let body
    try { body = await res.json() } catch { body = await res.text().catch(function() { return null }) }

    const out = { url, sent: true, ok: res.ok, status: res.status, statusText: res.statusText, response: body }
    console.log('[KEA addSig response]\n' + JSON.stringify(out, null, 2))
    return out
  } catch (err) {
    const out = { url, sent: false, ok: false, error: err.message }
    console.log('[KEA addSig response]\n' + JSON.stringify(out, null, 2))
    return out
  }
}



function bytesToBase64(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomUuid() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch {}
  // Fallback for non-secure contexts without crypto.randomUUID.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
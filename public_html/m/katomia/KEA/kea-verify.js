// -----------------------------------------------------------------------------
// KEA verification helpers
// -----------------------------------------------------------------------------

import {
  canonicalJson,
  hexToBytes,
  bytesToHex,
  normaliseAssetId,
  shortHash,
  shortKey
} from './kea-utils.js'

import * as ed from 'https://esm.sh/@noble/ed25519@2.1.0'
import { sha512 } from 'https://esm.sh/@noble/hashes@1.4.0/sha512'
import { sha256 } from 'https://esm.sh/@noble/hashes@1.4.0/sha256'

ed.etc.sha512Sync = function(...m) { return sha512(ed.etc.concatBytes(...m)) }

export function buildEventDebug(e, w, kea) {
  const mandates = kea?.mandates || []
  const fills = getExecutionFills(kea || {})
  const watchedKey = String(w?.orderPubkey || '').toLowerCase()

  return {
    watch: {
      watchId: e.watchId,
      ref: e.watchRef,
      label: e.watchLabel,
      network: w?.network || e.network,
      gameId: w?.gameId || '',
      orderPubkey: shortKey(watchedKey)
    },
    event: {
      txid: e.txid,
      pch: e.pch,
      pchShort: shortHash(e.pch)
    },
    fetched: {
      txid: kea?.transaction?.txid || null,
      pch: kea?.transaction?.pch || null,
      pchShort: shortHash(kea?.transaction?.pch),
      pchMatchesEvent: !!e.pch && !!kea?.transaction?.pch && String(kea.transaction.pch).startsWith(String(e.pch))
    },
    execution: fills.map(function(fill) {
      return {
        fillId: fill.fillId,
        legs: (fill.legs || []).map(function(l) { return String(l.orderId || '') }),
        trigger: fill.trigger != null ? String(fill.trigger) : null
      }
    }),
    mandates: mandates.map(function(m) {
      return {
        orderId: String(m.orderId || ''),
        role: getMandateRole(m, fills),
        intentPubkey: shortKey(m.intentPubkey),
        matchesWatch: String(m.intentPubkey || '').toLowerCase() === watchedKey,
        accountIds: [...new Set((m.bundle || []).map(function(x) { return x.accountId }).filter(Boolean))]
      }
    }),
    watchedOrderIds: mandates
      .filter(function(m) { return String(m.intentPubkey || '').toLowerCase() === watchedKey })
      .map(function(m) { return String(m.orderId || '') })
  }
}

export async function verifyKeaForWatch(kea, w) {
  try {
    await verifyKeaDetail(kea, {
      network: w.network,
      gameId: w.gameId,
      orderPubkey: w.orderPubkey
    })

    const msg = getKeaSummary(kea)
    return { ok: true, msg }
  } catch (err) {
    return { ok: false, msg: err.message }
  }
}

export function getExecutionFills(kea) {
  const raw = kea.execution?.fills || (kea.execution?.fill ? [kea.execution.fill] : [])
  return raw.map(normaliseFillShape)
}

// Display-only. There is no maker/taker in a general N-party match.
// An order is a participant in a clearing event. The only soft label kept here
// is whether it was the advisory trigger.
function getMandateRole(mandate, fills) {
  const orderId = String(mandate?.orderId || '')
  let participates = false

  for (const fill of fills) {
    const inFill = (fill.legs || []).some(function(l) { return String(l.orderId || '') === orderId })
    if (!inFill) continue
    if (String(fill.trigger || '') === orderId) return 'trigger'
    participates = true
  }

  return participates ? 'resting' : ''
}

function getKeaSummary(kea) {
  const fills = getExecutionFills(kea)
  const watched = (kea.watchedMandates || []).map(function(x) { return x.orderId }).join(',')
  const fillText = fills
    .map(function(f) {
      return (f.legs || []).map(function(l) { return `#${l.orderId}` }).join('+')
    })
    .join(', ')

  return `${fills.length} fill(s), ${fillText || '-'}, watched: ${watched || '-'}`
}

async function verifyKeaDetail(kea, expected) {
  kea.watchedMandates = getWatchedMandates(kea, expected)

  await verifyIntents(kea)

  verifyMandatesMatchExecution(kea)
  verifyBundleHash(kea)
  verifyScope(kea, expected)
  verifyTxHash(kea)
  verifyPch(kea)
  verifyFillAgainstTransfers(kea)
}

// KEA is leg-native. A fill is an N-party clearing event:
// { fillId, legs:[{orderId,numerator,denominator}], trigger }
// This safety net folds old pairwise shapes into legs if needed.
function normaliseFillShape(fill) {
  if (Array.isArray(fill?.legs)) return fill

  const legs = []
  if (fill?.orderId != null)
    legs.push({ orderId: String(fill.orderId), numerator: fill.numerator ?? 1, denominator: fill.denominator ?? 1 })
  if (fill?.takerOrderId != null)
    legs.push({ orderId: String(fill.takerOrderId), numerator: fill.takerNumerator ?? 1, denominator: fill.takerDenominator ?? 1 })

  return {
    fillId: fill?.fillId ?? null,
    legs,
    trigger: fill?.takerOrderId != null ? String(fill.takerOrderId) : null
  }
}

function getWatchedMandates(kea, expected) {
  const watched = String(expected.orderPubkey || '').toLowerCase()
  const mandates = kea.mandates || []

  if (watched) {
    const matched = mandates.filter(function(x) { return String(x.intentPubkey || '').toLowerCase() === watched })
    if (matched.length) return matched
  }

  if (mandates.length) return mandates

  throw new Error('No matching mandate for watched intent pubkey')
}

async function verifyIntents(kea) {
  for (const mandate of kea.watchedMandates || [])
    await verifyIntentMandate(mandate)
}

async function verifyIntentMandate(m) {
  if (!m?.intentPubkey || !m?.intentSignature || !m?.intentPayload)
    throw new Error('Missing mandate intent fields')

  const msg = new TextEncoder().encode(canonicalJson(m.intentPayload))
  const sig = Uint8Array.from(atob(m.intentSignature), function(c) { return c.charCodeAt(0) })
  const ok = await ed.verifyAsync(sig, msg, hexToBytes(m.intentPubkey))

  if (!ok) throw new Error(`Trader intent signature invalid for order ${m.orderId}`)
}

function verifyMandatesMatchExecution(kea) {
  const fills = getExecutionFills(kea)
  if (!fills.length) throw new Error('Missing execution fills')

  const fillOrderIds = new Set()

  for (const fill of fills)
    for (const leg of fill.legs || [])
      if (leg.orderId != null) fillOrderIds.add(String(leg.orderId))

  for (const mandate of kea.watchedMandates || [])
    if (!fillOrderIds.has(String(mandate.orderId)))
      throw new Error(`Watched mandate ${mandate.orderId} is not in execution fills`)
}

function verifyBundleHash(kea) {
  for (const mandate of kea.watchedMandates || []) {
    if (!mandate.bundle) throw new Error('Missing mandate bundle')
    if (!mandate.intentPayload?.bundleHash) throw new Error('Missing signed bundleHash')

    const expected = sha256Json(mandate.bundle)

    if (expected !== mandate.intentPayload.bundleHash)
      throw new Error(`Bundle hash does not match signed intent for order ${mandate.orderId}`)
  }
}

function verifyScope(kea, expected) {
  const pchBasis = kea.execution?.pchBasis

  if (expected.network && kea.network !== expected.network)
    throw new Error('KEA network mismatch')

  if (expected.network && kea.transaction?.network && kea.transaction.network !== expected.network)
    throw new Error('Transaction network mismatch')

  if (expected.network && pchBasis?.network && pchBasis.network !== expected.network)
    throw new Error('PCH network mismatch')

  for (const mandate of kea.watchedMandates || []) {
    const payload = mandate.intentPayload

    if (expected.orderPubkey && mandate.intentPubkey.toLowerCase() !== expected.orderPubkey)
      throw new Error('Intent pubkey does not match watched key')

    if (expected.network && payload.network !== expected.network)
      throw new Error(`Intent network mismatch for order ${mandate.orderId}`)

    if (expected.gameId && payload.gameId !== expected.gameId)
      throw new Error(`Game ID mismatch for order ${mandate.orderId}`)
  }
}

function getFillRatioForMandate(mandate, fill) {
  const orderId = String(mandate.orderId || '')
  const leg = (fill.legs || []).find(function(l) { return String(l.orderId || '') === orderId })
  if (!leg) return null
  return { numerator: leg.numerator, denominator: leg.denominator }
}

function verifyFillAgainstTransfers(kea) {
  const fills = getExecutionFills(kea)
  const mandates = kea.watchedMandates || []
  const pchBasis = kea.execution?.pchBasis

  if (!fills.length) throw new Error('Missing fills')
  if (!mandates.length) throw new Error('Missing watched mandates')
  if (!pchBasis) throw new Error('Missing pchBasis')

  const watchedAccounts = new Set()
  const residual = {}

  for (const mandate of mandates)
    for (const line of mandate.bundle || [])
      if (line.accountId) watchedAccounts.add(line.accountId)

  function add(accountId, asset, amount) {
    if (!watchedAccounts.has(accountId)) return
    const k = `${accountId}:${normaliseAssetId(asset)}`
    residual[k] = (residual[k] || 0) + Number(amount)
  }

  const t = pchBasis.transfers || {}

  for (const x of t.hbarTransfers || [])
    add(x.accountId, 'HBAR', x.amount)

  for (const x of t.tokenTransfers || [])
    add(x.accountId, x.tokenId, x.amount)

  for (const x of t.nftTransfers || []) {
    const asset = `${x.tokenId}#${x.serialNumber}`
    add(x.senderAccountId, asset, -1)
    add(x.receiverAccountId, asset, +1)
  }

  for (const fill of fills) {
    for (const mandate of mandates) {
      const ratio = getFillRatioForMandate(mandate, fill)
      if (!ratio) continue

      const numerator = Number(ratio.numerator)
      const denominator = Number(ratio.denominator)

      if (!numerator || !denominator || numerator < 1 || denominator < 1)
        throw new Error(`Invalid fill ratio for order ${mandate.orderId}`)

      if (numerator > denominator)
        throw new Error(`Fill ratio exceeds 1 for order ${mandate.orderId}`)

      for (const line of mandate.bundle || []) {
        const scaled = Math.trunc(Number(line.amount) * numerator / denominator)
        add(line.accountId, line.asset, -scaled)
      }
    }
  }

  const negative = Object.entries(residual).filter(function(pair) { return pair[1] < 0 })

  if (negative.length)
    throw new Error(`Transfers worse than signed bundle/fill: ${JSON.stringify(Object.fromEntries(negative))}`)
}

function verifyTxHash(kea) {
  const txBytes = hexToBytes(kea.transaction.txBytesHex)
  const txHash = bytesToHex(sha256(txBytes))

  if (txHash !== kea.transaction.txHash)
    throw new Error('txBytes hash mismatch')
}

function verifyPch(kea) {
  const pchBasis = kea.execution?.pchBasis
  const pch = kea.transaction?.pch

  if (!pchBasis) throw new Error('Missing pchBasis')
  if (!pch) throw new Error('Missing transaction PCH')

  const computed = sha256Json(pchBasis)

  if (computed !== pch)
    throw new Error('PCH hash mismatch')
}

function sha256Json(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj))
  return bytesToHex(sha256(bytes))
}

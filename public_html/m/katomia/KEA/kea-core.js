// kea-core.js — KEA-WEB1 (B3): the browser body of KEA over the SAME core node runs.
//
// vendor/kea-core.browser.js is a snapshot of hbarlive_hts kea/core.js (+ dealkit, the v2
// policy engine, the klotto pot builder), bundled for a browser. This file is only the
// browser's ports and config:
//
//   config   the deals this browser signs: built from the pot parameter files served
//            beside the app (./pots/<network>-<CC>.json), exactly as kea/config.js builds
//            them on the box — claim as v1, unlock as its v2 twin, both v2 ids too
//   decode   what the bytes move, via the kpool widget's protobuf.js (never the record's
//            pre-decoded lists)
//   outflow  what this browser signed in the last hour, kept in localStorage (the caps)
//   fetch    the public mirror
//
// decideRecord(record, network) → the core's verdict { ok, reason, dealId, role, cc, signers,
// outflow, checks }. Signing (kea-sign.js) then covers the record's bodyBytesHex with the
// chosen key, and the app posts the detached signature to /kpool/addSig.

import * as core from './vendor/kea-core.browser.js'
import { decodeTransaction } from '../../../vendor/kpay/kpool_widget/protobuf.js'

const POTS = ['US', 'GB', 'BR', 'CO']
const LEDGER_KEY = 'keaLedger.v1'
const HOUR_MS = 3600000

const configs = {}
export async function loadConfig(network) {
  network = String(network || 'testnet').toLowerCase()
  if (configs[network]) return configs[network]
  const entries = [], accounts = new Set(), pots = []
  for (const cc of POTS) {
    let params
    try { const r = await fetch(new URL(`./pots/${network}-${cc}.json`, import.meta.url)); if (!r.ok) continue; params = await r.json() } catch { continue }
    if (params.network !== network) continue
    const pot = core.makePot(params)
    pots.push({ cc, params, ids: pot.ids })
    entries.push(...core.entriesFromPot(pot, cc, {}))
    accounts.add(params.pool); accounts.add(params.lock)
  }
  const cfg = { network, deals: core.dealsMap(entries), accounts: [...accounts], defaultCaps: {}, pots }
  configs[network] = cfg
  return cfg
}

// the widget's decode → the pchBasis shape the core compares against
export function decodeForCore(hex2) {
  const d = decodeTransaction(hex2)
  const t = d.transfers || { hbar: [], tokens: [], nfts: [] }
  return {
    memo: d.memo || '',
    txid: d.transactionId || '',
    bodyBytesHex: d.bodyBytesHex,
    transfers: {
      hbarTransfers: (t.hbar || []).map((x) => ({ accountId: x.account, amount: Number(x.amount) })),
      tokenTransfers: (t.tokens || []).map((x) => ({ tokenId: x.token, accountId: x.account, amount: Number(x.amount) })),
      nftTransfers: (t.nfts || []).map((x) => ({ tokenId: x.token, senderAccountId: x.sender, receiverAccountId: x.receiver, serialNumber: String(x.serial) })),
    },
  }
}

// KEA-BYTES2 (2026-11-14, kmigrate SEC-SILENT1 finding KA-1; the browser twin of KEA-BYTES1 in
// hbarlive_hts kea/core.js). Before this, both of the browser KEA's paths judged one thing and
// approval signed another: the core judged the transfers decoded from record.hex2, the rule path
// judged the server's JSON (kea.execution.pchBasis, hashed against values the server also
// supplies), and approveEvent signed record.bodyBytesHex, which neither had looked at. A pool (or
// anyone answering txRead) could pass an honest transfer through the checks and have the key sign
// a different body. Now the only bytes this browser will sign are the ones that come out of this
// gate:
//   1. the body is read from hex2 by the strict widget decoder (WIDGET-STRICT1: nothing the
//      network could read differently, per-node copies agreeing apart from the node);
//   2. it is a crypto transfer, the only operation a KEA deal or rule covers;
//   3. its transaction id is the record's (so the payer is too);
//   4. record.bodyBytesHex, when present, is exactly that body;
//   5. when the caller judged transfers other than these bytes' own (the rule path's pchBasis),
//      the bytes move exactly those, row for row.
// Returns { bodyBytesHex, txid, detail } or throws with the reason.
const rowsOf = (t) => {
  t = t || {}
  const rows = []
  for (const x of t.hbarTransfers || []) rows.push(`HBAR|${x.accountId}|${Number(x.amount)}`)
  for (const x of t.tokenTransfers || []) rows.push(`FT|${x.tokenId}|${x.accountId}|${Number(x.amount)}`)
  for (const x of t.nftTransfers || []) rows.push(`NFT|${x.tokenId}#${String(x.serialNumber)}|${x.senderAccountId}>${x.receiverAccountId}`)
  return rows.filter((r) => !/^(HBAR|FT)\|.*\|0$/.test(r)).sort()
}
export function bindSignedBytes(record, txid, judgedTransfers = null) {
  if (!record?.hex2) throw new Error('no hex2: nothing to read the body from')
  const d = decodeTransaction(record.hex2)
  if (!d.isTransfer) throw new Error('the body is not a crypto transfer, which is all KEA signs')
  const want = String(txid || record.txid || '')
  if (!want || d.transactionId !== want) throw new Error(`the body's transaction id (${d.transactionId}) is not the record's (${want || 'none'})`)
  if (record.bodyBytesHex && String(record.bodyBytesHex).toLowerCase() !== d.bodyBytesHex) throw new Error("the record's bodyBytesHex is not the body inside hex2, so it is not what was judged")
  if (judgedTransfers) {
    const a = rowsOf(decodeForCore(record.hex2).transfers), b = rowsOf(judgedTransfers)
    if (a.join('\n') !== b.join('\n')) throw new Error(`the bytes move ${a.length} rows and the checked transfers ${b.length}, and they differ: the checks did not judge these bytes`)
  }
  return { bodyBytesHex: d.bodyBytesHex, txid: d.transactionId, detail: `body ${d.bodyBytesHex.length / 2} bytes, txid ${d.transactionId}${judgedTransfers ? ', moves exactly the checked transfers' : ''}` }
}

// what this browser signed, for the caps
function ledgerRows() { try { return JSON.parse(localStorage.getItem(LEDGER_KEY) || '[]') } catch { return [] } }
export function ledgerAppend(row) { const rows = ledgerRows(); rows.push({ ts: Date.now(), ...row }); while (rows.length > 500) rows.shift(); try { localStorage.setItem(LEDGER_KEY, JSON.stringify(rows)) } catch {} }
export function ledgerOutflow(dealId, sinceMs) {
  const out = {}, now = Date.now()
  for (const r of ledgerRows()) { if (r.dealId !== dealId || now - r.ts > sinceMs) continue; for (const [a, n] of Object.entries(r.outflow || {})) out[a] = (out[a] || 0) + n }
  return out
}

const fetchJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json() }

// is this pooled record a deal the core can judge at all?
export function isDealRecord(record) { return !!(record?.source?.dealTemplate || record?.deal) }

export async function decideRecord(record, network) {
  const config = await loadConfig(network)
  const ports = { fetchJson, decode: decodeForCore, outflow: (d, s) => ledgerOutflow(d, s), now: () => new Date() }
  const v = await core.decide(record, config, ports)
  if (!v?.ok) return v
  // KEA-BYTES2: the core judged hex2; the verdict carries the exact body that judgement covers,
  // and approval signs that and nothing else
  let bound
  try { bound = bindSignedBytes(record, record.txid) }
  catch (e) {
    const checks = [...(v.checks || []), { id: 'bytes', status: 'fail', detail: e.message }]
    return { ...v, ok: false, reason: 'the signed bytes are not the judged bytes: ' + e.message, checks, bodyBytesHex: null }
  }
  return { ...v, checks: [...(v.checks || []), { id: 'bytes', status: 'pass', detail: bound.detail }], bodyBytesHex: bound.bodyBytesHex }
}

export { core, HOUR_MS }

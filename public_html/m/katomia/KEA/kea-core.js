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
  return core.decide(record, config, ports)
}

export { core, HOUR_MS }

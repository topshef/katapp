// qa/decode/strict-decode.test.mjs — WIDGET-STRICT1 (kmigrate SEC-SILENT1 finding KA-3).
//
//   node qa/decode/strict-decode.test.mjs
//
// The kpool widget's decoder (public_html/vendor/kpay/kpool_widget/protobuf.js) is what the widget's
// "✔ Checked — what you see is what you approve" note and the browser KEA's rules read. Tested on
// Hedera testnet on 2026-11-14: the network refuses a repeated block but accepts a repeated single
// value and uses the LAST copy; this decoder used the FIRST. These checks hold the fix:
//   1. crafted bytes that the network would read differently are refused (code KSIG_AMBIGUOUS);
//   2. the widget then shows its loud "Do not sign" note, where the old decoder said "✔ Checked";
//   3. the browser KEA's decode port refuses them too;
//   4. every honest record still reads exactly as before: 138 real pooled records (testnet and
//      mainnet, read from the public pool on 2026-11-14), held to the old decoder's reading of each.
// Every attack check failed before the fix (run against the parent commit's decoder to see).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const W = path.join(root, 'public_html/vendor/kpay/kpool_widget')
const PB = process.env.DECODER || path.join(W, 'protobuf.js')   // DECODER=<old file> runs the attacks against another decoder
const { decodeTransaction, appendSignature, scanFields, bytesToHex } = await import(PB)

let pass = 0, fail = 0
const ok = (cond, name, extra = '') => { if (cond) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) } }
const throwsAmbiguous = (fn) => { try { fn(); return false } catch (e) { return e?.code === 'KSIG_AMBIGUOUS' } }
const throwsAny = (fn) => { try { fn(); return false } catch { return true } }

// ── a tiny encoder for crafted bodies ───────────────────────────────────────
const vi = (v) => { v = BigInt(v); const o = []; do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; o.push(b) } while (v); return o }
const cat = (...a) => Uint8Array.from(a.flatMap((x) => [...x]))
const LEN = (f, b) => cat(vi((f << 3) | 2), vi(b.length), b)
const VAR = (f, n) => cat(vi(f << 3), vi(n))
const zz = (n) => { n = BigInt(n); return n >= 0n ? n << 1n : ((-n) << 1n) - 1n }
const acct = (n) => cat(VAR(1, 0), VAR(2, 0), VAR(3, n))
const aa = (n, amt) => cat(LEN(1, acct(n)), VAR(2, zz(amt)))
const hex = (b) => Buffer.from(b).toString('hex')
const POOL = 10406132, WINNER = 7777777, ATTACKER = 6666666, TOKEN = 5555555
const txid = LEN(1, cat(LEN(1, cat(VAR(1, 1763100000), VAR(2, 1))), LEN(2, acct(WINNER))))
const memo = LEN(6, new TextEncoder().encode('klotto claim US 0.0.7777777-1763090000-1'))
const head = (node = 3) => cat(txid, LEN(2, acct(node)), VAR(3, 200000000), LEN(4, VAR(1, 120)), memo)
const ct = (...lists) => LEN(14, cat(...lists))
const tokenList = (...rows) => LEN(2, cat(LEN(1, acct(TOKEN)), ...rows.map((r) => LEN(2, r))))
const benignCT = ct(tokenList(aa(POOL, -100), aa(WINNER, 100)))
const drainCT = ct(LEN(1, cat(LEN(2, aa(POOL, -5_000_000_000)), LEN(2, aa(ATTACKER, 5_000_000_000)))))
const cryptoUpdate = LEN(15, cat(LEN(2, acct(POOL)), LEN(3, LEN(2, new Uint8Array(32).fill(0xaa)))))
// envelope: TransactionList{ Transaction{ 5: SignedTransaction{ 1: body, 2: sigMap } } ... }
const signedTx = (body, sigMap) => LEN(5, cat(LEN(1, body), ...(sigMap ? [LEN(2, sigMap)] : [])))
const list = (...bodies) => cat(...bodies.map((b) => LEN(1, signedTx(b))))
const benign = cat(head(), benignCT)

console.log('\nWIDGET-STRICT1: crafted bytes are refused')
const attacks = {
  'a second transfer block (drain) after the honest one': cat(head(), benignCT, drainCT),
  'a transfer plus a key change (fields 14 + 15)': cat(head(), benignCT, cryptoUpdate),
  'a second memo': cat(head(), benignCT, LEN(6, new TextEncoder().encode('evil'))),
  'an amount written twice (shows 100, network takes 5,000,000,000)': cat(head(), ct(tokenList(aa(POOL, -100), cat(LEN(1, acct(WINNER)), VAR(2, zz(100)), VAR(2, zz(5_000_000_000)))))),
  'a recipient account number written twice (shows the winner, network pays 0.0.6666666)': cat(head(), ct(tokenList(aa(POOL, -100), cat(LEN(1, cat(acct(WINNER), VAR(3, ATTACKER))), VAR(2, zz(100)))))),
  'a token id written twice': cat(head(), ct(LEN(2, cat(LEN(1, acct(TOKEN)), LEN(1, acct(TOKEN + 1)), LEN(2, aa(POOL, -100)), LEN(2, aa(WINNER, 100)))))),
  'an NFT serial written twice': cat(head(), ct(LEN(2, cat(LEN(1, acct(TOKEN)), LEN(3, cat(LEN(1, acct(POOL)), LEN(2, acct(WINNER)), VAR(3, 1), VAR(3, 99))))))),
  'the fee written twice': cat(head(), VAR(3, 9_000_000_000), benignCT),
  'the transaction id written twice (a second payer)': cat(head(), LEN(1, cat(LEN(1, cat(VAR(1, 1763100000), VAR(2, 1))), LEN(2, acct(ATTACKER)))), benignCT),
}
for (const [name, body] of Object.entries(attacks)) ok(throwsAmbiguous(() => decodeTransaction(hex(list(body)))), name)
ok(throwsAmbiguous(() => decodeTransaction(hex(LEN(1, cat(LEN(5, LEN(1, benign)), LEN(5, LEN(1, cat(head(), drainCT)))))))), 'a Transaction carrying two signed copies (field 5 twice)')
ok(throwsAmbiguous(() => decodeTransaction(hex(LEN(1, LEN(5, cat(LEN(1, benign), LEN(1, cat(head(), drainCT)))))))), 'a SignedTransaction carrying two bodies')
ok(throwsAmbiguous(() => decodeTransaction(hex(list(cat(head(3), benignCT), cat(head(4), drainCT))))), 'per-node copies that differ in more than the node (copy 2 drains)')
{
  const twoKindPair = cat(LEN(1, new Uint8Array(6).fill(1)), LEN(3, new Uint8Array(64).fill(2)), LEN(6, new Uint8Array(64).fill(3)))   // prefix + ed25519 + ECDSA
  ok(throwsAmbiguous(() => decodeTransaction(hex(LEN(1, signedTx(benign, LEN(1, twoKindPair)))))), 'a signature pair of two kinds at once')
}
ok(throwsAny(() => decodeTransaction(hex(list(cat(head(), cat(vi((14 << 3) | 2), vi(200)), benignCT.slice(2)))))), 'a length that runs past the end of the body')
ok(throwsAny(() => decodeTransaction('zz'.repeat(4) + hex(list(benign)))), 'non-hex input')

console.log('\nWIDGET-STRICT1: honest bytes still read')
{
  const d = decodeTransaction(hex(list(benign)))
  ok(d.memo === 'klotto claim US 0.0.7777777-1763090000-1' && d.transfers.tokens.length === 2 && d.transfers.tokens[1].amount === 100, 'a hand-built honest claim')
  const three = decodeTransaction(hex(list(cat(head(3), benignCT), cat(head(4), benignCT), cat(head(5), benignCT))))
  ok(three.nodeAccountId === '0.0.3' && three.transfers.tokens.length === 2, 'a three-node list whose copies differ only in the node')
  ok(decodeTransaction(hex(benign)).transfers.tokens.length === 2, 'a bare body (the KSIG QR form)')
}
const real = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/pooled-2026-11-14.json'))).records
let same = 0, multi = 0, diffs = []
for (const r of real) {
  try {
    const got = JSON.parse(JSON.stringify(decodeTransaction(r.hex2)))
    if (JSON.stringify(got) === JSON.stringify(r.expect)) same++; else diffs.push(r.txid)
    if ((scanFields(Buffer.from(r.hex2, 'hex')).get(1) || []).length > 1) multi++
  } catch (e) { diffs.push(`${r.txid}: ${e.message}`) }
}
ok(same === real.length, `all ${real.length} real pooled records read exactly as the old decoder read them (${multi} of them three-node lists)`, diffs.slice(0, 3).join(' | '))
{
  const r = real.find((x) => (scanFields(Buffer.from(x.hex2, 'hex')).get(1) || []).length === 1)
  const before = decodeTransaction(r.hex2).signers.length
  const after = decodeTransaction(appendSignature(r.hex2, 'ab'.repeat(32), 'cd'.repeat(64))).signers.length
  ok(after === before + 1, 'a signature can still be attached to a real record (the KSIG scan-back path)')
}
const fx = JSON.parse(fs.readFileSync(path.join(root, 'qa/sign/fixtures/txread-open.json'))).result
ok(decodeTransaction(fx.hex2).bodyBytesHex === fx.bodyBytesHex && decodeTransaction(fx.bodyBytesHex).transactionId === fx.txid, 'the signing suite\'s txread fixture (hex2 and bare body)')

// ── the widget end to end: what the person sees ─────────────────────────────
// txRead with an honest-looking display (the backend's transfer lists) over crafted bytes.
console.log('\nWIDGET-STRICT1: the widget\'s note')
if (!process.env.DECODER) {
  const store = {}
  globalThis.window = globalThis
  globalThis.location = new URL('https://lab1.katomia.com/board/qa')
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v) }, removeItem: (k) => { delete store[k] } }
  const { txRead } = await import(path.join(W, 'model.js'))
  const read = async (hex2) => {
    const result = JSON.parse(JSON.stringify(fx)); delete result.mirror; result.hex2 = hex2
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ success: true, result }) })
    const quiet = console.error; console.error = () => {}   // the widget logs BV1000x on purpose; keep the run readable
    try { return (await txRead({ network: fx.network, txid: fx.txid, pch: 'no_pch' })).transfers.bytesVerify } finally { console.error = quiet }
  }
  // the honest record: the display and the bytes agree
  const honest = await read(fx.hex2)
  ok(honest.status === 'match', 'the honest record still gets "✔ Checked"', JSON.stringify(honest.status))
  // the same record with its memo written a second time: shown transfers unchanged, bytes ambiguous
  const fxBody = Buffer.from(fx.bodyBytesHex, 'hex')
  const twoMemos = hex(list(cat(fxBody, LEN(6, new TextEncoder().encode('evil')))))
  const v = await read(twoMemos)
  ok(v.status === 'mismatch' && v.ambiguous === true, 'crafted bytes behind an honest display get the loud "Do not sign" note, not "✔ Checked"', JSON.stringify(v.status))
}

// ── the browser KEA's decode port ───────────────────────────────────────────
console.log('\nWIDGET-STRICT1: the browser KEA')
if (!process.env.DECODER) {
  const { decodeForCore } = await import(path.join(root, 'public_html/m/katomia/KEA/kea-core.js'))
  ok(decodeForCore(hex(list(benign))).transfers.tokenTransfers.length === 2, 'the KEA decode port reads an honest claim')
  ok(throwsAmbiguous(() => decodeForCore(hex(list(attacks['an amount written twice (shows 100, network takes 5,000,000,000)'])))), 'the KEA decode port refuses an amount written twice (the core then refuses at its decode step)')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

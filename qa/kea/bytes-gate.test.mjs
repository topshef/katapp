// qa/kea/bytes-gate.test.mjs — KEA-BYTES2 (kmigrate SEC-SILENT1 finding KA-1), 2026-11-14.
//
//   node qa/kea/bytes-gate.test.mjs
//
// The browser KEA judged one thing and signed another. The core judged the transfers decoded from
// record.hex2; the rule path judged the server's JSON (kea.execution.pchBasis). Approval signed
// record.bodyBytesHex, which neither path had looked at. That is the browser twin of HB-1, fixed on
// the mainnet signers by KEA-BYTES1. bindSignedBytes() in KEA/kea-core.js is now the only source of
// bytes to sign. These checks hold it:
//   - real records (testnet with KEA packages, and mainnet) bind on both paths, to their own bodyBytesHex;
//   - a pool that swaps bodyBytesHex, or whose pchBasis differs from the bytes, is refused;
//   - so is a wrong transaction id, a body that is not a transfer, and bytes the network could read
//     differently;
//   - kea-app.js signs only what the gate bound, never e.raw.bodyBytesHex.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const KEA = path.join(root, 'public_html/m/katomia/KEA')
const { bindSignedBytes, decodeForCore } = await import(path.join(KEA, 'kea-core.js'))
const { decodeTransaction } = await import(path.join(root, 'public_html/vendor/kpay/kpool_widget/protobuf.js'))

let pass = 0, fail = 0
const ok = (c, name, extra = '') => { if (c) { pass++; console.log('  ok  ', name) } else { fail++; console.log('  FAIL', name, extra) } }
const refuses = (fn, re) => { try { fn(); return false } catch (e) { return re ? re.test(e.message) : true } }

// a tiny encoder for crafted records
const vi = (v) => { v = BigInt(v); const o = []; do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; o.push(b) } while (v); return o }
const cat = (...a) => Uint8Array.from(a.flatMap((x) => [...x]))
const LEN = (f, b) => cat(vi((f << 3) | 2), vi(b.length), b)
const VAR = (f, n) => cat(vi(f << 3), vi(n))
const zz = (n) => { n = BigInt(n); return n >= 0n ? n << 1n : ((-n) << 1n) - 1n }
const acct = (n) => cat(VAR(1, 0), VAR(2, 0), VAR(3, n))
const aa = (n, amt) => cat(LEN(1, acct(n)), VAR(2, zz(amt)))
const hex = (b) => Buffer.from(b).toString('hex')
const POOL = 10406132, WINNER = 7777777, ATTACKER = 6666666
const TXID = `0.0.${WINNER}@1763100000.000000001`
const head = (payer = WINNER, node = 3) => cat(LEN(1, cat(LEN(1, cat(VAR(1, 1763100000), VAR(2, 1))), LEN(2, acct(payer)))), LEN(2, acct(node)), VAR(3, 200000000), LEN(4, VAR(1, 120)), LEN(6, new TextEncoder().encode('klotto claim')))
const hbar = (...rows) => LEN(14, LEN(1, cat(...rows.map((r) => LEN(1, r)))))   // CryptoTransfer{1: TransferList{1: AccountAmount[]}}
const honestBody = cat(head(), hbar(aa(POOL, -100), aa(WINNER, 100)))
const drainBody = cat(head(), hbar(aa(POOL, -5_000_000_000), aa(ATTACKER, 5_000_000_000)))
const list = (...bodies) => hex(cat(...bodies.map((b) => LEN(1, LEN(5, LEN(1, b))))))
const honestJudged = { hbarTransfers: [{ accountId: `0.0.${POOL}`, amount: -100 }, { accountId: `0.0.${WINNER}`, amount: 100 }], tokenTransfers: [], nftTransfers: [] }

console.log('\nKEA-BYTES2: real records bind, to their own body')
const real = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/pooled-kea-2026-11-14.json'))).records
{
  let core = 0, rule = 0, basis = 0, same = 0, errs = []
  for (const x of real) {
    try { const b = bindSignedBytes(x.record, x.txid); core++; if (b.bodyBytesHex === x.record.bodyBytesHex) same++ } catch (e) { errs.push(`${x.txid}: ${e.message}`) }
    const pb = x.record.kea?.execution?.pchBasis?.transfers
    if (pb) { try { bindSignedBytes(x.record, x.txid, pb); rule++ } catch (e) { errs.push(`rule ${x.txid}: ${e.message}`) } }
    try { bindSignedBytes(x.record, x.txid, x.record.PCH_basis.transfers); basis++ } catch (e) { errs.push(`basis ${x.txid}: ${e.message}`) }
  }
  const withKea = real.filter((x) => x.record.kea).length
  ok(core === real.length && same === real.length, `all ${real.length} real records bind on the core path, each to its own bodyBytesHex`, errs.slice(0, 2).join(' | '))
  ok(rule === withKea && withKea > 0, `all ${withKea} real KEA packages bind on the rule path: the bytes move exactly their pchBasis`, errs.slice(0, 2).join(' | '))
  ok(basis === real.length, `all ${real.length} move exactly their PCH_basis`, errs.slice(0, 2).join(' | '))
}
ok(bindSignedBytes({ hex2: list(honestBody), bodyBytesHex: hex(honestBody) }, TXID, honestJudged).bodyBytesHex === hex(honestBody), 'a hand-built honest claim binds')
ok(bindSignedBytes({ hex2: list(cat(head(WINNER, 3), hbar(aa(POOL, -100), aa(WINNER, 100))), cat(head(WINNER, 4), hbar(aa(POOL, -100), aa(WINNER, 100)))) }, TXID).bodyBytesHex.length > 0, 'a two-node list whose copies differ only in the node binds')

console.log('\nKEA-BYTES2: judged one thing, asked to sign another — refused')
ok(refuses(() => bindSignedBytes({ hex2: list(honestBody), bodyBytesHex: hex(drainBody) }, TXID), /bodyBytesHex is not the body inside hex2/), 'the pool swaps bodyBytesHex for a drain (the HB-1 shape): refused')
{
  const r = real[0].record
  const other = real.find((x) => x.record.bodyBytesHex !== r.bodyBytesHex).record
  ok(refuses(() => bindSignedBytes({ ...r, bodyBytesHex: other.bodyBytesHex }, real[0].txid), /not the body inside hex2/), "a real record carrying another real record's bodyBytesHex: refused")
}
ok(refuses(() => bindSignedBytes({ hex2: list(drainBody), bodyBytesHex: hex(drainBody) }, TXID, honestJudged), /differ/), 'the rule judged an honest pchBasis but the bytes drain: refused')
ok(refuses(() => bindSignedBytes({ hex2: list(honestBody) }, TXID, { ...honestJudged, hbarTransfers: [...honestJudged.hbarTransfers, { accountId: '0.0.98', amount: 1 }] }), /differ/), 'the bytes move fewer rows than were judged: refused')
ok(refuses(() => bindSignedBytes({ hex2: list(honestBody) }, `0.0.${ATTACKER}@1763100000.000000001`), /transaction id/), 'the body pays from another account than the record says: refused')
ok(refuses(() => bindSignedBytes({ hex2: list(cat(head(), LEN(15, cat(LEN(2, acct(POOL)), LEN(3, LEN(2, new Uint8Array(32).fill(0xaa))))))) }, TXID), /not a crypto transfer/), 'a key change instead of a transfer: refused')
ok(refuses(() => bindSignedBytes({ hex2: list(cat(head(), hbar(aa(POOL, -100), cat(LEN(1, acct(WINNER)), VAR(2, zz(100)), VAR(2, zz(5_000_000_000)))))) }, TXID), /appears 2 times/), 'an amount written twice (the network takes the last): refused')
ok(refuses(() => bindSignedBytes({ hex2: list(cat(head(WINNER, 3), hbar(aa(POOL, -100), aa(WINNER, 100))), cat(head(WINNER, 4), hbar(aa(POOL, -5_000_000_000), aa(ATTACKER, 5_000_000_000)))) }, TXID), /different transaction/), 'node copy 2 is a drain: refused')
ok(refuses(() => bindSignedBytes({ bodyBytesHex: hex(honestBody) }, TXID), /no hex2/), 'body bytes with no hex2 to read them from: refused')

console.log('\nKEA-BYTES2: the app signs only what the gate bound')
{
  const app = fs.readFileSync(path.join(KEA, 'kea-app.js'), 'utf8')
  const signs = [...app.matchAll(/signApprovalPackage\(([^)]*)\)/g)].map((m) => m[1])
  ok(signs.length === 1 && /e\.signBytes/.test(signs[0]) && !/e\.raw/.test(signs[0]), 'approveEvent signs e.signBytes, never e.raw.bodyBytesHex', JSON.stringify(signs))
  ok(/\(e\.raw\?\.bodyBytesHex \|\| e\.raw\?\.hex2\) && !e\.signBytes\) throw/.test(app), 'and refuses a record with transaction bytes that nothing bound')
  ok((app.match(/e\.signBytes = /g) || []).length >= 3 && /bindSignedBytes\(out, e\.txid, out\.kea\?\.execution\?\.pchBasis/.test(app), 'both paths set e.signBytes only through the gate (the rule path against its pchBasis)')
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

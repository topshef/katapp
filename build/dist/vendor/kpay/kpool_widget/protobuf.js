// protobuf.js
//
// Minimal, dependency-free protobuf reader + a Hedera transaction decoder, for
// the browser. v1 scope: DECODE a Hedera transaction envelope (hex2) so the
// widget can verify what's being signed — transfers, memo, transaction id,
// node, fee, and any signatures already attached.
//
// No SDK, no protobufjs — just the wire format. Hedera's transaction is a few
// nested length-delimited messages; we walk them by field number.
//
//   TransactionList #1
//     Transaction #5  = signedTransactionBytes
//       SignedTransaction
//         #1 bodyBytes  → TransactionBody
//         #2 sigMap     → SignatureMap { #1 sigPair[] }
//
// Verified byte-exact against a live mainnet kpool transaction (token transfers
// and signer list matched the server's decode).
//
// USAGE
//   import { decodeTransaction } from './protobuf.js'
//   const tx = decodeTransaction(hex2)        // hex string OR Uint8Array
//   tx.transfers.tokens   // [{ token, account, amount }]   amount is signed
//   tx.transfers.nfts     // [{ token, sender, receiver, serial }]
//   tx.memo, tx.transactionId, tx.nodeAccountId, tx.transactionFee
//   tx.validDurationSeconds                                  (VALIDD1)
//   tx.signers            // [{ pubKeyPrefix, sig, type }]  already-attached sigs
//
// Generic primitives are exported too (readVarint, scanFields, decodeMessage)
// for any other Hedera message you need to read later.

// ── wire-format primitives ──────────────────────────────────────────────────

const WIRE = { VARINT: 0, I64: 1, LEN: 2, I32: 5 }

function toBytes(input) {
	if (input instanceof Uint8Array) return input
	if (typeof input === 'string') {
		const hex = input.trim().toLowerCase().replace(/^0x/, '')
		if (hex.length % 2) throw new Error('protobuf: odd-length hex')
		// WIDGET-STRICT1: parseInt('zz', 16) is NaN, which a Uint8Array stores as 0, so
		// non-hex used to decode quietly as zero bytes. Refuse it instead.
		if (!/^[0-9a-f]*$/.test(hex)) throw new Error('protobuf: not a hex string')
		const out = new Uint8Array(hex.length / 2)
		for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
		return out
	}
	throw new Error('protobuf: expected hex string or Uint8Array')
}

function bytesToHex(b) {
	let s = ''
	for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0')
	return s
}

// LEB128 varint as BigInt (Hedera amounts/fees exceed 2^53). Returns [value, nextOffset].
export function readVarint(buf, offset) {
	let shift = 0n
	let result = 0n
	let o = offset
	while (true) {
		if (o >= buf.length) throw new Error('protobuf: varint overran buffer')
		const byte = BigInt(buf[o++])
		result |= (byte & 0x7fn) << shift
		if (!(byte & 0x80n)) break
		shift += 7n
	}
	return [result, o]
}

// zigzag decode for sint32/sint64 (Hedera AccountAmount.amount is signed)
function zigzag(n) {
	return (n >> 1n) ^ -(n & 1n)
}

// WIDGET-STRICT1 (2026-11-14, kmigrate SEC-SILENT1 finding KA-3; the same rule as KSIGN-STRICT1 in
// ksig ksign/lib/protobuf.js and KEA-BYTES1 in hbarlive_hts kea/decode.js). A value written twice is
// read differently by different parsers. Tested on Hedera testnet that day: the network REFUSES a
// repeated block but ACCEPTS a repeated single value and uses the LAST copy, while this decoder took
// the FIRST. So crafted bytes could pass the widget's "✔ Checked" (and the browser KEA's rules) with
// "100 to the winner" while the network moved 5,000 HBAR elsewhere. Anything the network could read
// differently from what this decoder reports is now refused: a repeated single field, two operations
// in one body, a key of two kinds, per-node copies that differ in more than the node. Nothing honest
// is lost: the Hedera SDK and the backend never write a field twice (checked against 138 real pooled
// records, testnet and mainnet, on 2026-11-14).
export class AmbiguousTransaction extends Error {
	constructor(msg) {
		super(`protobuf: ${msg}. Another reader (the network takes the last copy) could see a different transaction, so it is refused`)
		this.code = 'KSIG_AMBIGUOUS'
	}
}

// Walk one message level. Returns a Map of fieldNumber → array of raw values
// (Uint8Array for LEN, BigInt for VARINT/I64/I32). Repeated fields collect.
// A length that runs past the end is refused (it used to be cut short silently).
export function scanFields(buf) {
	const fields = new Map()
	let o = 0
	const push = (f, v) => {
		if (!fields.has(f)) fields.set(f, [])
		fields.get(f).push(v)
	}
	while (o < buf.length) {
		let tag
		;[tag, o] = readVarint(buf, o)
		const field = Number(tag >> 3n)
		const wire = Number(tag & 7n)
		if (wire === WIRE.LEN) {
			let len
			;[len, o] = readVarint(buf, o)
			const n = Number(len)
			if (o + n > buf.length) throw new Error(`protobuf: field ${field} claims ${n} bytes but only ${buf.length - o} remain`)
			push(field, buf.slice(o, o + n))
			o += n
		} else if (wire === WIRE.VARINT) {
			let v
			;[v, o] = readVarint(buf, o)
			push(field, v)
		} else if (wire === WIRE.I64) {
			if (o + 8 > buf.length) throw new Error(`protobuf: field ${field} overruns the buffer`)
			push(field, buf.slice(o, o + 8)); o += 8
		} else if (wire === WIRE.I32) {
			if (o + 4 > buf.length) throw new Error(`protobuf: field ${field} overruns the buffer`)
			push(field, buf.slice(o, o + 4)); o += 4
		} else {
			throw new Error(`protobuf: unsupported wire type ${wire} (field ${field})`)
		}
	}
	return fields
}

// the one value of a single field, or undefined. A single field written twice is refused (WIDGET-STRICT1).
const first = (fields, n) => {
	const v = fields.get(n)
	if (v && v.length > 1) throw new AmbiguousTransaction(`field ${n} appears ${v.length} times where only one is allowed`)
	return v ? v[0] : undefined
}
// the first entry of a field that legitimately repeats: a TransactionList's per-node transactions
const firstOfList = (fields, n) => (fields.get(n) || [])[0]
const all = (fields, n) => fields.get(n) || []

// ── Hedera message decoders ──────────────────────────────────────────────────

// AccountID { shardNum=1, realmNum=2, accountNum=3 }  → "0.0.123"
function decodeAccountId(buf) {
	if (!buf) return null
	const f = scanFields(buf)
	const num = n => Number(first(f, n) ?? 0n)
	return `${num(1)}.${num(2)}.${num(3)}`
}

// Timestamp { seconds=1, nanos=2 }
function decodeTimestamp(buf) {
	if (!buf) return null
	const f = scanFields(buf)
	return { seconds: Number(first(f, 1) ?? 0n), nanos: Number(first(f, 2) ?? 0n) }
}

// TransactionID { transactionValidStart=1 (Timestamp), accountID=2, scheduled=3, nonce=4 }
function decodeTransactionId(buf) {
	if (!buf) return null
	const f = scanFields(buf)
	const start = decodeTimestamp(first(f, 1))
	const account = decodeAccountId(first(f, 2))
	// canonical string form: 0.0.x@seconds.nanos
	const str = account && start
		? `${account}@${start.seconds}.${String(start.nanos).padStart(9, '0')}`
		: null
	return { account, validStart: start, scheduled: !!Number(first(f, 3) ?? 0n), string: str }
}

// AccountAmount { accountID=1, amount=2 (sint64, zigzag), isApproval=3 }
function decodeAccountAmount(buf) {
	const f = scanFields(buf)
	const amtRaw = first(f, 2) ?? 0n
	return {
		account: decodeAccountId(first(f, 1)),
		amount: Number(zigzag(amtRaw)),       // signed; safe for token/hbar magnitudes here
		amountRaw: amtRaw.toString(),
		isApproval: !!Number(first(f, 3) ?? 0n)
	}
}

// TransferList { accountAmounts=1 }  (hbar transfers)
function decodeHbarTransfers(buf) {
	if (!buf) return []
	const f = scanFields(buf)
	return all(f, 1).map(decodeAccountAmount)
}

// NftTransfer { senderAccountID=1, receiverAccountID=2, serialNumber=3 (int64), isApproval=4 }
function decodeNftTransfer(buf, token) {
	const f = scanFields(buf)
	return {
		token,
		sender: decodeAccountId(first(f, 1)),
		receiver: decodeAccountId(first(f, 2)),
		serial: Number(first(f, 3) ?? 0n),
		isApproval: !!Number(first(f, 4) ?? 0n)
	}
}

// TokenTransferList { token=1, transfers=2 (AccountAmount), nftTransfers=3, expectedDecimals=4 }
// Returns BOTH fungible rows and NFT rows (PROTO1: nftTransfers were previously
// ignored, which would have made a bytes-vs-display verification blind to NFTs —
// the main collectible flow).
function decodeTokenTransferList(buf) {
	const f = scanFields(buf)
	const token = decodeAccountId(first(f, 1))
	const tokens = all(f, 2).map(aa => {
		const t = decodeAccountAmount(aa)
		return { token, account: t.account, amount: t.amount, amountRaw: t.amountRaw }
	})
	const nfts = all(f, 3).map(nt => decodeNftTransfer(nt, token))
	return { tokens, nfts }
}

// CryptoTransferTransactionBody { transfers=1 (TransferList), tokenTransfers=2 (TokenTransferList[]) }
function decodeCryptoTransfer(buf) {
	const f = scanFields(buf)
	const hbar = decodeHbarTransfers(first(f, 1))
	const tokens = []
	const nfts = []
	for (const tl of all(f, 2)) {
		const d = decodeTokenTransferList(tl)
		tokens.push(...d.tokens)
		nfts.push(...d.nfts)
	}
	return { hbar, tokens, nfts }
}

// SignaturePair { pubKeyPrefix=1, ed25519=3, ECDSASecp256k1=6, ... }
function decodeSignaturePair(buf) {
	const f = scanFields(buf)
	// a pair is one prefix and ONE signature of one kind; two kinds at once would be read
	// either way by different parsers (WIDGET-STRICT1)
	const kinds = [...f.keys()].filter(k => k !== 1)
	if (kinds.length > 1) throw new AmbiguousTransaction(`a signature pair carries ${kinds.length} kinds at once (fields ${kinds.join(', ')})`)
	const prefix = first(f, 1)
	const ed = first(f, 3)
	const ecdsa = first(f, 6)
	const sig = ed || ecdsa
	return {
		pubKeyPrefix: prefix ? bytesToHex(prefix) : null,
		sig: sig ? bytesToHex(sig) : null,
		type: ed ? 'ed25519' : ecdsa ? 'ecdsa' : 'unknown'
	}
}

// SignatureMap { sigPair=1 }
function decodeSigMap(buf) {
	if (!buf) return []
	const f = scanFields(buf)
	return all(f, 1).map(decodeSignaturePair)
}

// Duration { seconds=1 (int64) }
function decodeDuration(buf) {
	if (!buf) return null
	const f = scanFields(buf)
	return Number(first(f, 1) ?? 0n)
}

// TransactionBody — only the fields we need to verify a transfer.
//   transactionID=1, nodeAccountID=2, transactionFee=3, validDuration=4,
//   memo=6, cryptoTransfer=14
// The body's header fields (transactionID, node, fee, validDuration, generateRecord, memo,
// max_custom_fees=73, batch_key=1001); every other top-level field is an operation, and a body
// carries exactly one (the network refuses two, and a reader that picks one would show the wrong
// one). The same set as KSIGN-STRICT1.
const BODY_HEADER_FIELDS = new Set([1, 2, 3, 4, 5, 6, 73, 1001])

function decodeTransactionBody(buf) {
	const f = scanFields(buf)
	const ops = [...f.keys()].filter(k => !BODY_HEADER_FIELDS.has(k))
	if (ops.length > 1) throw new AmbiguousTransaction(`more than one operation in one body (fields ${ops.join(', ')})`)
	const memoBytes = first(f, 6)
	const ctBytes = first(f, 14)
	return {
		transactionId: decodeTransactionId(first(f, 1)),
		nodeAccountId: decodeAccountId(first(f, 2)),
		transactionFee: (first(f, 3) ?? 0n).toString(),   // tinybars, as string (can be large)
		validDurationSeconds: decodeDuration(first(f, 4)),   // VALIDD1: the real window, from the signed bytes
		memo: memoBytes ? new TextDecoder().decode(memoBytes) : '',
		transfers: ctBytes ? decodeCryptoTransfer(ctBytes) : { hbar: [], tokens: [], nfts: [] },
		_hasCryptoTransfer: ctBytes !== undefined
	}
}

// A body's bytes with its nodeAccountID (field 2) left out, as a hex string, for comparing the
// per-node copies of one transaction. Walks the top level only; the bytes are copied as written.
function bodyWithoutNode(body) {
	const keep = []
	let o = 0
	while (o < body.length) {
		const start = o
		let tag
		;[tag, o] = readVarint(body, o)
		const field = Number(tag >> 3n), wire = Number(tag & 7n)
		if (wire === WIRE.LEN) { let len; [len, o] = readVarint(body, o); o += Number(len) }
		else if (wire === WIRE.VARINT) { ;[, o] = readVarint(body, o) }
		else if (wire === WIRE.I64) o += 8
		else if (wire === WIRE.I32) o += 4
		else throw new Error(`protobuf: unsupported wire type ${wire} (field ${field})`)
		if (o > body.length) throw new Error(`protobuf: field ${field} overruns the body`)
		if (field !== 2) keep.push(bytesToHex(body.subarray(start, o)))
	}
	return keep.join('')
}

// Every per-node copy in a TransactionList must be the same transaction apart from the node it is
// addressed to. Otherwise the copy shown here (the first) need not be the copy a node executes.
function checkNodeCopiesAgree(txs) {
	if (txs.length < 2) return
	let ref = null
	txs.forEach((tx, i) => {
		const st = first(scanFields(tx), 5)
		const body = st instanceof Uint8Array ? first(scanFields(st), 1) : undefined
		if (!(body instanceof Uint8Array)) throw new AmbiguousTransaction(`node copy ${i + 1} of ${txs.length} has no body`)
		const k = bodyWithoutNode(body)
		if (ref === null) ref = k
		else if (k !== ref) throw new AmbiguousTransaction(`node copy ${i + 1} of ${txs.length} is a different transaction from copy 1`)
	})
}

// Unwrap the outer envelope to get { bodyBytes, sigMapBytes }.
// Accepts either a TransactionList(#1 → Transaction) or a bare Transaction, and
// either modern (Transaction #5 = signedTransactionBytes) or a raw
// SignedTransaction / raw TransactionBody. We sniff which we were handed.
function unwrap(buf) {
	let f = scanFields(buf)

	// TransactionList: field 1 is a Transaction. Heuristic: field 1 LEN present
	// AND it itself contains a field 5 (signedTransactionBytes). Take first tx.
	// A list legitimately repeats field 1 (one copy per node), so this read is firstOfList;
	// every other copy must say the same apart from its node (WIDGET-STRICT1).
	const f1 = firstOfList(f, 1)
	if (f1 instanceof Uint8Array) {
		const inner = (() => { try { return scanFields(f1) } catch { return null } })()
		if (inner && inner.has(5)) {
			checkNodeCopiesAgree(all(f, 1))
			f = inner   // descend into the Transaction
		}
	}

	// Transaction (modern): field 5 = signedTransactionBytes (a SignedTransaction)
	const st = first(f, 5)
	if (st instanceof Uint8Array) {
		const stf = scanFields(st)
		return { bodyBytes: first(stf, 1), sigMapBytes: first(stf, 2) }
	}

	// Disambiguate bare TransactionBody vs bare SignedTransaction. Both can
	// present as two LEN fields {1,2} (a TransactionID also has that shape, so
	// "field 1 has a field 1" is NOT a valid body test — that heuristic
	// misread a bare body's transactionID as bodyBytes, yielding a txid of
	// 0.0.0@0.000000000 for the bare bodyBytesHex the KSIG QR carries).
	// Structural markers: a TransactionBody carries a fee (3, varint), a
	// validDuration (4), or a data field (≥7: cryptoTransfer=14,
	// cryptoUpdateAccount=15, …); a SignedTransaction never has fields beyond 2.
	// Ported from ksig@lab23 ksign/lib/protobuf.js (the fork of this file).
	const looksLikeBody = fields => [...fields.keys()].some(k => k === 3 || k === 4 || k >= 7)

	if (looksLikeBody(f)) return { bodyBytes: buf, sigMapBytes: undefined }

	// SignedTransaction handed directly: field 1 must itself decode as a body
	const maybeBody = first(f, 1)
	if (maybeBody instanceof Uint8Array) {
		const bf = (() => { try { return scanFields(maybeBody) } catch { return null } })()
		if (bf && looksLikeBody(bf)) return { bodyBytes: maybeBody, sigMapBytes: first(f, 2) }
	}

	// Fallback: the buffer itself is a TransactionBody
	return { bodyBytes: buf, sigMapBytes: undefined }
}


// ── encode primitives (re-attach a signature, client side) ───────────────────
function encodeVarint(value) {
	let v = BigInt(value)
	const out = []
	do {
		let b = Number(v & 0x7fn)
		v >>= 7n
		if (v > 0n) b |= 0x80
		out.push(b)
	} while (v > 0n)
	return Uint8Array.from(out)
}

function concatBytes(...chunks) {
	const len = chunks.reduce((s, c) => s + c.length, 0)
	const out = new Uint8Array(len)
	let o = 0
	for (const c of chunks) { out.set(c, o); o += c.length }
	return out
}

// length-delimited field: tag (fieldNum<<3 | 2) + length + bytes
function encodeLenField(fieldNum, bytes) {
	return concatBytes(encodeVarint((fieldNum << 3) | 2), encodeVarint(bytes.length), bytes)
}

// raw 32-byte ed25519 key (strip 12-byte DER SPKI prefix if present)
function rawEd25519PubKey(input) {
	const b = toBytes(input)
	if (b.length === 44) return b.slice(12)
	return b
}

// appendSignature(envelope, pubKey, sig) -> hex of a full TransactionList with the
// new ed25519 sigPair ADDED to the SignedTransaction sigMap (existing pairs kept).
export function appendSignature(envelope, pubKey, sig) {
	const { bodyBytes, sigMapBytes } = unwrap(toBytes(envelope))
	if (!bodyBytes) throw new Error('protobuf: no bodyBytes to sign over')

	const pk = rawEd25519PubKey(pubKey)
	const sg = toBytes(sig)

	const sigPair = concatBytes(encodeLenField(1, pk), encodeLenField(3, sg))      // SignaturePair {1 pubKeyPrefix, 3 ed25519}
	const existing = sigMapBytes || new Uint8Array(0)
	const sigMap = concatBytes(existing, encodeLenField(1, sigPair))               // SignatureMap {1 sigPair[]}
	const signedTx = concatBytes(encodeLenField(1, bodyBytes), encodeLenField(2, sigMap)) // SignedTransaction {1 body, 2 sigMap}
	const transaction = encodeLenField(5, signedTx)                               // Transaction {5 signedTransactionBytes}
	const txList = encodeLenField(1, transaction)                                 // TransactionList {1 transaction}
	return bytesToHex(txList)
}

// ── public API ───────────────────────────────────────────────────────────────

// decodeTransaction(hex2) → friendly object describing the transaction.
export function decodeTransaction(input) {
	const buf = toBytes(input)
	const { bodyBytes, sigMapBytes } = unwrap(buf)
	if (!bodyBytes) throw new Error('protobuf: could not locate bodyBytes in transaction')

	const body = decodeTransactionBody(bodyBytes)
	const signers = decodeSigMap(sigMapBytes)

	return {
		transactionId: body.transactionId?.string || null,
		payerAccount: body.transactionId?.account || null,
		nodeAccountId: body.nodeAccountId,
		transactionFee: body.transactionFee,
		validDurationSeconds: body.validDurationSeconds,   // VALIDD1 (null when absent)
		memo: body.memo,
		transfers: body.transfers,           // { hbar:[{account,amount}], tokens:[{token,account,amount}], nfts:[{token,sender,receiver,serial}] }
		signers,                              // [{ pubKeyPrefix, sig, type }]
		isTransfer: body._hasCryptoTransfer,
		bodyBytesHex: bytesToHex(bodyBytes)
	}
}

// Low-level escape hatch: decode any message to a field Map (for ad-hoc reads).
export function decodeMessage(input) {
	return scanFields(toBytes(input))
}

export { toBytes, bytesToHex }

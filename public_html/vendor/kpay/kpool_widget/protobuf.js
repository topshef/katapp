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
//   tx.memo, tx.transactionId, tx.nodeAccountId, tx.transactionFee
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

// Walk one message level. Returns a Map of fieldNumber → array of raw values
// (Uint8Array for LEN, BigInt for VARINT/I64/I32). Repeated fields collect.
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
			push(field, buf.slice(o, o + n))
			o += n
		} else if (wire === WIRE.VARINT) {
			let v
			;[v, o] = readVarint(buf, o)
			push(field, v)
		} else if (wire === WIRE.I64) {
			push(field, buf.slice(o, o + 8)); o += 8
		} else if (wire === WIRE.I32) {
			push(field, buf.slice(o, o + 4)); o += 4
		} else {
			throw new Error(`protobuf: unsupported wire type ${wire} (field ${field})`)
		}
	}
	return fields
}

// convenience: first value of a field, or undefined
const first = (fields, n) => (fields.get(n) || [])[0]
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

// TokenTransferList { token=1, transfers=2 (AccountAmount), nftTransfers=3, expectedDecimals=4 }
function decodeTokenTransferList(buf) {
	const f = scanFields(buf)
	const token = decodeAccountId(first(f, 1))
	return all(f, 2).map(aa => {
		const t = decodeAccountAmount(aa)
		return { token, account: t.account, amount: t.amount, amountRaw: t.amountRaw }
	})
}

// CryptoTransferTransactionBody { transfers=1 (TransferList), tokenTransfers=2 (TokenTransferList[]) }
function decodeCryptoTransfer(buf) {
	const f = scanFields(buf)
	const hbar = decodeHbarTransfers(first(f, 1))
	const tokens = []
	for (const tl of all(f, 2)) tokens.push(...decodeTokenTransferList(tl))
	return { hbar, tokens }
}

// SignaturePair { pubKeyPrefix=1, ed25519=3, ECDSASecp256k1=6, ... }
function decodeSignaturePair(buf) {
	const f = scanFields(buf)
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

// TransactionBody — only the fields we need to verify a transfer.
//   transactionID=1, nodeAccountID=2, transactionFee=3, validDuration=4,
//   memo=6, cryptoTransfer=14
function decodeTransactionBody(buf) {
	const f = scanFields(buf)
	const memoBytes = first(f, 6)
	const ctBytes = first(f, 14)
	return {
		transactionId: decodeTransactionId(first(f, 1)),
		nodeAccountId: decodeAccountId(first(f, 2)),
		transactionFee: (first(f, 3) ?? 0n).toString(),   // tinybars, as string (can be large)
		validDurationSeconds: ctBytes === undefined ? null : null,  // (rarely needed; left out)
		memo: memoBytes ? new TextDecoder().decode(memoBytes) : '',
		transfers: ctBytes ? decodeCryptoTransfer(ctBytes) : { hbar: [], tokens: [] },
		_hasCryptoTransfer: ctBytes !== undefined
	}
}

// Unwrap the outer envelope to get { bodyBytes, sigMapBytes }.
// Accepts either a TransactionList(#1 → Transaction) or a bare Transaction, and
// either modern (Transaction #5 = signedTransactionBytes) or a raw
// SignedTransaction / raw TransactionBody. We sniff which we were handed.
function unwrap(buf) {
	let f = scanFields(buf)

	// TransactionList: field 1 is a Transaction. Heuristic: field 1 LEN present
	// AND it itself contains a field 5 (signedTransactionBytes). Take first tx.
	const f1 = first(f, 1)
	if (f1 instanceof Uint8Array) {
		const inner = (() => { try { return scanFields(f1) } catch { return null } })()
		if (inner && inner.has(5)) {
			f = inner   // descend into the Transaction
		}
	}

	// Transaction (modern): field 5 = signedTransactionBytes (a SignedTransaction)
	const st = first(f, 5)
	if (st instanceof Uint8Array) {
		const stf = scanFields(st)
		return { bodyBytes: first(stf, 1), sigMapBytes: first(stf, 2) }
	}

	// SignedTransaction handed directly: field 1 bodyBytes, field 2 sigMap
	// (only treat as such if field 1 decodes as a TransactionBody — i.e. has a
	// transactionID at field 1). Otherwise assume we were given a TransactionBody.
	const maybeBody = first(f, 1)
	if (maybeBody instanceof Uint8Array) {
		const bf = (() => { try { return scanFields(maybeBody) } catch { return null } })()
		if (bf && bf.has(1)) return { bodyBytes: maybeBody, sigMapBytes: first(f, 2) }
	}

	// Fallback: the buffer itself is a TransactionBody
	return { bodyBytes: buf, sigMapBytes: undefined }
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
		memo: body.memo,
		transfers: body.transfers,           // { hbar:[{account,amount}], tokens:[{token,account,amount}] }
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

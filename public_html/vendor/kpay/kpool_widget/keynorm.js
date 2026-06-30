// keynorm.js — the ONE public-key normalizer shared by readiness (model.js) and
// view (view.js). Previously each kept its own copy + prefix list; they drifted
// (ECDSA prefix added to model but not view → WC-ECDSA1 pt2: header said "satisfied"
// while the row stayed orange). SIGN-NORM1: single source so they can't diverge.
//
// A pubkey arrives either raw (from a signature pubKey) or DER/SPKI-wrapped (from
// getKeyInfo/kpos). ED25519 → 32-byte (64 hex) raw; ECDSA secp256k1 → 33-byte
// compressed (66 hex) raw. Missing a prefix leaves the key DER-wrapped so it never
// matches its raw signature → a legit signature shows as a "witness".
export const KEY_PREFIXES = [
	{ prefix: '302a300506032b6570032100',                 label: 'ED25519 DER' },
	{ prefix: '302d300706052b8104000a032200',             label: 'ECDSA secp256k1 DER' },
	{ prefix: '3036301006072a8648ce3d020106052b8104000a032200', label: 'ECDSA secp256k1 SPKI' },
]

export function normalizePublicKey(key) {
	if (!key) return null
	let k = key.toLowerCase()
	for (const { prefix, label } of KEY_PREFIXES) {
		if (k.startsWith(prefix)) {
			const raw = k.slice(prefix.length)
			console.debug('[keynorm] stripped', label, 'prefix:', k.slice(0, 14), '→', raw.slice(0, 14))
			k = raw
			break
		}
	}
	// 64 = ED25519 (32B), 66 = ECDSA secp256k1 compressed (33B). Anything else means
	// an unrecognised wrapping (would cause a signed≠required mismatch) — warn loudly.
	if (k.length !== 64 && k.length !== 66) {
		console.warn('[keynorm] unexpected key length after normalisation:', k.length, 'key:', k.slice(0, 14))
	}
	return k
}

// Normalize a key tree in place: leaves are pubkey strings (or shaped like
// { _type:'ED25519', key:'…' } / ed25519 / ECDSASecp256k1 fields from the raw mirror
// keyInfo); threshold nodes carry a `keys` array. Returns each leaf as a plain
// normalized pubkey string so consumers (readiness match, kpie) can compare directly.
export function normalizeKeyTree(node) {
	if (!node) return null
	if (typeof node === 'string') return normalizePublicKey(node)
	if (!Array.isArray(node.keys)) {
		const raw = node.key ?? node.ed25519 ?? node.ECDSASecp256k1 ?? null
		return raw != null ? normalizePublicKey(String(raw)) : null
	}
	return { ...node, keys: node.keys.map(normalizeKeyTree) }
}

const accountLabelCache={}
const accountLabelPending=new Set()

// Hard-coded names for well-known Hedera system accounts — the first non-xproof
// naming source (user 2026-07-07: xproof adoption can't be assumed for these).
// Terminology per HIP-1259 (fee collection) + Hedera staking docs. Extend here, or
// swap for a served lookup when a broader registry (council members etc.) exists.
// Network-agnostic: these entity numbers are system-reserved on every Hedera network.
const WELL_KNOWN_ACCOUNTS={
	'0.0.98':  { domain:null, name:'Hedera treasury' },
	'0.0.800': { domain:null, name:'Hedera staking rewards' },
	'0.0.801': { domain:null, name:'Hedera node rewards' },
	'0.0.802': { domain:null, name:'Hedera fee collection' },
}

// XPROOF-VERIFY2 (2026-09-20): back on, and on the BIDIRECTIONAL route.
//
// The history this line has been through is worth keeping, because it is one mistake made
// twice. XPROOF-ROUTE1 (2026-08-21) moved this off /domain/query/<id> to /api/?accountId=
// because /domain/query had stopped answering — its upstream explore.hbar.live had died and
// the fetch had no timeout, so the modal's enrichment silently never arrived. The swap was
// reverted the NEXT DAY in xbar's cdn/xproof.js as a security regression (XPROOF-REVERT1):
// /api/ reported the ON-CHAIN claim alone, so a domain named in an attestation showed as
// identity whether or not that domain agreed — and it carried no name at all, so every label
// went blank. That revert never reached THIS file, which sat on the weaker route until it
// was disabled outright on 2026-08-27 (xproof.live was then the compromised box).
//
// Both conditions are now gone. xproof.live is a Cloudflare Worker — verified 2026-09-20:
// it resolves to Cloudflare anycast (104.21.79.85 / 172.67.169.105), not 176.126.78.48, and
// every route including the retired ones is answered by the Worker with no origin behind it.
//
// /XVERIFY/?account= replaces both old routes and keeps the stronger contract: it re-reads
// the evidence LIVE through the same oracles the notaries use, and `label` is computed from
// AGREEING identities only, so this cannot render an identity the other side no longer
// confirms. The name is back too — it lives in the evidence, never on-chain.
const XPROOF_TIMEOUT_MS=5000

async function getAccountLabelXProof(network,accountId){

	// A cosmetic label must never be able to hang the modal: cap the request and
	// treat any failure as "no label", which is the pre-label state anyway.
	const res=await fetch(`https://xproof.live/XVERIFY/?account=${encodeURIComponent(accountId)}&network=${encodeURIComponent(network)}`,
		{ signal:AbortSignal.timeout(XPROOF_TIMEOUT_MS) })
	if(!res.ok)
		return null

	const out=await res.json()
	if(!out||!out.ok||!out.label)
		return null

	// The shape this module already renders: { domain: name }. `subject` is the thing proved
	// (a domain, a page, x.com/handle); `name` is the human label where the evidence carries
	// one. Falling back to the subject keeps a label present rather than blank.
	return { [out.label.subject]: out.label.name || out.label.subject }
}

export async function getAccountLabel(network,accountId){

	if(WELL_KNOWN_ACCOUNTS[accountId])
		return WELL_KNOWN_ACCOUNTS[accountId]

	if(accountLabelCache[accountId])
		return accountLabelCache[accountId]

	if(accountLabelPending.has(accountId))
		return null

	accountLabelPending.add(accountId)

	try{

		const data=await getAccountLabelXProof(network,accountId)

		// /api/ answers {"<acct>":[events…],"latest":{"<acct>":{<identity_type>:{…}}}}
		// — `latest` is keyed by identity TYPE, so preferring "domain" and otherwise
		// taking whatever attested identity exists means a future twitter/github
		// attestation needs no code change here. The old /domain/query shape
		// (data.links[0] with .domain/.name) is kept as a fallback so a revived
		// route still parses. Return shape is unchanged for every caller.
		const byType=data?.latest?.[accountId]
		const attested=byType?(byType.domain||Object.values(byType)[0]):null
		const latest=data?.links?.[0]

		const label={
			domain:attested?.linked_identity ?? latest?.domain ?? null,
			name:attested?.name ?? latest?.name ?? null
		}

		accountLabelCache[accountId]=label

		return label

	}finally{
		accountLabelPending.delete(accountId)
	}
}
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

// XPROOF-ROUTE1 (2026-08-21): moved off /domain/query/<id>, which is DEAD.
// That route runs xproof's api_query_domain.php, which fetches
// https://explore.hbar.live/DG/ — an upstream that no longer answers at all
// (verified: no response in 20s+, every account). Since the fetch below had no
// timeout either, this call simply never settled, and the signing modal's
// identity enrichment silently never arrived. /api/?accountId= answers the same
// question in ~30ms from xproof's own local sqlite db (filled from the Hedera
// mirror node) and is the endpoint katomia's board now uses too.
// See misc:XPROOF-EXPLOREDEAD1 for the still-broken legacy route.
const XPROOF_TIMEOUT_MS=5000

async function getAccountLabelXProof(network,accountId){

	// SECURITY 2026-08-27: xproof.live resolves to 176.126.78.48 — the same
	// compromised box as kpay.uk. No account ids go there until it's rebuilt.
	return null

	if(network!='mainnet')
		return null

	// A cosmetic label must never be able to hang the modal: cap the request and
	// treat any failure as "no label", which is the pre-label state anyway.
	const res=await fetch(`https://xproof.live/api/?network=${encodeURIComponent(network)}&accountId=${encodeURIComponent(accountId)}`,
		{ signal:AbortSignal.timeout(XPROOF_TIMEOUT_MS) })
	if(!res.ok)
		return null

	return await res.json()
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
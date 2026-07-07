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

async function getAccountLabelXProof(network,accountId){

	if(network!='mainnet')
		return null

	const res=await fetch(`https://xproof.live/domain/query/${accountId}`)
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
		const latest=data?.links?.[0]

		const label={
			domain:latest?.domain ?? null,
			name:latest?.name ?? null
		}

		accountLabelCache[accountId]=label

		return label

	}finally{
		accountLabelPending.delete(accountId)
	}
}
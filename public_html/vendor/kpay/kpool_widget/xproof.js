const accountLabelCache={}
const accountLabelPending=new Set()

async function getAccountLabelXProof(network,accountId){

	if(network!='mainnet')
		return null

	const res=await fetch(`https://xproof.live/domain/query/${accountId}`)
	if(!res.ok)
		return null

	return await res.json()
}

export async function getAccountLabel(network,accountId){

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
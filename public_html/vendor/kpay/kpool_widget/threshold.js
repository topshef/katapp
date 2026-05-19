// threshold.js

function normalizeKeyTree(key){

	if(typeof key=='string')
		return {threshold:1,keys:[key]}

	return key
}

function analyzeNode(node,signedPubkeys=[]){

	node=normalizeKeyTree(node)

	let signedCount=0
	let totalCount=0
	let childSummaries=[]

	node.keys.forEach(child=>{

		if(typeof child=='string'){

			totalCount++

			if(signedPubkeys.includes(child))
				signedCount+=signedPubkeys.includes(child)?1:0

			return
		}

		const summary=analyzeNode(child,signedPubkeys)

		childSummaries.push(summary)

		totalCount+=summary.totalCount

		if(summary.thresholdSatisfied)
			signedCount++
	})

	const thresholdSatisfied=signedCount>=node.threshold
	const minRemaining=Math.max(0,node.threshold-signedCount)

	return {
		thresholdSatisfied,
		signedCount,
		totalCount,
		minRemaining,
		maxRemaining:totalCount-signedCount,
		children:childSummaries
	}
}


/*
Walk this account's threshold tree recursively.

At each node, signedCount means satisfied children at this level:
plain key child = satisfied if that public key has signed
nested threshold child = satisfied if that nested threshold has passed

So a nested threshold counts as one satisfied branch in its parent, even if several keys signed inside it.

thresholdSatisfied means signedCount >= node.threshold.
minRemaining means the minimum extra satisfied children needed at this node.
*/


export function getThresholdSummary({keyTree,signedPubkeys=[]}){

	const result=analyzeNode(keyTree,signedPubkeys)

  return {
    thresholdSatisfied:result.thresholdSatisfied,
    signedKeyCount:result.signedCount,
    minRemaining:result.minRemaining,
    maxRemaining:result.maxRemaining
  }
}
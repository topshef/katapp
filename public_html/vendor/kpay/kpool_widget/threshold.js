// threshold.js

function normalizeNode(node){

	if(typeof node=='string')
		return {threshold:1,keys:[node]}

	return node
}

function collectLeafKeys(node,out=new Set()){

	node=normalizeNode(node)

	node.keys.forEach(child=>{

		if(typeof child=='string'){
			out.add(child)
			return
		}

		collectLeafKeys(child,out)
	})

	return out
}

function solveNode(node,signedSet){

	node=normalizeNode(node)

	let childResults=[]

	node.keys.forEach(child=>{

		// leaf key
		if(typeof child=='string'){

			childResults.push({
				satisfied:signedSet.has(child),
				requiredKeys:new Set([child]),
				missingKeys:signedSet.has(child) ? new Set() : new Set([child])
			})

			return
		}

		childResults.push(
			solveNode(child,signedSet)
		)
	})

	// already satisfied children first
	childResults.sort((a,b)=>{
		if(a.satisfied!=b.satisfied)
			return a.satisfied ? -1 : 1

		return a.missingKeys.size-b.missingKeys.size
	})

	const chosen=childResults.slice(0,node.threshold)

	let requiredKeys=new Set()
	let missingKeys=new Set()

	chosen.forEach(x=>{
		x.requiredKeys.forEach(k=>requiredKeys.add(k))
		x.missingKeys.forEach(k=>missingKeys.add(k))
	})

	const satisfied=[...chosen].every(x=>x.satisfied)

	return {
		satisfied,
		requiredKeys,
		missingKeys
	}
}

export function getThresholdSummary({keyTree,signedPubkeys=[]}){

	const signedSet=new Set(signedPubkeys)

	const allRequiredKeys=collectLeafKeys(keyTree)
	const result=solveNode(keyTree,signedSet)

	const signedRequiredKeys=[...signedSet]
		.filter(k=>allRequiredKeys.has(k))

	const witnessKeys=[...signedSet]
		.filter(k=>!allRequiredKeys.has(k))

  return {
    thresholdSatisfied:result.satisfied,
    allRequiredKeys,
    signedRequiredKeyCount:signedRequiredKeys.length,
    signedWitnessKeyCount:witnessKeys.length,
    minMoreKeyCount:result.missingKeys.size
  }
}
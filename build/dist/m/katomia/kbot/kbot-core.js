export function createBot(config){

  const rewarded = new Set()

  function getConnectedCluster(state, startId){
    const visited = new Set()
    const stack = [startId]

    while(stack.length){
      const id = stack.pop()
      if(visited.has(id)) continue
      visited.add(id)

      const acc = state.accounts[id]
      if(!acc) continue

      acc.basket?.forEach(item => {
        const fromId = item.fromAccountId || item.fromId || item.from
        if(fromId && !visited.has(fromId))
          stack.push(fromId)
      })

      Object.values(state.accounts).forEach(other => {
        other.basket?.forEach(item => {
          const fromId = item.fromAccountId || item.fromId || item.from
          if(fromId === id && !visited.has(other.id))
            stack.push(other.id)
        })
      })
    }

    return [...visited]
  }

  function processState(state, ctx){

    const actions = []

    const myAccountId = ctx.myPlayerId + ":" + config.botAccount

    // --- REWARD LOGIC
    Object.values(state.accounts).forEach(acc => {

      if(acc.playerId === ctx.myPlayerId) return

      acc.basket?.forEach(item => {

        const fromId = item.fromAccountId || item.fromId || item.from
        if(!fromId) return

        if(fromId.split(":")[0] === ctx.myPlayerId) return

        const key = fromId + "|" + item.assetId + "|" + acc.id
        if(rewarded.has(key)) return

        if((item.amount || 0) <= 0) return

        actions.push({
          type: "offer",
          toId: fromId,
          amount: config.rewardAmount,
          assetId: config.rewardAssetId
        })

        rewarded.add(key)
      })
    })

    // --- LOCK LOGIC
    const myAcc = state.accounts[myAccountId]
    if(myAcc){

      const cluster = getConnectedCluster(state, myAccountId)

      const others = cluster.filter(id => {
        const acc = state.accounts[id]
        return acc && acc.playerId !== ctx.myPlayerId
      })

      const allLocked = others.length &&
        others.every(id => state.accounts[id].mode === "lock")

      if(allLocked && myAcc.mode !== "lock"){
        actions.push({ type: "lock" })
      }
    }

    return actions
  }

  return { processState }
}
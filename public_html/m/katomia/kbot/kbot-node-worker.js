
//todo move to hbarlive_hts for node demo

// https://chatgpt.com/share/69c500a1-9ac0-8387-92d4-208fed76ddb4

import WebSocket from "ws"
import { createBot } from "./kbot-core.js"
import crypto from "crypto"

const config = {
  botAccount: "0.0.3039988",
  rewardAssetId: "0.0.456858",
  rewardAmount: 50000
}

const bot = createBot(config)

const WS_URL = "wss://hapi2.hbar.live/live/ws"
const gameId = process.argv[2]

const playerToken = crypto.randomUUID()

let myPlayerId = null

const socket = new WebSocket(WS_URL)

socket.on("open", () => {

  socket.send(JSON.stringify({
    type: "game_join",
    gameId,
    playerToken,
    playerName: "🤖"
  }))

  socket.send(JSON.stringify({
    type: "game_addAccount",
    gameId,
    playerToken,
    label: config.botAccount
  }))
})

socket.on("message", raw => {

  const msg = JSON.parse(raw)

  if(msg.type !== "game_state") return
  if(!msg.myPlayerId) return

  myPlayerId = msg.myPlayerId

  const actions = bot.processState(msg.state, { myPlayerId })

  actions.forEach(a => {

    if(a.type === "offer"){
      socket.send(JSON.stringify({
        type: "game_offer",
        gameId,
        fromId: myPlayerId + ":" + config.botAccount,
        toId: a.toId,
        assetId: a.assetId,
        amount: a.amount
      }))
    }

    if(a.type === "lock"){
      socket.send(JSON.stringify({
        type: "game_toggleLock",
        gameId,
        accountId: myPlayerId + ":" + config.botAccount
      }))
    }
  })
})

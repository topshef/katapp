import { createBot } from "./kbot-core.js"


// --- LOG UI ---
function log(...args){
  console.log(...args)

  let el = document.getElementById("log")
  if(!el){
    el = document.createElement("div")
    el.id = "log"
    document.body.appendChild(el)
  }

  const html = args.map(a =>
    typeof a === "object"
      ? "<pre>" + JSON.stringify(a, null, 2) + "</pre>"
      : String(a)
  ).join(" ")

  el.innerHTML += html + "<br>"
}


const config = {
  botAccount: "0.0.3039988",
  rewardAssetId: "0.0.456858",
  rewardAmount: 40000
}

const bot = createBot(config)

// const WS_URL = "wss://hapi2.hbar.live/live/ws"
const WS_URL = "wss://hapi4.hbar.live/ws"
const gameId = new URLSearchParams(location.search).get("game")

log("BOOT", { gameId, WS_URL })


let playerToken = localStorage.getItem("katomiaBotToken")
if(!playerToken){
  playerToken = crypto.randomUUID()
  localStorage.setItem("katomiaBotToken", playerToken)
}

let myPlayerId = null

const socket = new WebSocket(WS_URL)

socket.onopen = () => {

  log("🟢 connected")

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
}

socket.onmessage = e => {
  const msg = JSON.parse(e.data)

  if(msg.type !== "game_state") return
  if(!msg.myPlayerId) return

  myPlayerId = msg.myPlayerId

  const actions = bot.processState(msg.state, { myPlayerId })

  actions.forEach(a => {

    log("➡️ ACTION", a)
  
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
}
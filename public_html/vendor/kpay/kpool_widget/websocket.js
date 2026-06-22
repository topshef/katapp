// websocket.js


function toWss(url) {  //defensive
  if (!url) return ''

  // strip any protocol
  if (url.startsWith('https://')) url = url.slice(8)
  else if (url.startsWith('http://')) url = url.slice(7)
  else if (url.startsWith('wss://')) url = url.slice(6)
  else if (url.startsWith('ws://')) url = url.slice(5)

  return 'wss://' + url
}

export function createTxSocket({ baseUrl, txid, onTxUpdate }) {

  const socket = new WebSocket(toWss(baseUrl) + '/ws')
	// const proto = baseUrl.startsWith('https') ? 'wss' : 'ws'
	// const host = baseUrl.replace(/^https?:\/\//, '')
	// const socket = new WebSocket(`${proto}://${host}/ws`)


	socket.addEventListener('open', () => {
		console.log('[WS] connected')

		socket.send(JSON.stringify({
			type: 'subscribe',
			txid
		}))

		console.log('[WS] subscribed to', txid)
	})



	socket.addEventListener('message', event => {
		// console.log('[WS RAW]', event.data)

		try {
			const msg = JSON.parse(event.data)

			if (msg.type === 'txUpdate' && msg.txid === txid) {
				console.log('[WS] update received', msg.data)
				onTxUpdate(msg.data)
			}

		} catch (e) {
			console.warn('[WS parse error]', e)
		}
	})

	socket.addEventListener('close', () => {
		console.log('[WS] closed')
	})

	socket.addEventListener('error', err => {
		console.warn('[WS] error', err)
	})

	return socket
}


/*
===============================================================================
REAL-TIME TRANSACTION UPDATE ARCHITECTURE (WebSocket + Polling Fallback)
===============================================================================

SERVER SIDE
-----------

1. WebSocket server (websocket.js, Node side)
   - Mounted via attachWebsocketServer(server)
   - Path: /ws
   - Maintains: Map<txid, Set<socket>>
   - Handles:
       { type: 'subscribe', txid }
       { type: 'unsubscribe', txid }

2. When txSave adds new signatures:
       wsApi.notifyTxUpdate(txid, payload)

   This sends:
       {
         type: 'txUpdate',
         txid,
         data: {
           type: 'signature_added',
           network,
           txid,
           sigsNew,
           sigs,
           updatedAt
         }
       }

3. Apache proxies:
       /live      -> http://localhost:8030/
       /live/ws   -> ws://localhost:8030/ws

   Client connects to:
       wss://hapi_.hbar.live/live/ws


CLIENT SIDE
-----------

Entry point: renderSingleTx() in index.js  (:contentReference[oaicite:4]{index=4})

1. Initial load:
   - txRead() fetches data (:contentReference[oaicite:5]{index=5})
   - buildTxReadColumns() builds layout (:contentReference[oaicite:6]{index=6})
   - renderSigningInfo() renders key grid

2. WebSocket setup:
   createTxSocket({ baseUrl, txid, onTxUpdate }) (:contentReference[oaicite:7]{index=7})

   On open:
       sends { type: 'subscribe', txid }

   On message:
       if msg.type === 'txUpdate' && msg.txid matches:
           onTxUpdate(msg.data)

3. onTxUpdate(update):
   - Merge update into currentData
   - view.statusBlock.update(currentData)
   - If update.sigs exists:
         refreshSigningSection(...)
   - This re-enriches account info + keys
   - Then re-renders the signing grid

4. Polling (fallback)
   - Runs every 5s only after scheduled time
   - Stops after 5 minutes or mirrorStatus detected
   - Calls txRead()
   - Updates status + signing if needed
   - WebSocket handles signatures immediately;
     polling mainly covers mirrorStatus updates.


DESIGN PRINCIPLES
-----------------

• data object is canonical (network + txid injected in txRead).
• View components are data-driven and stateless:
      statusBlock.update(newData)
• WebSocket pushes deltas.
• Client merges deltas into currentData.
• No full page reloads.
• Polling remains as safety net.

FLOW SUMMARY
------------

txSave()
  → notifyTxUpdate()
  → Apache proxy (/live/ws)
  → Node WS server
  → Subscription map lookup
  → socket.send()
  → Browser receives message
  → onTxUpdate()
  → UI re-render (status + signing)

===============================================================================
*/
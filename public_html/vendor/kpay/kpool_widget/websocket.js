// websocket.js

export function createTxSocket({ baseUrl, txid, onTxUpdate }) {

	const proto = baseUrl.startsWith('https') ? 'wss' : 'ws'
	const host = baseUrl.replace(/^https?:\/\//, '')

	const socket = new WebSocket(`${proto}://${host}/ws`)


	socket.addEventListener('open', () => {
		console.log('[WS] connected')

		socket.send(JSON.stringify({
			type: 'subscribe',
			txid
		}))

		console.log('[WS] subscribed to', txid)
	})



	socket.addEventListener('message', event => {
		console.log('[WS RAW]', event.data)

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
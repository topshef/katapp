Yes. I’d build it as:

```text
Browser KEA
    localStorage key
    WebSocket doorbell
    fetch request
    verify request
    sign tx bytes
    POST result

KPool KEA module
    watch txs
    normalise request
    store request
    send WebSocket doorbell
    serve request
    receive signed result
```

Below is the minimal shape.

---

## 1. Browser page: `kea.html`

Uses localStorage for the hot key. Later this becomes Android secure storage.

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>KEA Prototype</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: system-ui, sans-serif; max-width: 760px; margin: 30px auto; padding: 0 16px; }
    button { padding: 8px 12px; margin: 4px 0; }
    input { width: 100%; box-sizing: border-box; padding: 8px; margin: 4px 0 12px; }
    pre { background: #111; color: #ddd; padding: 12px; overflow: auto; white-space: pre-wrap; }
    .ok { color: green; }
    .bad { color: crimson; }
  </style>
</head>
<body>
  <h1>KEA Prototype</h1>
  <p>Browser execution agent. WebSocket doorbell now; FCM later.</p>

  <label>KPool base URL</label>
  <input id="baseUrl" value="http://localhost:8030">

  <label>WebSocket URL</label>
  <input id="wsUrl" value="ws://localhost:8030/ws">

  <label>Watcher public key hex</label>
  <input id="watcherPubkey" placeholder="raw Ed25519 public key hex">

  <h2>Local authority</h2>
  <button id="genKeyBtn">Generate local KEA key</button>
  <button id="connectBtn">Connect doorbell</button>
  <button id="testBtn">Fetch test request</button>

  <p>KEA public key:</p>
  <pre id="pubkeyOut"></pre>

  <h2>Status</h2>
  <pre id="log"></pre>

<script type="module">
import * as ed from "https://esm.sh/@noble/ed25519@2.1.0"
import { sha512 } from "https://esm.sh/@noble/hashes@1.4.0/sha512"
import { sha256 } from "https://esm.sh/@noble/hashes@1.4.0/sha256"
import { Transaction, PrivateKey } from "https://esm.sh/@hashgraph/sdk@2.67.0"

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

const $ = id => document.getElementById(id)
const log = x => $('log').textContent = `[${new Date().toLocaleTimeString()}] ${x}\n` + $('log').textContent

const hexToBytes = hex => Uint8Array.from(hex.match(/.{1,2}/g).map(x => parseInt(x, 16)))
const bytesToHex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
const b64urlToBytes = s => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}
const bytesToB64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
const canonicalJson = obj => JSON.stringify(obj)

function getBaseUrl() {
  return $('baseUrl').value.replace(/\/$/, '')
}

function saveConfig() {
  localStorage.keaBaseUrl = $('baseUrl').value
  localStorage.keaWsUrl = $('wsUrl').value
  localStorage.keaWatcherPubkey = $('watcherPubkey').value
}

function loadConfig() {
  if (localStorage.keaBaseUrl) $('baseUrl').value = localStorage.keaBaseUrl
  if (localStorage.keaWsUrl) $('wsUrl').value = localStorage.keaWsUrl
  if (localStorage.keaWatcherPubkey) $('watcherPubkey').value = localStorage.keaWatcherPubkey
}

async function generateKey() {
  const priv = ed.utils.randomPrivateKey()
  const pub = await ed.getPublicKeyAsync(priv)

  localStorage.keaPrivkeyHex = bytesToHex(priv)
  localStorage.keaPubkeyHex = bytesToHex(pub)

  renderKey()
  log('Generated KEA local key')
}

function getLocalKey() {
  const privHex = localStorage.keaPrivkeyHex
  const pubHex = localStorage.keaPubkeyHex
  if (!privHex || !pubHex) throw new Error('No KEA key. Generate one first.')
  return { privHex, pubHex }
}

function renderKey() {
  $('pubkeyOut').textContent = localStorage.keaPubkeyHex || '(none)'
}

async function verifyJws(jws) {
  const watcherPubkey = $('watcherPubkey').value.trim()
  if (!watcherPubkey) throw new Error('Missing watcher public key')

  const [h, p, s] = jws.split('.')
  if (!h || !p || !s) throw new Error('Invalid JWS format')

  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)))
  if (header.alg !== 'EdDSA') throw new Error(`Unsupported JWS alg: ${header.alg}`)
  if (header.typ !== 'KEA-EXEC') throw new Error(`Unsupported JWS typ: ${header.typ}`)

  const signingInput = new TextEncoder().encode(`${h}.${p}`)
  const sig = b64urlToBytes(s)
  const ok = await ed.verifyAsync(sig, signingInput, hexToBytes(watcherPubkey))
  if (!ok) throw new Error('Watcher JWS signature invalid')

  return JSON.parse(new TextDecoder().decode(b64urlToBytes(p)))
}

async function verifyIntent(req) {
  const m = req.mandate
  if (!m?.intentPubkey || !m?.intentSignature || !m?.intentPayload) throw new Error('Missing mandate intent fields')

  const msg = new TextEncoder().encode(canonicalJson(m.intentPayload))
  const sig = Uint8Array.from(atob(m.intentSignature), c => c.charCodeAt(0))
  const ok = await ed.verifyAsync(sig, msg, hexToBytes(m.intentPubkey))

  if (!ok) throw new Error('Trader intent signature invalid')
}

function checkPolicy(req) {
  const { pubHex } = getLocalKey()

  if (req.version !== 'kea.exec.v1') throw new Error(`Unsupported request version: ${req.version}`)
  if (new Date(req.expiresAt).getTime() < Date.now()) throw new Error('Request expired')
  if (req.authority?.signPubkey?.toLowerCase() !== pubHex.toLowerCase()) throw new Error('Request not for this KEA key')
  if (req.mandate?.type !== 'katomia-order-fill') throw new Error(`Unsupported mandate type: ${req.mandate?.type}`)
  if (req.execution?.transferCheck?.status !== 'pass') throw new Error('Transfer check did not pass')

  const txBytes = hexToBytes(req.transaction.txBytesHex)
  const txHash = bytesToHex(sha256(txBytes))
  if (txHash !== req.transaction.txHash) throw new Error('txBytes hash mismatch')
}

async function signHederaTxBytes(txBytesHex) {
  const { privHex } = getLocalKey()

  // Prototype route 1: use Hedera SDK to sign the transaction bytes locally.
  // This assumes the tx bytes are compatible with Transaction.fromBytes().
  const priv = PrivateKey.fromStringED25519(privHex)
  const tx = Transaction.fromBytes(hexToBytes(txBytesHex))
  const signed = await tx.sign(priv)

  return bytesToHex(signed.toBytes())
}

async function processRequestId(requestId) {
  saveConfig()
  log(`Fetching request ${requestId}`)

  const res = await fetch(`${getBaseUrl()}/kea/requests/${encodeURIComponent(requestId)}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Fetch failed ${res.status}`)

  const req = await verifyJws(data.jws)

  checkPolicy(req)
  await verifyIntent(req)

  log(`Verified request ${requestId}, signing...`)

  const signedTxBytesHex = await signHederaTxBytes(req.transaction.txBytesHex)

  const result = {
    requestId,
    status: 'signed',
    signPubkey: localStorage.keaPubkeyHex,
    txHash: req.transaction.txHash,
    signedTxBytesHex,
    signedAt: new Date().toISOString()
  }

  const post = await fetch(`${getBaseUrl()}/kea/requests/${encodeURIComponent(requestId)}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(result)
  })

  const postData = await post.json()
  if (!post.ok) throw new Error(postData.error || `Result POST failed ${post.status}`)

  log(`Signed and posted ${requestId}`)
}

function connectDoorbell() {
  saveConfig()

  const ws = new WebSocket($('wsUrl').value)
  ws.onopen = () => {
    log('Doorbell connected')
    ws.send(JSON.stringify({
      type: 'kea_subscribe',
      signPubkey: localStorage.keaPubkeyHex
    }))
  }

  ws.onmessage = async ev => {
    let msg
    try { msg = JSON.parse(ev.data) } catch { return }

    if (msg.type !== 'kea_request') return

    try {
      await processRequestId(msg.requestId)
    } catch (e) {
      log(`ERROR ${e.message}`)
    }
  }

  ws.onclose = () => log('Doorbell disconnected')
  ws.onerror = () => log('Doorbell error')
}

$('genKeyBtn').onclick = () => generateKey().catch(e => log(`ERROR ${e.message}`))
$('connectBtn').onclick = () => connectDoorbell()
$('testBtn').onclick = () => {
  const requestId = prompt('Request ID?')
  if (requestId) processRequestId(requestId).catch(e => log(`ERROR ${e.message}`))
}

loadConfig()
renderKey()
</script>
</body>
</html>
```

---

## 2. Server module: `kea-watcher.js`

Install:

```bash
npm install express ws @noble/ed25519 @noble/hashes
```

```js
/**
 * kea-watcher.js
 *
 * KPool-side KEA watcher module.
 *
 * Responsibilities:
 * - build clean KEA execution request
 * - store it
 * - send lightweight WS doorbell
 * - serve request to KEA app
 * - receive signed tx bytes
 * - save to KPool
 */

const express = require('express')
const { WebSocketServer } = require('ws')
const ed = require('@noble/ed25519')
const { sha256 } = require('@noble/hashes/sha256')
const { sha512 } = require('@noble/hashes/sha512')

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

const text = s => new TextEncoder().encode(s)
const bytesToHex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
const hexToBytes = hex => Uint8Array.from(hex.match(/.{1,2}/g).map(x => parseInt(x, 16)))
const b64url = bytes => Buffer.from(bytes).toString('base64url')
const canonicalJson = obj => JSON.stringify(obj)

function createKeaWatcher({ kpoolBase, watcherPrivateKeyHex }) {
  if (!kpoolBase) throw new Error('createKeaWatcher missing kpoolBase')
  if (!watcherPrivateKeyHex) throw new Error('createKeaWatcher missing watcherPrivateKeyHex')

  const router = express.Router()
  const requests = new Map()
  const clients = new Map()

  async function signJws(payload) {
    const header = {
      alg: 'EdDSA',
      typ: 'KEA-EXEC',
      kid: 'kea-watcher-v1'
    }

    const h = b64url(Buffer.from(canonicalJson(header)))
    const p = b64url(Buffer.from(canonicalJson(payload)))
    const signingInput = `${h}.${p}`
    const sig = await ed.signAsync(text(signingInput), hexToBytes(watcherPrivateKeyHex))

    return `${signingInput}.${b64url(sig)}`
  }

  function attachWs(server) {
    const wss = new WebSocketServer({ server, path: '/ws' })

    wss.on('connection', ws => {
      ws.on('message', raw => {
        let msg
        try { msg = JSON.parse(raw) } catch { return }

        if (msg.type !== 'kea_subscribe') return
        const signPubkey = msg.signPubkey?.toLowerCase()
        if (!signPubkey) return

        clients.set(signPubkey, ws)
        ws.send(JSON.stringify({ type: 'kea_subscribed', signPubkey }))
      })

      ws.on('close', () => {
        for (const [k, v] of clients.entries())
          if (v === ws) clients.delete(k)
      })
    })
  }

  function sendDoorbell(signPubkey, requestId) {
    const ws = clients.get(signPubkey.toLowerCase())
    if (!ws || ws.readyState !== ws.OPEN) return false

    ws.send(JSON.stringify({
      type: 'kea_request',
      requestId
    }))

    return true
  }

  async function createRequest(clean) {
    const jws = await signJws(clean)

    const item = {
      requestId: clean.requestId,
      signPubkey: clean.authority.signPubkey.toLowerCase(),
      status: 'pending',
      clean,
      jws,
      createdAt: Date.now()
    }

    requests.set(clean.requestId, item)
    sendDoorbell(item.signPubkey, clean.requestId)

    return item
  }

  router.get('/kea/requests/:requestId', (req, res) => {
    const item = requests.get(req.params.requestId)
    if (!item) return res.status(404).json({ error: 'request not found' })

    item.status = 'fetched'
    res.json({ jws: item.jws })
  })

  router.post('/kea/requests/:requestId/result', express.json({ limit: '10mb' }), async (req, res) => {
    const item = requests.get(req.params.requestId)
    if (!item) return res.status(404).json({ error: 'request not found' })

    const result = req.body
    if (result.status !== 'signed') return res.status(400).json({ error: 'unsupported result status' })
    if (result.signPubkey?.toLowerCase() !== item.signPubkey) return res.status(400).json({ error: 'wrong signer pubkey' })
    if (result.txHash !== item.clean.transaction.txHash) return res.status(400).json({ error: 'txHash mismatch' })
    if (!result.signedTxBytesHex) return res.status(400).json({ error: 'missing signedTxBytesHex' })

    const saveRes = await fetch(`${kpoolBase}/kpool/txSave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        network: item.clean.network,
        signedTx: result.signedTxBytesHex
      })
    })

    const saveData = await saveRes.json()

    item.status = 'signed'
    item.result = result
    item.saveData = saveData

    res.json({
      ok: true,
      saveData
    })
  })

  async function handleKpoolTx(msg) {
    const clean = await buildCleanKeaRequestFromKpoolTx({ msg, kpoolBase })
    if (!clean) return null

    return createRequest(clean)
  }

  return {
    router,
    attachWs,
    handleKpoolTx,
    createRequest,
    requests
  }
}

async function buildCleanKeaRequestFromKpoolTx({ msg, kpoolBase }) {
  /*
   * This is the adapter layer.
   *
   * Put your existing kbot-sign logic here:
   * - find watched fill
   * - verify/normalise order intent payload
   * - validate pchBasis transfers
   * - decide target signPubkey
   *
   * Output should be generic KEA shape.
   */

  const source = msg.source
  if (!source) return null

  const match = findSingleKeaFill(source)
  if (!match) return null

  const { orderId, order, fill, signPubkey } = match
  const network = source?.context?.network ?? msg.network
  const gameId = source?.context?.gameId

  const readRes = await fetch(
    `${kpoolBase}/kpool/txRead?network=${network}&txid=${encodeURIComponent(msg.txid)}&pch=${encodeURIComponent(msg.pch)}`
  )

  const readData = await readRes.json()
  const txBytesHex = readData?.result?.hex2
  if (!txBytesHex) throw new Error(`No tx bytes from txRead for ${msg.txid}`)

  const txHash = bytesToHex(sha256(hexToBytes(txBytesHex)))

  return {
    version: 'kea.exec.v1',
    requestId: `kea_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),

    network,
    authority: {
      type: 'settlement-agent',
      signPubkey,
      accountId: match.accountId
    },

    mandate: {
      type: 'katomia-order-fill',
      intentPubkey: order.intentSignature.pubkeyHex,
      intentSignature: order.intentSignature.sig,
      intentPayload: order.intentPayloadForKea
    },

    execution: {
      orderId,
      fill,
      transferCheck: {
        status: 'pass',
        basisHash: bytesToHex(sha256(text(canonicalJson(msg.deal?.pchbasis ?? {}))))
      }
    },

    transaction: {
      txid: msg.txid,
      pch: msg.pch,
      txBytesHex,
      txHash
    }
  }
}

function findSingleKeaFill(source) {
  /*
   * Replace this with your real watch lookup.
   *
   * For the new architecture, this function should already know:
   * - watched intent pubkey
   * - target account
   * - target KEA signPubkey
   *
   * Return null if not relevant.
   */

  const fills = source?.fills || []
  if (fills.length !== 1) return null

  const fill = fills[0]
  const orderId = String(fill.orderId)
  const order = source?.orders?.[orderId]
  if (!order) return null

  if (!order.intentPayloadForKea) {
    /*
     * Important:
     * Build this on the server from your existing buildSigPayload().
     * The browser should NOT reconstruct bundleHash/spec payload.
     */
    return null
  }

  return {
    orderId,
    order,
    fill,
    accountId: order.bundle?.[0]?.accountId,
    signPubkey: order.keaSignPubkey
  }
}

module.exports = { createKeaWatcher }
```

---

## 3. KPool integration shape

In your main KPool server:

```js
const { createKeaWatcher } = require('./kea-watcher')

const kea = createKeaWatcher({
  kpoolBase: process.env.KPOOL_BASE_URL,
  watcherPrivateKeyHex: process.env.KEA_WATCHER_PRIVATE_KEY_HEX
})

app.use(kea.router)
kea.attachWs(server)
```

Then wherever KPool currently sees a new tx:

```js
kea.handleKpoolTx(msg).catch(e => console.warn('[kea]', e.message))
```

---

## Important simplification

The browser app should **not** do this anymore:

```text
buildSigPayload()
hashBundle()
SIG_SPECS reconstruction
```

KPool should send:

```json
"intentPayload": {
  "specVersion": "049f1b69",
  "gameId": "...",
  "network": "...",
  "clientOrderId": "...",
  "issuedAt": "...",
  "bundleHash": "...",
  "timeInForce": "...",
  "minFill": "..."
}
```

The browser only does:

```text
verify trader signature over intentPayload
verify watcher JWS
verify tx hash
sign tx
post result
```

That is the right perimeter for KEA.

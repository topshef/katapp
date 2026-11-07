// wallet-sim.cjs — copied from phpjabbers qa/kwallet/wallet-sim.cjs (KWALLET-CI-01, 2026-09-04),
// where the hourly kwallet-qa job uses it against labs. One change for WC-ANDROID-QA1: the wallet's
// session metadata is a parameter, so the sim can present itself exactly as HashPack does on
// Android (name "HashPack", url "https://localhost", no redirect — read from the diag log of 7 Nov).
//
// wallet-sim.cjs — a minimal Hedera WalletConnect WALLET in node (KWALLET-CI-01).
//
// The old kWallet was a service on lab22 (/opt/kwallet, :8790) that the harnesses drove over
// HTTP; it died with the estate and its source never lived in a repo. This is the smallest
// thing that stands in for it: a WalletConnect v2 sign-client that pairs with a `wc:` URI,
// approves the `hedera` namespace for one account, and answers the two requests the KWC
// bundle sends — hedera_signTransaction (body bytes in, SignatureMap out) and
// hedera_signMessage (HIP-820 prefixed message). Formats mirror
// @hashgraph/hedera-wallet-connect's Wallet class (dist/lib/wallet/index.js) exactly, so the
// dapp side cannot tell it from HashPack.
//
// It never submits anything and needs no funds: with no key given it makes a throwaway
// ed25519 key, and the runner verifies the returned signature against that key. A real
// testnet key (QA_KWALLET_PK) only matters for the optional real-kpool stage.
const { SignClient } = require('@walletconnect/sign-client')
const { PrivateKey } = require('@hashgraph/sdk')
const { proto } = require('@hashgraph/proto')

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), '[wallet-sim]', ...a)

function prefixMessageToSign(message) {
  return '\x19Hedera Signed Message:\n' + message.length + message
}

async function createWalletSim({ projectId, relayUrl, accountId, privateKey, storagePath, networks = ['testnet', 'mainnet'], metadata = null }) {
  const key = privateKey ? PrivateKey.fromString(privateKey) : PrivateKey.generateED25519()
  const pub = key.publicKey
  const client = await SignClient.init({
    projectId,
    relayUrl: relayUrl || 'wss://relay.walletconnect.com',
    metadata: metadata || { name: 'kWallet sim (Katomia QA)', description: 'CI wallet simulator', url: 'https://katui.tayloa17.workers.dev', icons: [] },
    storageOptions: storagePath ? { database: storagePath } : undefined,
  })
  const state = { sessions: [], requests: [], errors: [], proposals: 0 }
  // the relayer is lazy: connect it NOW so pair() subscribes instantly. Run 21 (2026-09-04): the
  // dapp had already published its proposal by the time a cold relayer finished connecting and
  // the proposal never arrived; run 20, same code, warm relayer, passed in 5.5 s.
  const tr = Date.now()
  try { await client.core.relayer.connect(); log('relayer connected in', Date.now() - tr, 'ms') } catch (e) { log('relayer connect failed', e.message) }

  client.on('session_proposal', async ({ id, params }) => {
    state.proposals++
    log('proposal received', id, 'from', (params.proposer && params.proposer.metadata && params.proposer.metadata.name) || '?')
    try {
      const req = params.requiredNamespaces?.hedera || params.optionalNamespaces?.hedera || {}
      const chains = (req.chains && req.chains.length ? req.chains : networks.map(n => 'hedera:' + n))
      const namespaces = {
        hedera: {
          chains,
          methods: req.methods && req.methods.length ? req.methods : ['hedera_signMessage', 'hedera_signTransaction', 'hedera_executeTransaction'],
          events: req.events || [],
          accounts: chains.map(c => `${c}:${accountId}`),
        },
      }
      const { topic, acknowledged } = await client.approve({ id, namespaces })
      await acknowledged()
      state.sessions.push(topic)
      log('session approved', topic.slice(0, 12), 'as', accountId, 'chains', chains.join(','))
    } catch (e) { state.errors.push('proposal: ' + e.message); log('proposal error', e.message) }
  })

  client.on('session_request', async ev => {
    const { id, topic, params } = ev
    const { request } = params
    const t0 = Date.now()
    try {
      let result
      if (request.method === 'hedera_signTransaction') {
        const body = Buffer.from(request.params.transactionBody, 'base64')
        // sanity: it must decode as a TransactionBody — a wallet that signs arbitrary bytes is a bug
        proto.TransactionBody.decode(body)
        const sig = key.sign(body)
        const sigMap = proto.SignatureMap.create({ sigPair: [pub._toProtobufSignature(sig)] })
        result = { signatureMap: Buffer.from(proto.SignatureMap.encode(sigMap).finish()).toString('base64') }
      } else if (request.method === 'hedera_signMessage') {
        const msg = Buffer.from(prefixMessageToSign(request.params.message))
        const sig = key.sign(msg)
        const sigMap = proto.SignatureMap.create({ sigPair: [pub._toProtobufSignature(sig)] })
        result = { signatureMap: Buffer.from(proto.SignatureMap.encode(sigMap).finish()).toString('base64') }
      } else {
        throw new Error('unsupported method ' + request.method)
      }
      await client.respond({ topic, response: { id, jsonrpc: '2.0', result } })
      state.requests.push({ method: request.method, ms: Date.now() - t0, ok: true })
      log('answered', request.method, 'in', Date.now() - t0, 'ms')
    } catch (e) {
      state.errors.push(request.method + ': ' + e.message)
      log('request error', request.method, e.message)
      try { await client.respond({ topic, response: { id, jsonrpc: '2.0', error: { code: 5000, message: e.message } } }) } catch {}
    }
  })

  client.on('session_delete', ({ topic }) => { log('session deleted by peer', topic.slice(0, 12)) })

  return {
    client, state, accountId,
    publicKeyHex: pub.toStringRaw(),
    pair: async uri => { const t = Date.now(); const r = await client.pair({ uri }); log('paired', String(uri).slice(3, 15) + '…', 'in', Date.now() - t, 'ms'); return r },
    disconnectAll: async () => {
      for (const s of client.session.getAll()) {
        try { await client.disconnect({ topic: s.topic, reason: { code: 6000, message: 'QA done' } }) } catch {}
      }
    },
  }
}

module.exports = { createWalletSim, prefixMessageToSign }

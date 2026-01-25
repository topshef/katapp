import SignClient from '@walletconnect/sign-client'
import { WalletConnectModal } from '@walletconnect/modal'

let client = null
let session = null
let modal = null

let handlers = {
  onConnect: null,
  onDisconnect: null,
  onSessionUpdate: null,
  onError: null,
  onConnectUri: null
}

function emit(name, payload) {
  const fn = handlers[name]
  if (typeof fn === 'function') fn(payload)
}

function setSessionFromClient() {
  if (!client) return
  const sessions = client.session.getAll()
  session = sessions && sessions.length ? sessions[0] : null
}

function getAccountParts() {
  const account = session.namespaces.hedera.accounts[0]
  const [, chainId, accountId] = account.split(':')
  return { chainId, accountId }
}

export async function initWalletConnect(opts, callbacks) {
  if (callbacks) handlers = { ...handlers, ...callbacks }

  client = await SignClient.init(opts)

  if (opts.projectId) {
    modal = new WalletConnectModal({
      projectId: opts.projectId
    })
  }

  setSessionFromClient()
  if (session) emit('onConnect', { session })

  client.on('session_update', data => {
    setSessionFromClient()
    emit('onSessionUpdate', { session, data })
  })

  client.on('session_delete', data => {
    session = null
    emit('onDisconnect', { data })
  })

  return true
}

export function isConnected() {
  return !!session
}

export function getSession() {
  return session
}

export async function connectWithModal(requiredNamespaces) {
  if (!client) throw new Error('WalletConnect not initialised')
  if (!modal) throw new Error('Modal not initialised')

  const { uri, approval } = await client.connect({ requiredNamespaces })

  modal.openModal({ uri })

  session = await approval()
  modal.closeModal()
  emit('onConnect', { session })
  return session
}

export async function connectWallet(requiredNamespaces) {
  if (!client) throw new Error('WalletConnect not initialised')

  const { uri, approval } = await client.connect({ requiredNamespaces })
  if (uri) emit('onConnectUri', { uri })

  session = await approval()
  emit('onConnect', { session })
  return session
}

export async function disconnectWallet(reason) {
  if (!client || !session) return true

  await client.disconnect({
    topic: session.topic,
    reason: reason || { code: 6000, message: 'User disconnected' }
  })

  session = null
  emit('onDisconnect', { manual: true })
  return true
}

export async function signMessage(message) {
  if (!client || !session) throw new Error('No active session')

  const { chainId, accountId } = getAccountParts()

  return client.request({
    topic: session.topic,
    chainId: `hedera:${chainId}`,
    request: {
      method: 'hedera_signMessage',
      params: { signerAccountId: accountId, message }
    }
  })
}

export async function signTransaction(txBytes) {
  if (!client || !session) throw new Error('No active session')

  const { chainId, accountId } = getAccountParts()

  return client.request({
    topic: session.topic,
    chainId: `hedera:${chainId}`,
    request: {
      method: 'hedera_signTransaction',
      params: { signerAccountId: accountId, transaction: txBytes }
    }
  })
}

export async function submitTransaction(txBytes) {
  if (!client || !session) throw new Error('No active session')

  const { chainId, accountId } = getAccountParts()

  return client.request({
    topic: session.topic,
    chainId: `hedera:${chainId}`,
    request: {
      method: 'hedera_executeTransaction',
      params: { signerAccountId: accountId, transaction: txBytes }
    }
  })
}

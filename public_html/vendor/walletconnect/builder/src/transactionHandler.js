import {
  DAppConnector,
  HederaJsonRpcMethod,
  HederaSessionEvent,
  HederaChainId,
} from "@hashgraph/hedera-wallet-connect";
import { Transaction, LedgerId } from "@hashgraph/sdk";
// import { createTransactionAlert } from "./dealPage.js";

let dappConnector;
let walletConfig


// Script tag that loaded this bundle (used to resolve config + metadata)
// ---- capture THIS script once (safe for async / base href / bundling)
const EL_LOADER = (() => {
  const script =
    document.currentScript ||
    document.querySelector('script[src*="walletconnect-hedera"]')

  if (!script)
    throw new Error("[WC-001] WalletConnect script tag not found")

  if (!script.src)
    throw new Error("[WC-002] WalletConnect script has no src")

  return script
})()


// walletConnectMode
// Determines how the bundle exposes control (default = button-based)
const WALLETCONNECT_MODE =
  (EL_LOADER.dataset?.mode || "").toLowerCase() || "default"

console.info(
  "[WC] Initialising WalletConnect bundle in mode:",
  WALLETCONNECT_MODE
)

//  WALLETCONNECT_MODE
// | Script tag             | Result                 |
// | ---------------------- | ---------------------- |
// | no `data-mode`         | `"default"`            |
// | `data-mode=""`         | `"default"`            |
// | `data-mode="headless"` | `"headless"`           |
// | typo / unknown         | treated as `"default"` |



/**
 * Expects a config.json file to exist alongside the bundled JS file
 * (i.e. in the same directory as walletconnect-hedera.iife.js).
 *
 * This loader supports the following config.json shape:
 *
 * {
 *   "projectId": "...",
 *   "relayUrl": "wss://relay.walletconnect.com",
 *   "metadata": { "name": "...", "description": "...", "url": "...", "icons": [] },
 *   "requiredNamespaces": { "hedera": { ... } }
 * }
 */


// High-level mental grouping (not file structure)
//
// --- WalletConnect lifecycle & session management
// loadConfig
// initializeWalletConnect
// restoreWalletSession
// openWalletConnectModal
// handleDisconnect
//
// --- Hedera network & SDK helpers
// getHederaNetworkFromNamespaces
// hederaChainIdFromNetwork
// prepareTransaction
// parseTxId
//
// --- Transaction execution & signing
// processTransactionBytes
// signTransactionBytesOnly
//
// --- Deal orchestration (cross-cutting)
// executeDealFlow  // spans: UI input, API IO, tx inspection, signing, submission
//
// --- UI / view helpers
// updateWalletConnectionUI
//
// Notes:
// - Functions appearing in multiple sections are good candidates for future splits
// - executeDealFlow is intentionally orchestration-heavy
// - Utilities are already fairly clean; most coupling lives in the orchestration layer





// ┬ ┬┌─┐┬  ┬  ┌─┐┌┬┐┌─┐┌─┐┌┐┌┌┐┌┌─┐┌─┐┌┬┐  ┌─┐┌─┐┬─┐┌─┐
// │││├─┤│  │  ├┤  │ │  │ │││││││├┤ │   │───│  │ │├┬┘├┤ 
// └┴┘┴ ┴┴─┘┴─┘└─┘ ┴ └─┘└─┘┘└┘┘└┘└─┘└─┘ ┴   └─┘└─┘┴└─└─┘
// walletconnect-core


 let walletUI = {
   showAlert: (msg, type) => {
     console.warn("[WC]", type, msg)
   },
   showTxAlert: () => {}
 }

export function registerWalletUI(ui) {
  walletUI = { ...walletUI, ...ui }
}


// loadConfig
// Loads, validates, and normalises the WalletConnect config.json used to initialise the dapp connector.
//
// Suggestions:
// - Could split URL resolution vs fetch vs validation later
// - Mostly a config bootstrap concern, not WalletConnect lifecycle
async function loadConfig() {
  try {
    let configUrl

		const dataConfig = EL_LOADER.dataset?.config // 1️⃣ explicit data-config on script tag
		if (dataConfig) 
			configUrl = new URL(dataConfig, EL_LOADER.src).href
		else // 2️⃣ fallback: config.json next to bundle
			configUrl = `${EL_LOADER.src.slice(0, EL_LOADER.src.lastIndexOf("/") + 1)}config.json` 


    console.info("[WC] TG22874 Loading config from", configUrl)

    const response = await fetch(configUrl)
    if (!response.ok) {
      alert(
        `[WC-101] Failed to load config.json\n\n${configUrl}\n\nStatus: ${response.status}`
      )
      throw new Error("Failed to load config.json")
    }

    const rawConfig = await response.json()

    // ---- hard validation ----
    if (!rawConfig.projectId)
      throw new Error("[WC-201] config.json missing projectId")

    if (!rawConfig.metadata?.name)
      throw new Error("[WC-202] config.json missing metadata.name")

    if (!rawConfig.requiredNamespaces?.hedera)
      throw new Error("[WC-203] config.json missing requiredNamespaces.hedera")

    const hederaNetwork =
      getHederaNetworkFromNamespaces(rawConfig.requiredNamespaces)

    const finalConfig = {
      metadata: rawConfig.metadata,
      hedera: { network: hederaNetwork },
      walletConnect: {
        projectId: rawConfig.projectId,
        relayUrl: rawConfig.relayUrl || "wss://relay.walletconnect.com",
        requiredNamespaces: rawConfig.requiredNamespaces
      }
    }

    walletConfig = finalConfig
    return finalConfig
  } catch (error) {
    console.error("[WC] YH84775 Error loading config.json:", error)
    alert(
      `[WC-999] WalletConnect config load failed\n\n${error.message}`
    )
    throw error
  }
}


// initializeWalletConnect
// Creates and initialises a WalletConnect DAppConnector using loaded config, handling reconnects.
//
// Suggestions:
// - Doing config load + disconnect + init is a lot for one function
// - Reads like a lifecycle step rather than a one-off init
// const initializeWalletConnect = async (retryCount = 0) => {
async function initializeWalletConnect(retryCount = 0) {
  try {
    const config = await loadConfig();

    if (dappConnector) {
      try {
        await dappConnector.disconnect();
      } catch (e) {
        console.warn("Error disconnecting existing session:", e);
      }
    }

    // Get the current domain
    const currentDomain = window.location.host;
    console.log("Initializing WalletConnect for domain:", currentDomain);

    // Initialize the WalletConnect DAppConnector with loaded config
    dappConnector = new DAppConnector(
      {
        ...config.metadata,
      },
      LedgerId.fromString(config.hedera.network),
      config.walletConnect.projectId,
      Object.values(HederaJsonRpcMethod),
      [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
      [hederaChainIdFromNetwork(config.hedera.network)]
    );

    try {
      await dappConnector.init();
    } catch (error) {
      console.error("Error initializing WalletConnect:", error);
      walletUI.showAlert(
        "Failed to initialize WalletConnect. Please try again.",
        "danger"
      );
      throw error;
    }
  } catch (error) {
    console.error("Error initializing WalletConnect:", error);
    const errorMessage =
      "Failed to initialize WalletConnect. Please check your project ID and try again.";

    walletUI.showAlert(errorMessage, "danger");
    throw error;
  }
};



// connectWalletCore
// Headless intent: initialise WalletConnect, open modal, return accountId
// const connectWalletCore = async () => {
async function connectWalletCore() {
  await initializeWalletConnect()

  // Ensure connector is ready
  await new Promise(resolve => setTimeout(resolve, 500))

  await dappConnector.openModal()

  const accountId = dappConnector.signers[0]?.getAccountId()?.toString()
  if (!accountId)
    throw new Error("Wallet connection failed")

  return accountId
}

// disconnectWalletCore
// Headless intent: clear wallet session and disconnect active connector
// const disconnectWalletCore = async () => {
async function disconnectWalletCore() {
  localStorage.removeItem("walletConnectAccountId")

  if (dappConnector) {
    try {
      await dappConnector.disconnect()
    } catch (error) {
      console.warn("[WC] Error during wallet disconnect:", error)
    }
  }

  return true
}

// restoreWalletSessionCore
// Headless intent: attempt to restore a valid wallet session and return accountId
// const restoreWalletSessionCore = async () => {
async function restoreWalletSessionCore() {
  const storedAccountId = localStorage.getItem("walletConnectAccountId")
  if (!storedAccountId)
    return null

  try {
    await initializeWalletConnect()

    const activeAccountId =
      dappConnector.signers[0]?.getAccountId()?.toString()

    if (activeAccountId === storedAccountId) {
      console.log("Wallet session restored:", storedAccountId)
      return storedAccountId
    }

    console.warn("Stored wallet session is not active. Please reconnect.")
    localStorage.removeItem("walletConnectAccountId")
    return null
  } catch (error) {
    console.error("Error restoring wallet session:", error)
    return null
  }
}

// restoreWalletSession
// Wrapper preserving boolean contract for existing call sites
const restoreWalletSession = async () => {
  const accountId = await restoreWalletSessionCore()
  return !!accountId
}





// ┬ ┬┌─┐┌┬┐┌─┐┬─┐┌─┐   ┌─┐┌─┐┬─┐┌─┐
// ├─┤├┤  ││├┤ ├┬┘├─┤───│  │ │├┬┘├┤ 
// ┴ ┴└─┘─┴┘└─┘┴└─┴ ┴   └─┘└─┘┴└─└─┘
// hedera-core

// processPreparedTransaction
// Executes an already-prepared (frozen) Hedera transaction using the active signer.
// const prepareTransaction = async (transactionBytes, signer) => {
async function prepareTransaction(transactionBytes, signer) {
  const transaction = Transaction.fromBytes(transactionBytes)

  // Freeze once, correctly
  if (!transaction.isFrozen()) {
    signer
      ? await transaction.freezeWithSigner(signer)
      : await transaction.freeze()
  }

  const txId = transaction.transactionId?.toString()

  if (!txId)
    throw new Error("Transaction ID missing after freeze")

  const txInfo = parseTxId(txId)

  return { transaction, txId, txInfo }
}


// processPreparedTransaction
// Executes a pre-prepared (already frozen) Hedera transaction using the active signer.
//
// Responsibilities:
// - Assumes the Transaction has already been constructed and frozen
// - Executes the transaction with the connected wallet signer
// - Returns the execution result containing the transactionId
//
// Notes:
// - Does NOT parse bytes
// - Does NOT freeze or modify the transaction
// - Separation of concerns: preparation happens upstream (prepareTransaction)
// - Safe to reuse in different execution paths (immediate submit, retries, etc.)
//
// Errors:
// - Throws if no signer is available
// - Throws if execution fails or no transactionId is returned

// const processPreparedTransaction = async transaction => {
async function processPreparedTransaction(transaction) {
  try {
    const signer = dappConnector.signers[0]
    if (!signer)
      throw new Error("No signer available. Please reconnect your wallet.")

    const txResult = await transaction.executeWithSigner(signer)

    if (!txResult?.transactionId)
      throw new Error("Transaction not successful")

    return txResult
  } catch (error) {
		
			if (error?.txError?.message === "USER_REJECT") {
				return {
					status: "rejected by user",
					reason: "user"
				}
			}
			
			throw error		
  }
}

// signPreparedTransaction
// Signs an already-prepared (frozen) Hedera transaction without submitting it.
// const signPreparedTransaction = async transaction => {
async function signPreparedTransaction(transaction) {
  try {
    const signer = dappConnector.signers[0]
    if (!signer)
      throw new Error("No signer available. Please reconnect your wallet.")

    const signedTransaction = await transaction.signWithSigner(signer)

    console.log("[WC] Signed transaction (not submitted):", signedTransaction)
    return signedTransaction
  } catch (error) {
    console.error("[WC] Error signing transaction only:", error)
    throw error
  }
}

// parseTxId
// Parses a Hedera transaction ID string into structured components and basic validity status.
//
// Suggestions:
// - Pure utility, no WalletConnect dependency
// - Status logic could evolve independently of parsing
// export const parseTxId = txid => {
export function parseTxId(txid) {
	// 0.0.123@1769033572.006227887
	if (!txid || typeof txid !== "string")
			throw new Error("Invalid transaction ID")
	
	const [operatorId, startTime] = txid.split('@')
	const [shard, realm, entityNum] =
	operatorId.split('.').map(v => parseInt(v, 10))

	if (!startTime)
		throw new Error("Invalid transaction ID - missing start time")
	
	const [startSeconds, startNanos] =
		startTime.split('.').map(v => parseInt(v, 10))

	const nowSeconds = Math.floor(Date.now() / 1000)
	
  let status = "valid"
  if (startSeconds > nowSeconds) // todo consider clock drift
    status = "not_yet_valid"
		
  const expiresAt = startSeconds + 120 // todo replace with actual valid window (120 is default)	
  if (nowSeconds > expiresAt ) // todo consider clock drift
    status = "expired"
	
	return {operatorId, shard, realm, entityNum, startSeconds, startNanos, status }
}




// ┬┌─┌─┐┌─┐┌─┐  ╔═╗╔═╗╦
// ├┴┐├─┘│ │└─┐  ╠═╣╠═╝║
// ┴ ┴┴  └─┘└─┘  ╩ ╩╩  ╩
// kpos API


// saveSignedTransaction
// Dummy API wrapper to persist a signed (but unsubmitted) transaction
//
// Notes:
// - Endpoint URL is placeholder
// - Payload shape is intentionally minimal
// - Replace URL and body as needed

// todo extract from execDealFLow the kpos read step


// const saveSignedTransaction = async signedTransaction => {
async function saveSignedTransaction(signedTransaction) {  // to migrate this and deprecate here
  try {
    const apiUrl = "https://kpos.uk/pool/txSave" 
    // const apiUrl = "/txSave" //nah.. have the app do this, and keep WC pure

		const payload = {
				network: walletConfig.hedera.network, // "testnet" | "mainnet"
				response: {
					signedTransaction: Array.from(
						signedTransaction.toBytes()
					)
				},
				comment: 'AR84754 tracer, WC in-bundle to be deprecated',  // dev use only
			}

    console.log("[WC] Saving signed transaction to API:", payload)

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok)
      throw new Error(`Failed to save signed transaction (${response.status})`)

    const result = await response.json()
    console.log("[WC] Signed transaction saved:", result)

    return result
  } catch (error) {
    console.error("[WC] Failed to save signed transaction:", error)
    throw error
  }
}





// ┬┌┐┌┌┬┐┌─┐┬─┐┌─┐┌─┐┌┬┐┬┌─┐┌┐┌  ┌─┐┌┬┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐┌─┐
// ││││ │ ├┤ ├┬┘├─┤│   │ ││ ││││  ├─┤ ││ ││├─┤├─┘ │ │ │├┬┘└─┐
// ┴┘└┘ ┴ └─┘┴└─┴ ┴└─┘ ┴ ┴└─┘┘└┘  ┴ ┴─┴┘─┴┘┴ ┴┴   ┴ └─┘┴└─└─┘
// interaction addaptors

// resolveWalletUIState
// Headless intent: derive wallet UI state from account connection
const resolveWalletUIState = (accountId) => {
  if (accountId) {
    return {
      connected: true,
      label: `Connected: ${accountId}`,
      connectDisabled: true,
      showDisconnect: true
    }
  }

  return {
    connected: false,
    label: "Open WalletConnect Modal",
    connectDisabled: false,
    showDisconnect: false
  }
}


// updateWalletConnectionUI
// Button-based UI adapter for wallet connection state
const updateWalletConnectionUI = (accountId) => {
  const walletConnectButton =
    document.getElementById("pair-walletconnect-btn")

  if (!walletConnectButton) {
    console.info(
      "[WC] pair-walletconnect-btn not found, skipping wallet UI update"
    )
    return
  }

  const disconnectButton =
    document.getElementById("wallet-disconnect")

  const uiState = resolveWalletUIState(accountId)

  // Update connect button
  walletConnectButton.textContent = uiState.label
  walletConnectButton.disabled = uiState.connectDisabled

  // Update disconnect button
  if (disconnectButton) {
    disconnectButton.style.display =
      uiState.showDisconnect ? "block" : "none"

    if (uiState.showDisconnect)
      disconnectButton.style.marginTop = "10px"
  }
}



// openWalletConnectModal
// Initialises WalletConnect (if needed) and opens the WalletConnect pairing modal.
const openWalletConnectModal = async () => {
  try {
    const accountId = await connectWalletCore()

    localStorage.setItem("walletConnectAccountId", accountId)
    console.log("Account ID stored in localStorage:", accountId)

    updateWalletConnectionUI(accountId)
  } catch (error) {
    console.error("Error opening WalletConnect modal:", error)
    walletUI.showAlert(
      "Failed to open WalletConnect modal. Please try again.",
      "danger"
    )
  }
}










const showTxSaveResult = saveResult => {
  const ok = saveResult?.success === true
  const result = saveResult?.result || {}
  const { comments = [], errors = [], network, txId } = result

  const txLink =
    network && txId
      ? `<a href="https://kpos.uk/pool/txRead?network=${network}&txid=${txId}"
           target="_blank" rel="noopener">
           View saved tx ${txId}
         </a>`
      : ""

  if (ok) {
    const msg = [
      comments.length
        ? comments.join("<br>")
        : "Transaction saved successfully",
      txLink
    ]
      .filter(Boolean)
      .join("<br><br>")

    walletUI.showTxAlert(msg, "success", "last_tx")
  } else {
    const msg = [
      errors.length
        ? `<pre>${JSON.stringify(errors, null, 2)}</pre>`
        : "Transaction save failed",
      txLink
    ]
      .filter(Boolean)
      .join("<br><br>")

    walletUI.showTxAlert(msg, "warning", "last_tx")
  }
}




// signTxCore
// Headless intent: sign (and optionally submit) raw transaction bytes
//
// Inputs:
// - accountId: string (wallet account expected to sign)
// - transactionBytes: Uint8Array (already constructed tx bytes)
// - submitNow: boolean
//
// Behaviour:
// - submitNow === true  -> sign + submit, return transactionId
// - submitNow === false -> sign only, return signed tx bytes

async function signTxCore ({
  accountId,
  transactionBytes,
  submitNow
}) {
  if (!accountId)
    throw new Error("Missing accountId")

  if (!(transactionBytes instanceof Uint8Array))
    throw new Error("transactionBytes must be Uint8Array")

  const signer = dappConnector?.signers?.[0]
  if (!signer)
    throw new Error("No signer available. Please reconnect wallet.")

  const activeAccountId =
    signer.getAccountId()?.toString()

  if (activeAccountId !== accountId)
    throw new Error("Active wallet account does not match accountId")

  const { transaction, txId, txInfo } =
    await prepareTransaction(transactionBytes, signer)

  console.log("[WC] signTX tx inspection:", txInfo)

  let finalSubmitNow = submitNow
  if (txInfo.status === "not_yet_valid")
    finalSubmitNow = false

  if (finalSubmitNow) {
    const txResult =
      await processPreparedTransaction(transaction)

    return {
      status: "submitted",
      transactionId: txResult.transactionId
    }
  }

  const signedTransaction =
    await signPreparedTransaction(transaction)

  const saveResult =
    await saveSignedTransaction(signedTransaction)


  return {
    status: "signed_only",
    signedTransaction: Array.from(
      signedTransaction.toBytes()
    ),
		saveResult
  }
}

// signTxCoreV2
// Headless intent: sign a Hedera transaction via WalletConnect ONLY
//
// Inputs:
// - accountId: string
// - transactionBytes: Uint8Array (unsigned or partially signed)
//
// Output:
// - signedTransactionBase64: string
//
// Notes:
// - Does NOT submit
// - Does NOT inspect tx semantics
// - Does NOT depend on legacy helpers

async function signTxCoreV2 ({
  accountId,
  transactionBytes
}) {
  if (!accountId)
    throw new Error("Missing accountId")

  if (!(transactionBytes instanceof Uint8Array))
    throw new Error("transactionBytes must be Uint8Array")

  const signer = dappConnector?.signers?.[0]
  if (!signer)
    throw new Error("No signer available. Please reconnect wallet.")

  const activeAccountId =
    signer.getAccountId()?.toString()

  if (activeAccountId !== accountId)
    throw new Error("Active wallet account does not match accountId")

  // Rebuild transaction from bytes
  const transaction =
    Transaction.fromBytes(transactionBytes)

  // Freeze if required (recommended WC flow)
  if (!transaction.isFrozen()) {
    await transaction.freezeWithSigner(signer)
  }

  // WalletConnect signature request (NO execution)
  const signedTransaction =
    await signer.signTransaction(transaction)

	// dont save.. let the client do it (affects reporting on "new" signatures)
  // const saveResult = await saveSignedTransaction(signedTransaction)


  // Encode for transport
  const signedBytes =
    signedTransaction.toBytes()




    return {
      // saveResult,
      signedTransactionHex: bytesToHex(signedBytes),
      // signedTransaction: // hex
        // Array
          // .from(signedBytes)
          // .map(b => b.toString(16).padStart(2, "0"))
          // .join("")
    }


  // return {
    // signedTransactionBase64:
      // Buffer.from(signedBytes).toString("base64"),
    // signedTransactionHex:
      // Buffer.from(signedBytes).toString("hex")  
  // }

  
}


function bytesToHex(bytes) {
  return Array
    .from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}


// ┌─┐─┐ ┬┌─┐┌─┐┬ ┬┌┬┐┌─┐  ╔╦╗┌─┐┌─┐┬    ╔═╗┬  ┌─┐┬ ┬
// ├┤ ┌┴┬┘├┤ │  │ │ │ ├┤    ║║├┤ ├─┤│    ╠╣ │  │ ││││
// └─┘┴ └─└─┘└─┘└─┘ ┴ └─┘  ═╩╝└─┘┴ ┴┴─┘  ╚  ┴─┘└─┘└┴┘
// execute Deal Flow

// this is still too long.. needs breaking up.. lets extract the kpos bit first

// executeDealFlowCore
// Headless intent: fetch, prepare, sign, and optionally submit a deal transaction
// const executeDealFlowCore = async ({
async function executeDealFlowCore ({
  accountId,
  dealId,
  userParamsString,
  submitNow
}) {
  const apiUrl =
    `https://kpos.uk/deal/bytes/?dealId=${dealId}` +
    `&${userParamsString}` +
    `&userAccountId=${accountId}`

  console.log(apiUrl)

  const response = await fetch(apiUrl)
  if (!response.ok)
    throw new Error(
      `Failed to fetch transaction bytes: ${response.statusText}`
    )

  const data = await response.json()
  if (!data.bytes?.data) {
    console.warn("Deal bytes not ready yet", data)
    return { status: "not_ready" }
  }

  const transactionBytes = new Uint8Array(data.bytes.data)
  const signer = dappConnector.signers[0]

  const { transaction, txId, txInfo } =
    await prepareTransaction(transactionBytes, signer)

  console.log("[WC] tx inspection:", txInfo)

  let finalSubmitNow = submitNow
  if (txInfo.status === "not_yet_valid")
    finalSubmitNow = false

  if (finalSubmitNow) {
    const txResult =
      await processPreparedTransaction(transaction)

    return {
      status: "submitted",
      transactionId: txResult.transactionId
    }
  }

  const signedTransaction =
    await signPreparedTransaction(transaction)

  const saveResult =
    await saveSignedTransaction(signedTransaction)

  return {
    status: "signed_only",
    saveResult
  }
}


// executeDealFlow
// UI-triggered wrapper preserving existing behaviour and alerts
export const executeDealFlow = async () => {
  const accountId =
    localStorage.getItem("walletConnectAccountId")

  if (!accountId) {
    walletUI.showAlert(
      "Please connect your wallet first.",
      "warning"
    )
    return
  }

  const dealIdInput =
    document.getElementById("dealId")?.value

  const urlParams =
    new URLSearchParams(window.location.search)

  let submitNow = true
  if (urlParams.get("submitServerSide"))
    submitNow = false

  const dealId =
    dealIdInput || urlParams.get("dealId")

  if (!dealId) {
    walletUI.showAlert(
      "Please provide a valid dealId.",
      "warning"
    )
    return
  }


	const userParameters = []

	document
		.querySelectorAll(".user_input")
		.forEach(el => {
			const id = el.id
			const value = el.value

			if (!id || value == null || value === "")
				return

			userParameters.push(`${id}=${value}`)
		})

	
  const userParamsString =
    userParameters
      .map(
        p =>
          `user_parameters[${p.split("=")[0]}]=${p.split("=")[1]}`
      )
      .join("&")

	console.log(userParameters)
	console.log(userParamsString)
  try {
    const result =
      await executeDealFlowCore({
        accountId,
        dealId,
        userParamsString,
        submitNow
      })

    if (!result)
      return

    if (result.status === "submitted") {
      setTimeout(() => {
        walletUI.showTxAlert(
          "Transaction submitted",
          "info",
          "last_tx",
          result.transactionId
        )
      }, walletConfig?.receiptDelayMs ?? 3000)
      return
    }

    if (result.status === "signed_only") {
      showTxSaveResult(result.saveResult)
      return
    }

  } catch (error) {
    console.error("Error occurred while signing", error)
    walletUI.showTxAlert(
      error.message,
      "danger"
    )
  }
}


// handleDisconnect
// UI-triggered disconnect wrapper (buttons, menus, etc.)
const handleDisconnect = async () => {
  try {
    await disconnectWalletCore()
    updateWalletConnectionUI(null)
    location.reload() // preserve existing behavior
  } catch (error) {
    console.error("[WC] Disconnect failed:", error)
  }
}


//what do we call this? where does it go?

// Update the event listener section
document.addEventListener("DOMContentLoaded", async () => {
  const walletConnectButton = document.getElementById("pair-walletconnect-btn");

  const sessionRestored = await restoreWalletSession();
  if (sessionRestored) {
    const storedAccountId = localStorage.getItem("walletConnectAccountId");
    if (storedAccountId) {
      updateWalletConnectionUI(storedAccountId);
    }
  }

  walletConnectButton.addEventListener("click", openWalletConnectModal);
});



// ┬ ┬┌─┐┌─┐┌┬┐┬  ┌─┐┌─┐┌─┐  ┌─┐┌┬┐┌─┐┌─┐┌┬┐┌─┐┬─┐
// ├─┤├┤ ├─┤ │││  ├┤ └─┐└─┐  ├─┤ ││├─┤├─┘ │ │ │├┬┘
// ┴ ┴└─┘┴ ┴─┴┘┴─┘└─┘└─┘└─┘  ┴ ┴─┴┘┴ ┴┴   ┴ └─┘┴└─
// headless adaptor

// exposeHeadlessAPI
// Explicitly expose wallet actions for non-DOM / gesture-driven integrations
const exposeHeadlessAPI = () => {
  if (WALLETCONNECT_MODE !== "headless")
    return

  if (window.WC) {
    console.warn("[WC] window.WC already exists, skipping overwrite")
    return
  }

  window.WC = {
    // lifecycle
    connect: connectWalletCore,
    disconnect: disconnectWalletCore,
    restoreSession: restoreWalletSessionCore,

    // deal execution
    executeDeal: executeDealFlowCore,

    // raw tx signing
    // signTx: signTxCore,
    signTx: signTxCoreV2,

    // helpers / state
    getAccount: () =>
      localStorage.getItem("walletConnectAccountId") || null,

    mode: WALLETCONNECT_MODE
  }

  console.info("[WC] Headless API exposed on window.WC")
}

// Initialise optional headless exposure
exposeHeadlessAPI()




// ┬ ┬┌┬┐┬┬  ┌─┐
// │ │ │ ││  └─┐
// └─┘ ┴ ┴┴─┘└─┘
// utils
//no dependencies...

// getHederaNetworkFromNamespaces
// Extracts the Hedera network name (mainnet/testnet/previewnet) from WalletConnect requiredNamespaces.
//
// Suggestions:
// - Pure utility, could live near other Hedera helpers
// - Assumes first chain only (might be worth making explicit)
function getHederaNetworkFromNamespaces(requiredNamespaces) {
  const chains = requiredNamespaces?.hedera?.chains

  if (!chains || chains.length === 0)
    throw new Error("No Hedera chains defined in requiredNamespaces")

  // Expect format: "hedera:mainnet" | "hedera:testnet" | "hedera:previewnet"
  const [, network] = chains[0].split(":")

  if (!network)
    throw new Error(`Invalid Hedera chain format: ${chains[0]}`)

  return network
}


// hederaChainIdFromNetwork
// Maps a Hedera network string to the corresponding HederaChainId enum.
//
// Suggestions:
// - Could be a lookup map instead of switch
// - Naming is fine but could be read as "resolve" instead of "from"
function hederaChainIdFromNetwork(network) {
  switch (network) {
    case "mainnet": return HederaChainId.Mainnet
    case "testnet": return HederaChainId.Testnet
    case "previewnet": return HederaChainId.Previewnet
    default:
      throw new Error(`Unsupported Hedera network: ${network}`)
  }
}




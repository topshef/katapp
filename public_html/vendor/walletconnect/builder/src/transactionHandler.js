import {
  DAppConnector,
  HederaJsonRpcMethod,
  HederaSessionEvent,
  HederaChainId,
} from "@hashgraph/hedera-wallet-connect";
import { Transaction, LedgerId } from "@hashgraph/sdk";
import { showBootstrapAlert, createTransactionAlert } from "./dealPage.js";

let dappConnector;
let walletConfig

console.log("[WC] BUILD 2026-01-27 v10"); 

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



function hederaChainIdFromNetwork(network) {
  switch (network) {
    case "mainnet": return HederaChainId.Mainnet
    case "testnet": return HederaChainId.Testnet
    case "previewnet": return HederaChainId.Previewnet
    default:
      throw new Error(`Unsupported Hedera network: ${network}`)
  }
}



// Initialize WalletConnect with retry mechanism
const initializeWalletConnect = async (retryCount = 0) => {
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
      showBootstrapAlert(
        "Failed to initialize WalletConnect. Please try again.",
        "danger"
      );
      throw error;
    }
  } catch (error) {
    console.error("Error initializing WalletConnect:", error);
    const errorMessage =
      "Failed to initialize WalletConnect. Please check your project ID and try again.";

    showBootstrapAlert(errorMessage, "danger");
    throw error;
  }
};

// Restore wallet session
const restoreWalletSession = async () => {
  const storedAccountId = localStorage.getItem("walletConnectAccountId");
  if (storedAccountId) {
    try {
      await initializeWalletConnect();

      const isConnected =
        dappConnector.signers[0]?.getAccountId()?.toString() ===
        storedAccountId;

      if (isConnected) {
        console.log("Wallet session restored:", storedAccountId);
        return true;
      } else {
        console.warn("Stored wallet session is not active. Please reconnect.");
        localStorage.removeItem("walletConnectAccountId");
      }
    } catch (error) {
      console.error("Error restoring wallet session:", error);
    }
  }

  console.log("No wallet session found.");
  return false;
};

const updateWalletConnectionUI = (accountId) => {
  const walletConnectButton = document.getElementById("pair-walletconnect-btn")
	if (!walletConnectButton) {
		console.info("[WC] pair-walletconnect-btn not found, skipping connect binding")
		return
	}	
	
	
  const disconnectButton = document.getElementById("wallet-disconnect");

  if (accountId) {
    // Update connect button
    walletConnectButton.textContent = `Connected: ${accountId}`;
    walletConnectButton.disabled = true;

    // Show disconnect button
    if (disconnectButton) {
      disconnectButton.style.display = "block";
      disconnectButton.style.marginTop = "10px";
    }
  } else {
    // Reset to initial state
    walletConnectButton.textContent = "Open WalletConnect Modal";
    walletConnectButton.disabled = false;

    if (disconnectButton) {
      disconnectButton.style.display = "none";
    }
  }
};

// Modify the openWalletConnectModal function
const openWalletConnectModal = async () => {
  try {
    await initializeWalletConnect();

    // Add a small delay before opening modal to ensure proper initialization
    await new Promise((resolve) => setTimeout(resolve, 500));

    await dappConnector.openModal();
    console.log("WalletConnect modal opened successfully!");

    const accountId = dappConnector.signers[0]?.getAccountId()?.toString();
    if (accountId) {
      localStorage.setItem("walletConnectAccountId", accountId);
      console.log("Account ID stored in localStorage:", accountId);
      updateWalletConnectionUI(accountId);
    }
  } catch (error) {
    console.error("Error opening WalletConnect modal:", error);
    showBootstrapAlert(
      "Failed to open WalletConnect modal. Please try again.",
      "danger"
    );
  }
};

// Process transaction bytes
const processTransactionBytes = async (transactionBytes) => {
  try {
    const transaction = Transaction.fromBytes(transactionBytes);
    const signer = dappConnector.signers[0];

    if (!signer)
      throw new Error("No signer available. Please reconnect your wallet.");

    if (!transaction.isFrozen()) {
      await transaction.freezeWithSigner(signer);
    }

    const txResult = await transaction.executeWithSigner(signer);
    console.log("Transaction Result:", txResult);
    if (txResult?.transactionId) {
      return txResult;
    } else {
      console.error("Transaction ID not found in result.");
      throw new Error("Transaction not successful");
    }
  } catch (error) {
    console.error("Error processing transaction:", error);
    //createTransactionAlert(error.message, "danger");
    throw error;
  }
};

// Handlebutton  functionality
export const handleButton = async () => {
  const accountId = localStorage.getItem("walletConnectAccountId");
  if (!accountId) {
    showBootstrapAlert("Please connect your wallet first.", "warning");
    return;
  }

  const dealIdInput = document.getElementById("dealId")?.value;
  const urlParams = new URLSearchParams(window.location.search);
  const dealId = dealIdInput || urlParams.get("dealId");
  if (!dealId) {
    showBootstrapAlert("Please provide a valid dealId.", "warning");
    return;
  }

  // Get the usdAmount from the URL
  const amountUSD = urlParams.get("amountUSD");
  const sender = urlParams.get("sender");
  const receiver = urlParams.get("receiver");
  const amountHbar = urlParams.get("amountHbar");
  const memo = urlParams.get("memo");

  let userParameters = [];
  if (amountUSD) userParameters.push(`amountUSD=${amountUSD}`);
  if (sender) userParameters.push(`sender=${sender}`);
  if (receiver) userParameters.push(`receiver=${receiver}`);
  if (amountHbar) userParameters.push(`amountHbar=${amountHbar}`);
  if (memo) userParameters.push(`memo=${memo}`);

  // Correctly format the parameters
  const userParamsString = userParameters
    .map(
      (param) =>
        `user_parameters[${param.split("=")[0]}]=${param.split("=")[1]}`
    )
    .join("&");

  console.log(userParamsString);

  try {
    // Construct the API URL with dealId, usdAmount, and accountId
    const apiUrl = `https://kpos.uk/deal/bytes/?dealId=${dealId}&${userParamsString}&userAccountId=${accountId}`;
    console.log(apiUrl);
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch transaction bytes: ${response.statusText}`
      );
    }

    const data = await response.json();
    if (!data.bytes?.data) {
      // throw new Error("Transaction bytes not found in response.");
			console.warn("Deal bytes not ready yet", data);
			return; // silently ignore, do NOT alert user
			// im not fucking convinced
    }
		
		// if (!data.bytes?.data) {
			// console.warn("Deal bytes not ready yet", data);
			// return; // silently ignore
		// }

    console.log(data);
    const transactionBytes = new Uint8Array(data.bytes.data);

    try {
      const txResult = await processTransactionBytes(transactionBytes);
      console.log("Transaction Result:", txResult);
      if (txResult.transactionId) {
				setTimeout(() => {
					createTransactionAlert(
						`Success!`,
						"success",
						"last_tx",  //aligns with gomint kpay xproof etc
						txResult.transactionId
					)
				}, walletConfig?.receiptDelayMs ?? 3000)  // helps avoid user hitting mirror before ready
      } else {
        throw new Error("Transaction not successful");
      }
    } catch (error) {
      console.error(error);
      throw error; // let outer catch handle UX   //createTransactionAlert(error.message, "danger");
    }
  } catch (error) {
    console.error("Error occurred while signing", error);
    createTransactionAlert(error.message, "danger");
  }
};

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

// Update disconnect functionality
const handleDisconnect = () => {
  localStorage.removeItem("walletConnectAccountId");
  updateWalletConnectionUI(null);
  location.reload(); // Optional: remove if you don't want page refresh on disconnect
};

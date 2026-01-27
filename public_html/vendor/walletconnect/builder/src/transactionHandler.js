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

async function loadConfig() {
  try {
    // Check for project ID in hidden input element
    const projectIdInput = document.getElementById("walletConnectProjectID");
    const hiddenProjectId = projectIdInput ? projectIdInput.value : null;
    console.log("Hidden Project ID:", hiddenProjectId);

    let config;
    try {
      // Attempt to fetch the config from the JSON file
      const response = await fetch(`${import.meta.env.BASE_URL}config.json`);
      if (!response.ok) {
        throw new Error("Failed to load config");
      }
      config = await response.json();
    } catch (error) {
      console.warn(
        "Config file not found or invalid, using fallback values:",
        error
      );
      // Fallback configuration
      config = {
        metadata: {
          name: window.location.host, // Use current domain as name
          description: "Hedera dApp",
          icons: ["/icon.png"],
        },
        networkConfig: {
          mainnet: {
            network: "mainnet",
          },
        },
        walletConnect: {
          projectId: "e982424244b13437d6b567852a6b051e", // Fallback project ID
          relayUrl: "wss://relay.walletconnect.org",
        },
      };
    }

    // Use hidden project ID if available, otherwise use config's project ID or fallback
    const projectId = hiddenProjectId || config.walletConnect?.projectId;

    if (!projectId) {
      throw new Error("No WalletConnect project ID available");
    }

    // Ensure all required configuration sections exist
    const finalConfig = {
      metadata: {
        name: config.metadata?.name || window.location.host,
        description: config.metadata?.description || "Hedera dApp",
        icons: config.metadata?.icons || ["/icon.png"],
      },
      networkConfig: {
        mainnet: {
          network: config.networkConfig?.mainnet?.network || "mainnet",
        },
      },
      walletConnect: {
        projectId: projectId,
        relayUrl:
          config.walletConnect?.relayUrl || "wss://relay.walletconnect.org",
      },
    };

    console.log("Final config:", finalConfig);
		walletConfig = finalConfig  // make accessible to rest of app for UX stuff
    return finalConfig;
  } catch (error) {
    console.error("Error in loadConfig:", error);
    throw new Error(`Configuration error: ${error.message}`);
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

    // Ensure networkConfig and mainnet are defined
    if (!config.networkConfig || !config.networkConfig.mainnet) {
      throw new Error("Network configuration is missing or invalid.");
    }

    // Initialize the WalletConnect DAppConnector with loaded config
    dappConnector = new DAppConnector(
      {
        ...config.metadata,
      },
      LedgerId.fromString(config.networkConfig.mainnet.network),
      config.walletConnect.projectId,
      Object.values(HederaJsonRpcMethod),
      [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
      [HederaChainId.Testnet]
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
  const walletConnectButton = document.getElementById("pair-walletconnect-btn");
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
    createTransactionAlert(error.message, "danger");
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
      throw new Error("Transaction bytes not found in response.");
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
      createTransactionAlert(error.message, "danger");
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

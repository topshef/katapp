import { executeDealFlow, registerWalletUI} from "./transactionHandler.js";

registerWalletUI({
  showAlert: showBootstrapAlert,
  showTxAlert: createTransactionAlert
})

// Utility functions
const Utils = {
  getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  },

	getPathParam(param) {
		const segments = window.location.pathname
			.split("/")
			.filter(Boolean)

		for (let i = 0; i < segments.length - 1; i++)
			if (segments[i] === param)
				return segments[i + 1]

		return null
	},

	getQueryorPathParam(param) {  // hack either or.. path is fallback.. but review
		const queryValue = this.getQueryParam(param)
		if (queryValue) return queryValue
		console.log(`query param ${param} is missing.. trying path param instead`)
		return this.getPathParam(param)
	},

  updateURLParameter(param, value) {
    const urlParams = new URLSearchParams(window.location.search);
    value ? urlParams.set(param, value) : urlParams.delete(param);
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${urlParams}`
    );
  },

  validateEntity(value) {
    return /^\d+\.\d+\.\d+$/.test(value); // Matches format like 0.0.1234
  },
}

// API calls
const API = {
  async fetchDealData(dealId) {
    try {
      const response = await fetch(
        `https://kpos.uk/deal/query/?locate&dealId=${dealId}`
      );
      if (!response.ok) throw new Error("Failed to fetch deal data.");
      return await response.json();
    } catch (error) {
      console.error("Error fetching deal data:", error);
      return null;
    }
  },
};

// UI rendering functions
const UI = {
  renderFallbackUI(dealSection) {
    dealSection.innerHTML = `
      <h2>No Deal Found</h2>
      <p>Please connect your wallet, and also provide a valid deal ID in the URL.</p>
    `;
  },

  renderFullPage() {
    // Check if bootstrap CSS already exists
    if (!document.querySelector('link[href*="bootstrap"]')) {
      const bootstrapCss = document.createElement("link");
      bootstrapCss.rel = "stylesheet";
      bootstrapCss.href =
        "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0-alpha1/dist/css/bootstrap.min.css";
      document.head.appendChild(bootstrapCss);
    }

    // Check if version element already exists
    if (!document.getElementById("bundle_wc_version")) {
      const versionElement = document.createElement("div");
      versionElement.id = "bundle_wc_version";
      versionElement.style.display = "none";
      document.body.appendChild(versionElement);
    }

    // Check if main container already exists
    if (!document.querySelector("main.container.mt-5")) {
      const mainContainer = document.createElement("main");
      mainContainer.className = "container mt-5";

      // Check if pair-walletconnect-btn element already exists
      const existingWalletConnect = document.getElementById(
        "pair-walletconnect-btn"
      );

      mainContainer.innerHTML = `
        <div id="alert" class="position-fixed top-0 end-0 p-3" style="z-index: 1050"></div>
        <div id="last_tx" class="position-fixed top-0 start-0 p-3" style="z-index: 1050"></div>
        <div class="row">
          <section class="col-md-6 d-flex justify-content-center align-items-center">
            <form id="connect" class="toggle card p-4 shadow-sm" style="max-width: 400px; width: 100%;">
              <fieldset>
                <div id="bundle_wc_version" style="display: none;">Version- 6ac5d39ad228885c6267427f3779bce49abb8d1a2a464b65eddcd8509d75f778</div>
                <legend class="h5">Connect a Wallet</legend>
                <p><i>Connect your wallet to sign the transaction.</i></p>
                ${
                  !existingWalletConnect
                    ? `
                  <button
                    id="pair-walletconnect-btn"
                    type="button"
                    class="btn btn-primary w-100 mt-3"
                  >
                    Open WalletConnect Modal
                  </button>
                `
                    : ""
                }
                <button
                  id="wallet-disconnect"
                  type="button"
                  class="btn btn-danger w-100 mt-3"
                  style="display: none;"
                >
                  Disconnect your wallet
                </button>
              </fieldset>
            </form>
          </section>
          <section id="deal-section" class="col-md-6 text-center">
            <h2>Loading...</h2>
          </section>
        </div>
      `;
      document.body.appendChild(mainContainer);
    }
  },

  renderDealUI(dealData) {
    const dealSection = document.getElementById("deal-section");
    if (!dealData) {
      this.renderFallbackUI(dealSection);
      return;
    }

    const { display, parameters } = dealData.deal;

    // Clear existing content
    dealSection.innerHTML = "";

    // Create and append elements
    const title = this.createElement("h1", display.title);
    const description = this.createElement(
      "p",
      display.description.replace(/\\u003C/g, "<").replace(/\\u003E/g, ">")
    );
    const thumbnail = this.createThumbnail(display.thumbnail);
    const inputButtonContainer = this.createInputs(parameters);
    const actionButton = this.createActionButton(display.button);

    // Only append actionButton if it was created (i.e., if it didn't exist already)
    dealSection.append(
      title,
      description,
      thumbnail,
      inputButtonContainer,
      actionButton ? actionButton : null
    );

		
  },

  createElement(tag, textContent = "", attributes = {}) {
    const element = document.createElement(tag);
    element.textContent = textContent;
    Object.entries(attributes).forEach(([key, value]) =>
      element.setAttribute(key, value)
    );
    return element;
  },

  createThumbnail(src) {
    if (!src) return null;

    const thumbnail = this.createElement("img", "", {
      src,
      alt: "Deal Thumbnail",
    });
    thumbnail.style.cssText =
      "max-width: 100%; height: auto; margin-bottom: 20px; max-height: 100px; object-fit: cover;";
    return thumbnail;
  },

  createInputs(parameters) {
    const container = this.createElement("div");
    container.style.cssText =
      "display: flex; flex-direction: column; gap: 10px; max-width: 100%; margin: 0 auto;";

    Object.entries(parameters).forEach(([key, placeholder]) => {
      // Only check for existing input by ID
      let existingInput = document.getElementById(key);
      let inputGroup;

      if (existingInput) {
        // Use existing input and its parent group as-is
        inputGroup = existingInput.parentElement;

        // Only update the essential input properties
        existingInput.required = true;

        // Add event listener and URL parameter handling
        const paramValue = Utils.getQueryParam(key);
        if (paramValue) existingInput.value = paramValue;

        // Remove any existing event listeners and add new one
        const newInput = existingInput.cloneNode(true);
        existingInput.parentNode.replaceChild(newInput, existingInput);
        newInput.addEventListener("input", () => {
          const value = newInput.value.trim();
          if (placeholder.endsWith("entity") && !Utils.validateEntity(value)) {
            newInput.setCustomValidity("Invalid account number format.");
          } else {
            newInput.setCustomValidity("");
          }
          newInput.reportValidity();
          Utils.updateURLParameter(key, value);
        });
      } else {
        // Create new elements only if input doesn't exist
        inputGroup = this.createElement("div", "", {
          style:
            "display: flex; gap: 10px; align-items: center; justify-content: flex-start;",
        });

        const label = this.createElement("label", key, {
          style: "min-width: 100px; text-align: left; font-weight: 500;",
          for: key,
        });

        const input = this.createInputField(key, placeholder);
        inputGroup.append(label, input);
        container.appendChild(inputGroup);
      }
    });

    return container;
  },

  createInputField(key, placeholder) {
    const input = this.createElement("input", "", {
      placeholder: placeholder.split("[")[0].trim(),
      required: true,
      class: "form-control",
    });

    if (placeholder.endsWith("number")) {
      Object.assign(input, {
        type: "number",
        step: "any",
        title: "Please enter a valid number",
      });
    } else if (placeholder.endsWith("text")) {
      input.type = "text";
    } else if (placeholder.endsWith("entity")) {
      Object.assign(input, {
        type: "text",
        pattern: "\\d+\\.\\d+\\.\\d+",
        title: "Account number must be in the format 0.0.1234",
      });
    }

    const paramValue = Utils.getQueryParam(key);
    if (paramValue) input.value = paramValue;

    input.addEventListener("input", () => {
      const value = input.value.trim();
      if (placeholder.endsWith("entity") && !Utils.validateEntity(value)) {
        input.setCustomValidity("Invalid account number format.");
      } else {
        input.setCustomValidity("");
      }
      input.reportValidity();
      Utils.updateURLParameter(key, value);
    });

    return input;
  },

  createActionButton(buttonText) {
    // Check if button with ID 'create-tx' already exists
    let button = document.getElementById("create-tx");

    if (!button) {
      // Create new button only if it doesn't exist
      button = this.createElement("button", buttonText, {
        id: "create-tx",
        style: "margin-top: 10px;",
        class: "btn btn-primary",
      });
      return button;
    }
  },
};

// Add this function to create the receipt link
// const createReceiptLink = (transactionId) => {
  // const link = document.createElement("a");
  // link.href = `https://hashscan.io/mainnet/transaction/${transactionId}`;
  // link.target = "_blank"; // Open in a new tab
  // link.textContent = "Get Receipt";
  // link.className = "btn btn-info"; // Add some styling
  // link.style.color = "white"; // Set text color to white
  // return link;
// };

const createReceiptLink = transactionId => {
  const link = document.createElement("a")
  link.href = `https://hashscan.io/mainnet/transaction/${transactionId}`
  link.target = "_blank"
  link.rel = "noopener noreferrer"
  link.textContent = `View receipt ${transactionId}`
  link.className = "transaction-receipt-link"
  return link
}

// Update the createTransactionAlert function
export function  createTransactionAlert(
  message,
  type = "info",
  containerId = "last_tx",  //aligns with gomint kpay xproof etc
  transactionId = null // Add transactionId parameter
) {
  const alertContainer = document.getElementById(containerId);

  const alert = document.createElement("div");
  alert.className = `alert alert-${type} alert-dismissible fade show `;
  alert.role = "alert";
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-dismiss="alert" data-bs-dismiss="alert" aria-label="Close"></button>
  `
	alert.querySelector('.btn-close')?.addEventListener('click', () => alert.remove())  // activate in case no bs js

  // If a transactionId is provided, create the receipt link
  if (transactionId) {
    const receiptLink = createReceiptLink(transactionId);
    alert.appendChild(receiptLink);
  }

  alert.style.fontSize = "0.75rem";
  alertContainer.appendChild(alert);
}

export function showBootstrapAlert(
  message,
  type = "info",
  containerId = "alert"
) {
  const alertContainer = document.getElementById(containerId);

  const alert = document.createElement("div");
  alert.className = `alert alert-${type} alert-dismissible fade show`;
  alert.role = "alert";
  alert.innerHTML = `
    ${message}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;

  alertContainer.appendChild(alert);

  // Automatically remove the alert after 5 seconds
  setTimeout(() => {
    alert.classList.remove("show");
    setTimeout(() => alert.remove(), 300); // Allow fade-out animation
  }, 5000);
}


//refactopring...
// This is the important conceptual shift:
// Rendering is conditional
// Behaviour is unconditional

function attachWalletConnectHandlers() {
	const connectBtn = document.getElementById("pair-walletconnect-btn")
	if (connectBtn && !connectBtn.dataset.wcBound) {
		connectBtn.dataset.wcBound = "1"
		connectBtn.addEventListener("click", async () => {
			if (window.WC?.connect) {
				const accountId = await window.WC.connect()
        console.log(`SW38843 window.WC.connect  accountId = ${accountId}`)
        // this should now be redudant as no localstroage needed
        
        
			} else
				console.warn("[KATOMIC] WalletConnect modal handler not found")
		})
	}

	const disconnectBtn = document.getElementById("wallet-disconnect")
	if (disconnectBtn && !disconnectBtn.dataset.wcBound) {
		disconnectBtn.dataset.wcBound = "1"
    disconnectBtn.addEventListener("click", async () => {
      try {
        if (window.WC?.disconnect)
          await window.WC.disconnect()
      } catch (e) {
        console.warn("Disconnect failed", e)
      }

      location.reload()
    })
	}
}


function attachCreateTxHandler() {
	const btn = document.getElementById("create-tx")
	if (!btn) return

	// Prevent double-binding
	if (btn.dataset.txBound) return
	btn.dataset.txBound = "1"

	btn.addEventListener("click", async event => {
		event.preventDefault()
		await executeDealFlow()
	})
}


// Main initialization
async function init() {
	const widgetRoot = document.getElementById('katomic-widget')

	if (widgetRoot) {
		console.log("[KATOMIC] render deal widget")
		UI.renderFullPage()

		const dealId = Utils.getQueryorPathParam("dealId")
		if (dealId) {
			const dealData = await API.fetchDealData(dealId)
			UI.renderDealUI(dealData)
		} else {
			UI.renderFallbackUI(document.getElementById("deal-section"))
		}
	} else console.info('[KATOMIC] Widget anchor not found. Skipping UI render.')

	// Always attach behaviour (widget or not) // later move this out
	attachWalletConnectHandlers()
	attachCreateTxHandler()
}

init();

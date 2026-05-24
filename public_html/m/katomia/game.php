<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
	<link rel="stylesheet" href="katomia.css" />
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <title>katomia</title>

  <style>
		
  </style>
</head>

<body>

	<div id="notifications"></div>

  <div class="app-banner">
    <div class="app-banner-inner">
      <div class="app-logo"></div>
      <h2>Katomia marketplace 🍎🥬🥕</h2>
    </div>
  </div>

  <div id="gameMeta" class="game-meta"></div>

  <div class="controls mode-proposal">
    <label>
      <input id="accountLabelInput" placeholder="Account eg 12345" />
    </label>

    <button id="addAccountBtn">
      <i class="fa-solid fa-plus"></i> Add account
    </button>



  </div>
  


<div id="ordersSection" class="mode-order">

  <div class="orders-market-summary subtle"></div>

  <details class="orders-details" open>

    <summary class="subtle">
      Orders
    </summary>

    <div class="section-controls">
      <button id="createOrderBtn" title=".     Create order" aria-label="Create order">
        <i class="fa-solid fa-plus"></i>
      </button>

      <button id="cancelOrderBtn" title=".     Cancel order" aria-label="Cancel order">
        <i class="fa-solid fa-minus"></i>
      </button>

      <label>
        <input id="showMyOrdersOnly" type="checkbox" checked>
        Only my orders
      </label>

      <label>
        <input id="sortOrdersByPrice" type="checkbox" checked>
        Sort by price
      </label>

    </div>

    <div class="orders-list"></div>

  </details>

</div>


<BR>

<div id="transactionsSection">

  <details class="orders-details" open>

    <summary class="subtle">
      Transactions
    </summary>

    <div class="section-controls">

      <label>
        <input id="hideExpiredTx" type="checkbox" checked>
        Hide expired
      </label>

    </div>

    <div class="transactions-list"></div>

  </details>

</div>
<BR>

<div class="mode-proposal">



  <div class="section-controls">

    <div class="section-controls-title">
      Proposal mode
    </div>

    <label>
      <input type="checkbox" id="showTradingAccounts" />
      Trading accounts only
    </label>

    <label>
      <input type="checkbox" id="showTradedAssets"/>
      Traded assets only
    </label>

    <label class="desktop-toggle">
      <input type="checkbox" id="viewToggle" />
      🖥️ Desktop view
    </label>

  </div>
    
	<div class="hint">


		<span class="hint-desktop">
			Desktop: Drag & drop to move assets.
		</span>

		<span class="hint-mobile">
			Mobile: Tap an asset to see options.
		</span>

		<span class="hint-both">
			Tap trading items to reject/withdraw.
		</span>

		<span class="hint-both">
			When all required parties have "Locked", a transaction will be created ready for signing.
		</span>

	</div>

  <div id="header" class="header">
    <div>Account</div>
    <div>🔁/🔒</div>
    <div>🏪 Store (available)</div>
    <div>📌 Reserved (to send)</div>
    <div>🧺🛒 Basket (receive)</div>
  </div>

	<div id="game"></div>

	<div id="assetModal" class="asset-modal hidden">
		<div class="asset-modal-card">
			<div id="assetModalClose" class="asset-modal-close">✕</div>

			<div id="assetModalPreview" class="asset-modal-preview"></div>

			<div id="assetModalName" class="asset-modal-name"></div>

			<div class="asset-modal-amount-row">

				<span class="asset-modal-input">
					<label>Send amount</label>
					<input id="assetModalAmount" type="number" value="1" min="1">
				</span>
			</div>

			<br>
			<div>Choose a basket 🧺🛒</div>
			<div id="assetModalTargets" class="asset-modal-targets"></div>

		</div>
	</div>
</div>


	<div id="createOrderModal" class="asset-modal hidden">
		<div class="asset-modal-card">
			<div id="createOrderClose" class="asset-modal-close">✕</div>

      <div class="asset-modal-name">
        <span id="createOrderTitle">Create order</span>
        <span id="createOrderContext" class="order-context"></span>
      </div>
      
			<br>
      
      <label>Order type</label>
      <select id="createOrderType">
        <option value="simple-fx">Simple FX</option>
        <option value="basket-fx" disabled>Basket FX</option>
        <option value="simple-nft" disabled>Simple NFT</option>
        <option value="simple-le" disabled>Simple LE (Limited Edition)</option>
        <option value="simple-collectible" disabled>Simple Collectible</option>
        <option value="basket-collectible" disabled>Basket Collectible</option>
        <option value="offer" disabled>Offer / one-sided</option>
        <option value="request" disabled>Request / one-sided</option>
        <option value="exotic" disabled>Exotic / generic bundle</option>
      </select>

      <br><br>

      <label>Pair</label>
      <select id="createOrderPair"></select>

      <br><br>

      <div class="order-side">
        <label><input type="radio" name="createOrderSide" value="buy"> Buy</label>
        <label><input type="radio" name="createOrderSide" value="sell" checked> Sell</label>
      </div>
      
      <br>
      <label>Account</label>

      <div class="account-picker">
        <select id="createOrderAccount"></select>
        <button type="button" id="createOrderAccountAdd">➕</button>
        <button type="button" id="createOrderAccountRemove">➖</button>
      </div>

      <br>

      <label>Volume</label>
      <input id="createOrderVolume" type="number" step="any">

      <br><br>

      <label>Rate</label>
      <input id="createOrderRate" type="number" step="any">

      <br><br>

      <label>Minimum fill / granularity <span style="font-weight:normal;font-size:11px;color:#999">(fraction e.g. 1/3 or 2/6)</span></label>
      <input id="createOrderMinFill" type="text" placeholder="e.g. 1/3">

      <br><br>

      <label>Time in force</label>
      <select id="createOrderTif">
        <option value="GTC" selected>♾️ GTC — Good till cancelled</option>
        <option value="IOC" disabled>⚡ IOC — Immediate or cancel</option>
        <option value="FOK" disabled>🎯 FOK — Fill or kill</option>
        <option value="GTD" disabled>📅 GTD — Good till date</option>
              
      </select>

			<br>
      <details id="createOrderDev">
        <summary>🛠 Pro mode</summary>
        <div class="dev-help">
          one line per order<br>
          order = item | item | item etc...<br>
           item = account;asset;amount(integer)<br>
        </div>
        <textarea
          id="createOrderRaw"
          rows="5"
          placeholder="24739;3841995;-760000|24739;3842078;1000000">
        </textarea>

      </details>
      
      
      <div id="createOrderActions">
        <button id="createOrderSubmit">Create</button>
      </div>
 


		</div>
	</div>
  
  
  <div id="exitGameBtn" class="exit-game-btn">🗑️</div>


<script><?php require_once('config.php');?>
  window.CONFIG = {
    HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
  }
</script>

<script src="/m/bid/localbase.min.js"></script> <!-- beware spelling of Localbase -->
<script type="module" data-global src="/m/tools/glog/latest/glog.js" ></script>
<script type="module" src="/m/bid/localCacheDB.js" ></script>
<script src="/m/bid/localCacheIFPS.js"></script> 
<script src="/m/bid/localCacheArweave.js"></script> 



<script type="module" src="katomia-init.js" data-glog="on"></script>
<script src="katomia-core.js"></script>
<script src="katomia-localdb.js"></script>
<script src="katomia-helpers.js"></script>
<script src="katomia-enrich.js"></script>
<script src="katomia-network.js"></script>
<script src="katomia-modals.js"></script>
<script src="katomia-render.js"></script>
<script src="katomia-render-orders.js"></script>
<script src="katomia-market.js"></script>

<script>
window.addEventListener("load", () => {
// window.addEventListener("DOMContentLoaded", () => {

  const params = new URLSearchParams(location.search)
  const autoload = params.get("autoload")
    
    
  const token = localStorage.getItem("katomiaPlayerToken")

  if(autoload)
    window.pendingAutoload = autoload

  if(typeof connect === "function")
    connect()
    
  
})
</script>

<script>

  document.addEventListener("change",e => {

    if(e.target.id == "hideExpiredTx")
      renderTransactions()

  })


  document.getElementById("exitGameBtn").onclick = () => {
    const ok = confirm("Exit game?\n\nThis removes your accounts and any offers you placed.")
    if(!ok) return
    exitGame()
  }
</script>

<script>
	fetch("../footer.html")
		.then(r => r.text())
		.then(html => {
			document.body.insertAdjacentHTML("beforeend", html)
		})
</script>

</body>


</html>
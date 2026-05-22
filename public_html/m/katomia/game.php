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

  <div class="controls">
    <label>
      <input id="accountLabelInput" placeholder="Account eg 12345" />
    </label>

    <button id="addAccountBtn">
      <i class="fa-solid fa-plus"></i> Add account
    </button>



  </div>
  
<div class="mode-order">

  <div id="ordersSection" class='dogshit'>

    
    <div class="orders-market-summary subtle"></div>
    
    <button id="createOrderBtn">
      <i class="fa-solid fa-plus"></i> Create order
    </button>

    <button id="cancelOrderBtn">
      <i class="fa-solid fa-minus"></i> Cancel order
    </button>
    
  <details class="orders-details">
            
      <summary class="subtle">
        Orders
        <label style="margin-left:8px">
          <input id="showMyOrdersOnly" type="checkbox" checked>
          Only my orders
        </label>

        <label style="margin-left:8px">
          <input id="sortOrdersByPrice" type="checkbox" checked>
          Sort by price
        </label>
      </summary>
      
      <div class="orders-list"></div>
    </details>

    <details class="orders-details" open>
      <summary class="subtle">
        Transactions
        <label style="margin-left:8px">
          <input id="hideExpiredTx" type="checkbox" checked>
          Hide expired
        </label>
      </summary>

      <div class="transactions-list"></div>
    </details>
  
  </div>
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
        <option disabled>Collectible Swap (coming soon)</option>
        <option disabled>Auction (coming soon)</option>
        <option disabled>Generic Bundle (coming soon)</option>
      </select>

      <br><br>

      <label>Pair</label>
      <select id="createOrderPair"></select>

      <br><br>

      <div class="order-side">
        <label><input type="radio" name="createOrderSide" value="buy"> Buy</label>
        <label><input type="radio" name="createOrderSide" value="sell" checked> Sell</label>
      </div>
      
      
      <br><br>
      <label>Account</label>

      <select id="createOrderAccount"></select>

      <br><br>

      <label>Volume</label>
      <input id="createOrderVolume" type="number" step="any">

      <br><br>

      <label>Rate</label>
      <input id="createOrderRate" type="number" step="any">

			<br><br>

      <div id="createOrderActions">
        <button id="createOrderSubmit">Create</button>
      </div>
 
      <br><br>

      <details id="createOrderDev" open>
        <summary>🛠 Advanced mode</summary>

        <textarea
          id="createOrderRaw"
          rows="5"
          placeholder="24739;3841995;-760000|24739;3842078;1000000">
        </textarea>

        <div class="dev-help">
          order = item | item | item etc...<br>
           item = account;asset;amount(integer)<br>
          one line = one order<br>
          multiple lines = multiple orders
        </div>

      </details>
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
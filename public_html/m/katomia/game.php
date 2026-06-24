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
  <button id="profileBtn" class="profile-btn" title="Profile" aria-label="Profile">🔗</button>


  <div class="app-banner">
    <div class="app-banner-inner">
      <h2>
        <span class="app-title">KATOMIA</span>
        <span class="app-icons">💱 🐫</span>
      </h2>
    </div>
  </div>

  <div id="gameMeta" class="game-meta"></div>
  <div id="profileModal" class="profile-modal hidden">
        
    <div class="profile-card">
      <div id="profileModalClose" class="profile-close">✕</div>

      <h2 id="profileTitle">Player</h2>



      <div id="profileQr" class="profile-qr"></div>
      <p class="subtle">Scan with KEA to approve your orders</p>
      
      <div class="profile-list">
        <div class="profile-label">Order public key</div>
        <div id="profilePubkey" class="profile-mono"></div>

        <div class="profile-label">Scope</div>
        <div id="profileScope" class="profile-scope"></div>
      </div>
      
      <a id="profileQrLink" class="profile-link" href="#"></a>

      <button id="profileCopyLinkBtn">Copy KEA link</button>

      <div class="profile-debug">
        <label class="profile-debug-label">
          <input type="checkbox" id="kdiagRemoteToggle">
          Remote diagnostic logging
        </label>
      </div>
    </div>
    
  </div>


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
        <input id="showPendingOrdersOnly" type="checkbox">
        Only pending
      </label>

      <label>
        <input id="sortOrdersByPrice" type="checkbox">
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
  <details class="orders-details" open>
    <summary class="subtle">
      Proposals
    </summary>

    <div class="section-controls">
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
      <span class="hint-desktop">Desktop: Drag & drop to move assets.</span>
      <span class="hint-mobile">Mobile: Tap an asset to see options.</span>
      <span class="hint-both">Tap trading items to reject/withdraw.</span>
      <span class="hint-both">When all required parties have "Locked", a transaction will be created ready for signing.</span>
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

  </details>
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
        <option value="simple-ft">Simple FT</option>
        <option value="basket-ft" disabled>Basket FT</option>
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

      <label>Volume <span id="createOrderVolumeUnit" style="font-weight:normal;font-size:11px;color:#999;margin-left:4px;"></span></label>
      <input id="createOrderVolume" type="number" step="any">
      
      
      <br><br>

      
      <label>Rate <span id="createOrderRateUnit" style="font-weight:normal;font-size:11px;color:#999;margin-left:4px;"></span></label>
      <input id="createOrderRate" type="number" step="any">
      
      <div id="createOrderRateHint" style="font-size:11px;color:#888;margin-top:4px;min-height:14px;"></div>

      <br>


      <label>Minimum fill / granularity <span style="font-weight:normal;font-size:11px;color:#999">(auto-calculated, or override)</span></label>
      <input id="createOrderMinFill" type="text" placeholder="auto">
      <div id="createOrderIntHint" style="font-size:11px;min-height:18px;margin-top:4px;"></div>

      <br>

      <label>Time in force</label>
      <select id="createOrderTif">
        <option value="GTC" selected>♾️ GTC — Good till cancelled</option>
        <option value="GTD">📅 GTD — Good till date</option>
        <option value="IOC">⚡ IOC — Immediate or cancel</option>
        <option value="FOK">🎯 FOK — Fill or kill</option>
      </select>

      <div id="createOrderExpiresAtRow" style="display:none;margin-top:10px;">
        <label>Expires at</label>
        <input id="createOrderExpiresAt" type="datetime-local">
      </div>

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

        <div class="dev-help">
          match conditions — one per line (or paste JSON)<br>
          condition = type [key=value ...]<br>
          eg: singleCounterparty<br>
          eg: maxCounterparties n=2<br>
        </div>
        <textarea
          id="createOrderConditions"
          rows="2"
          placeholder="singleCounterparty">singleCounterparty</textarea>

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

<!-- WalletConnect (exposes window.WC) + KPAY signing widget embed (CDN-style).
     Clicking a tx row opens the same modal used on the kpay signing page; the
     widget is dropped in purely via a script tag to prove it's host-agnostic.
     Both are same-origin here; adjust paths via window.KPAY_FUTURE_BASE etc. -->
<?php require_once($_SERVER['DOCUMENT_ROOT'] . "/vendor/walletconnect/kwcScriptTag.php"); ?>
<script src="/vendor/kpay/kpool_widget/kpay-embed.js" defer></script>



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
<!-- QR: davidshimjs build already bundled with kpool_widget — same file the offline
     signing widget uses. CDN removed to keep all assets in-house.
     TODO(bundling): when kpool_widget is rolled into a proper JS bundle, fold
     qrcode.min.js in and remove this script tag entirely. -->
<script src="/vendor/kpay/kpool_widget/qrcode.min.js"></script>
<script src="katomia-profile.js"></script>

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
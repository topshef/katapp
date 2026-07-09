<?php require_once __DIR__ . '/kasset.php'; ?>
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
	<link rel="stylesheet" href="<?= kasset('katomia.css') ?>" />
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <title>katomia</title>

</head>

<body>

  <?php
    // HEADER-UNIFY: shared banner + hamburger (profile, markets, create, nerd) and
    // the shared profile modal — same partials on every page. The old KATLAB
    // body-padding/banner-bleed fix lives inside header.php now.
    require __DIR__ . '/header.php';
    require __DIR__ . '/profile-modal.php';
  ?>

  <div id="gameMeta" class="game-meta"></div>

  <!-- PROP-ADDACCT1: the raw input + bracket-notation entry moved into the
       add-account modal (see #addAccountModal below); this button just opens it. -->
  <div class="controls mode-proposal">
    <button id="addAccountBtn">
      <i class="fa-solid fa-plus"></i> Add account
    </button>
  </div>
  


<div class="game-layout">

<div class="game-left">

<!-- ORDERS-LAYOUT1: the market chart is its OWN full-width section at the top; orders +
     transactions sit BELOW it as siblings. Previously the chart lived inside
     #ordersSection, so on desktop the transactions column aligned to the chart's top
     rather than the orders list. mode-order gates it to order mode like the sections. -->
<div class="market-chart-section mode-order">
  <div class="orders-market-summary subtle"></div>
</div>

<!-- ORDERS-UI1: orders | tx sit side-by-side on desktop (auto-fit grid), and
     wrap to a single column on narrower viewports. -->
<div class="trade-cols">

<div id="ordersSection" class="mode-order">

  <details class="orders-details" open>

    <summary class="subtle">
      Orders
    </summary>

    <!-- Controls live under the Orders expansion (they filter the ORDER list, not the
         chart above). mine/pending also feed the tx list; sort is orders-only. -->
    <div class="section-controls">
      <button id="createOrderBtn" title="Create order" aria-label="Create order"><i class="fa-solid fa-plus"></i></button>
      <button id="cancelOrderBtn" title="Cancel order" aria-label="Cancel order"><i class="fa-solid fa-minus"></i></button>
      <label><input id="showMyOrdersOnly" type="checkbox" checked> Only mine</label>
      <label><input id="showPendingOrdersOnly" type="checkbox"> Only pending</label>
      <label><input id="sortOrdersByPrice" type="checkbox"> Sort by price</label>
    </div>

    <div class="orders-list"></div>

  </details>

</div>


<div id="transactionsSection">

  <details class="orders-details" open>

    <summary class="subtle">
      Transactions
    </summary>

    <!-- Hide expired stays with tx: an expired transaction ≠ an expired order. -->
    <div class="section-controls">
      <label><input id="hideExpiredTx" type="checkbox" checked> Hide expired</label>
    </div>

    <div class="transactions-list"></div>

  </details>

</div>

</div><!-- .trade-cols -->

</div><!-- .game-left -->

<div id="chatSection">
  <details class="orders-details" open>
    <summary class="subtle">💬 Messages</summary>
    <div class="chat-list"></div>
  </details>
</div>

</div><!-- .game-layout -->

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
      <!-- BOARD-UI1: the desktop checkbox grew into a view/skin dropdown. grid/list
           re-render in place (the old viewMode toggle); board-* skins navigate to the
           standalone full-screen board page (board.php) — the legacy page stays as-is. -->
      <label class="desktop-toggle">
        View
        <select id="viewSelect">
          <option value="columns">🖥️ Grid (desktop)</option>
          <option value="merged">📱 List (mobile)</option>
          <option value="board-table">🎲 Board — round table</option>
          <option value="board-market">🏪 Board — market square</option>
        </select>
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

	<!-- PROP-ADDACCT1: add-account modal — a COMPOSER for the existing addAccounts()
	     label format (bracket notation "0.0.x(a,b,0.0.n-7)"); the join path is unchanged.
	     Flow: pick account (WC-connected / connect / manual) → tick assets → join.
	     Logic in katomia-addaccount.js. -->
	<div id="addAccountModal" class="asset-modal hidden">
		<div class="asset-modal-card addacct-card">
			<div id="addAcctClose" class="asset-modal-close">✕</div>

			<div class="asset-modal-name">Add account</div>

			<div id="addAcctStepAccount">
				<label id="addAcctWcLabel">Connected wallet accounts</label>
				<div id="addAcctWcList" class="addacct-wc-list subtle"></div>
				<button id="addAcctConnect" type="button">🔗 Connect wallet…</button>

				<label class="addacct-manual-label">Or enter an account</label>
				<div class="addacct-manual">
					<input id="addAcctManual" placeholder="Account eg 12345" />
					<button id="addAcctManualUse" type="button">Use</button>
				</div>
			</div>

			<div id="addAcctStepAssets" class="hidden">
				<div class="addacct-chosen"><span id="addAcctChosen" class="addacct-chosen-id"></span> <button id="addAcctBack" type="button" class="addacct-link">change</button></div>
				<div class="addacct-assets-head">
					<label>Assets to bring in</label>
					<span class="addacct-selbtns"><button id="addAcctSelAll" type="button" class="addacct-link">all</button> · <button id="addAcctSelNone" type="button" class="addacct-link">none</button></span>
				</div>
				<div id="addAcctAssets" class="addacct-assets"></div>
				<p id="addAcctHint" class="subtle addacct-hint hidden">💠 Not bound yet — you can join anyway; bind this account in <button id="addAcctProfileLink" type="button" class="addacct-link">Profile → Wallet binding</button> to carry reputation.</p>
			</div>

			<div id="addAcctStatus" class="subtle addacct-status"></div>

			<div id="addAcctActions" class="addacct-actions hidden">
				<button id="addAcctJoinAll" type="button">Join with all assets</button>
				<button id="addAcctJoin" type="button">Join with selected (<span id="addAcctJoinCount">0</span>)</button>
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
        <option value="simple-ft">Simple FT</option>
        <option value="basket-ft" disabled>Basket FT</option>
        <option value="simple-nft">Simple NFT</option>
        <option value="simple-le">Simple LE (Limited Edition)</option>
        <option value="simple-collectible" disabled>Simple Collectible</option>
        <option value="basket-collectible" disabled>Basket Collectible</option>
        <option value="offer" disabled>Offer / one-sided</option>
        <option value="request" disabled>Request / one-sided</option>
        <option value="exotic" disabled>Exotic / generic bundle</option>
      </select>

      <br><br>

      <div id="simpleOrderPairRow">
        <label>Pair</label>
        <select id="createOrderPair"></select>
        <br><br>
      </div>

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
      <!-- ORDER-AUTHBADGE1: pre-submit reputation-binding hint for the selected account. -->
      <div id="createOrderAuthHint" class="create-order-auth-hint"></div>

      <br>

      <div id="simpleFtRateFields">
      <label>Volume <span id="createOrderVolumeUnit" style="font-weight:normal;font-size:11px;color:#999;margin-left:4px;"></span></label>
      <input id="createOrderVolume" type="number" step="any">
      
      
      <br><br>

      
      <label>Rate <span id="createOrderRateUnit" style="font-weight:normal;font-size:11px;color:#999;margin-left:4px;"></span></label>
      <input id="createOrderRate" type="number" step="any">
      <div class="rate-steps">
        <button type="button" id="createOrderRateDown" tabindex="-1" aria-label="Decrease rate">−</button>
        <button type="button" id="createOrderRateUp" tabindex="-1" aria-label="Increase rate">+</button>
      </div>
      
      <div id="createOrderRateHint" style="font-size:11px;color:#888;margin-top:4px;min-height:14px;"></div>

      <br>


      <label>Minimum fill / granularity <span style="font-weight:normal;font-size:11px;color:#999">(auto-calculated, or override)</span></label>
      <input id="createOrderMinFill" type="text" placeholder="auto">
      <div id="createOrderIntHint" style="font-size:11px;min-height:18px;margin-top:4px;"></div>

      <br>
      </div><!-- #simpleFtRateFields -->

      <div id="simpleCollectibleFields" style="display:none">

        <!-- Token ID + Serial/Qty on one line -->
        <div class="collectible-token-row">
          <div class="collectible-token-id">
            <label>Token ID</label>
            <input id="createCollectibleToken" type="text" placeholder="e.g. 0.0.12345">
            <div id="createCollectibleTokenHint" class="collectible-hint"></div>
          </div>
          <div id="createCollectibleSerialRow" class="collectible-serial">
            <label>Serial #</label>
            <input id="createCollectibleSerial" type="number" min="1" step="1" placeholder="e.g. 42">
          </div>
          <div id="createCollectibleQtyRow" class="collectible-serial" style="display:none">
            <label>Qty</label>
            <input id="createCollectibleQty" type="number" min="1" step="1" value="1" placeholder="qty">
          </div>
        </div>

        <!-- Price + Currency on one line -->
        <div class="collectible-price-row">
          <div class="collectible-price">
            <label>Price <span class="collectible-label-note">(total)</span></label>
            <input id="createCollectiblePrice" type="number" step="any" min="0" placeholder="e.g. 10.50">
          </div>
          <div class="collectible-currency">
            <label>Currency</label>
            <select id="createCollectibleCurrency"></select>
          </div>
        </div>

      </div><!-- #simpleCollectibleFields -->

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


<script><?php require_once('config.php');
  // KFLOW1: frontend commit stamp for flow fingerprints — resolve HEAD without
  // exec (worktree-safe: .git may be a "gitdir:" pointer file; refs live in commondir).
  $kg = dirname($_SERVER['DOCUMENT_ROOT']) . '/.git';
  if (is_file($kg) && preg_match('/^gitdir:\s*(.+)$/m', (string)@file_get_contents($kg), $km)) $kg = trim($km[1]);
  $khead = trim((string)@file_get_contents("$kg/HEAD"));
  if (preg_match('#^ref:\s*(.+)#', $khead, $km)) {
      $kcommon = trim((string)@file_get_contents("$kg/commondir"));
      $kroot = $kcommon ? ($kcommon[0] === '/' ? $kcommon : "$kg/$kcommon") : $kg;
      $khead = trim((string)@file_get_contents($kroot . '/' . trim($km[1])));
  }
  $kflowCommit = preg_match('/^[0-9a-f]{40}$/', $khead) ? substr($khead, 0, 7) : '';
?>
  window.CONFIG = {
    HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
  }
  window.KFLOW_COMMIT = "<?= htmlspecialchars($kflowCommit, ENT_QUOTES, 'UTF-8') ?>"
</script>
<!-- KFLOW1: flow-fingerprint checkpoints — loads first so every later script can call window.kflow -->
<script src="<?= kasset('kflow.js') ?>"></script>

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
<!-- MODAL-URL1: opt in to URL-hash persistence so a signing modal survives reload
     / is bookmarkable (#sign=network:txid:pch). Set before the deferred embed runs. -->
<script>window.KPAY_SIGN_HASH = true</script>
<script src="/vendor/kpay/kpool_widget/kpay-embed.js" defer></script>



<script type="module" src="<?= kasset('katomia-init.js') ?>" data-glog="on"></script>
<script src="<?= kasset('katomia-core.js') ?>"></script>
<script src="<?= kasset('katomia-localdb.js') ?>"></script>
<script src="<?= kasset('kemoji.js') ?>"></script>
<script src="<?= kasset('katomia-helpers.js') ?>"></script>
<script src="<?= kasset('katomia-enrich.js') ?>"></script>
<script src="<?= kasset('katomia-network.js') ?>"></script>
<script src="<?= kasset('katomia-modals.js') ?>"></script>
<script src="<?= kasset('katomia-render.js') ?>"></script>
<script src="<?= kasset('katomia-render-orders.js') ?>"></script>
<script src="<?= kasset('katomia-market.js') ?>"></script>
<!-- QR: davidshimjs build already bundled with kpool_widget — same file the offline
     signing widget uses. CDN removed to keep all assets in-house.
     TODO(bundling): when kpool_widget is rolled into a proper JS bundle, fold
     qrcode.min.js in and remove this script tag entirely. -->
<script src="/vendor/kpay/kpool_widget/qrcode.min.js"></script>
<script src="<?= kasset('katomia-profile.js') ?>"></script>
<script src="<?= kasset('katomia-auth.js') ?>"></script>
<script src="<?= kasset('katomia-addaccount.js') ?>"></script>

<!-- KAT-FEEDBACK1 dogfooding: long-press anywhere on the game page (2s) opens
     a "Send Feedback" modal. Signs with the intent keypair above if present. -->
<script src="/vendor/feedback-widget/feedback-widget.js?v=<?= @filemtime($_SERVER['DOCUMENT_ROOT'] . '/vendor/feedback-widget/feedback-widget.js') ?>"
        data-product="katomia"></script>

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

// GAME-JOINRULE1: a gated game rejects the WS join until a commitment exists. When
// the user raises one from the (now always-reachable) profile modal, retry the join
// so the game appears without a manual refresh. connect() re-sends game_join when
// the socket was closed; when it's already open we send the join explicitly.
window.onKatomiaBindingPublished = () => {
  try {
    if(typeof connect !== "function") return
    const rejoin = () => socket?.send(JSON.stringify({
      type: "game_join", gameId, playerToken: getOrCreatePlayerToken(), playerName: "anon"
    }))
    connect(rejoin)
  } catch(e){ console.error("[auth] rejoin after publish failed", e) }
}
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
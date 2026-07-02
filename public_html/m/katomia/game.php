<?php
// kasset(): cache-bust a same-dir asset with its file mtime, so an edited JS/CSS
// file is refetched immediately — no manual version bump, no hard refresh needed
// (important for mobile testing where hard-refresh is awkward). Falls back to the
// bare path if the file is missing. Local assets only; vendor/CDN keep their own.
function kasset($file) {
  $p = __DIR__ . '/' . $file;
  $v = is_file($p) ? filemtime($p) : false;
  return htmlspecialchars($v ? "$file?v=$v" : $file, ENT_QUOTES, 'UTF-8');
}
?>
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
	<link rel="stylesheet" href="<?= kasset('katomia.css') ?>" />
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <title>katomia</title>

  <style>
    /* KATLAB fix (game page). Root cause: .app-banner's layout box is full-width
       (width:100vw), but it overflows the body content box by 16px each side and
       overflow-x:hidden on <body> CLIPS the paint back to the content box — so the
       grey bar showed inset 16px per side. (getBoundingClientRect reports the
       unclipped layout box, which misled earlier checks; confirmed by measuring
       painted pixels.) Fix: inset the body via PADDING instead of margin, so the
       clip box == the viewport, then let the banner bleed into that padding with
       negative margins. Content stays inset via the padding; the banner reaches
       all three edges, clip-safe. Verified painted gaps 0/0/0 at 360/412/430px. */
    body { margin: 0; padding: 16px; box-sizing: border-box; }
    .app-banner { width: auto; margin: -16px -16px 12px -16px; }
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
      <!-- ORDERS-UI1: nerd toggle mirrored into the main header. .nerd-control
           class-tags every nerd affordance so they can be hidden wholesale for
           non-dev users later. Syncs with the profile-panel toggle via .nerd-toggle-input. -->
      <label class="banner-nerd nerd-control" title="Nerd mode — show developer detail">
        <input type="checkbox" class="nerd-toggle-input">
        <span>🤓</span>
      </label>
    </div>
  </div>

  <div id="gameMeta" class="game-meta"></div>
  <div id="profileModal" class="profile-modal hidden">
        
    <div class="profile-card">
      <div id="profileModalClose" class="profile-close">✕</div>

      <h2 id="profileTitle">Player</h2>

      <div id="profileAvatar" class="profile-avatar"></div>

      <!-- ═══ IDENTITY — your public/private identifiers. The order public key is NOT
           KEA-specific; it's your core profile identity, so it lives at the top. ═══ -->
      <div class="profile-section profile-identity">
        <div class="profile-list">
          <div class="profile-label">Order public key <span class="profile-tag profile-tag-public" title="Public. Your trader/intent key — every order you place is signed by it, so others can recognise your orders across games.">public</span></div>
          <div id="profilePubkey" class="profile-mono" title="Your session's Ed25519 order/intent key. Signs your orders. Reputation can be bound to it via a wallet (see Reputation binding)."></div>

          <!-- KVAC / prepaid access id — NERD ONLY, STUBBED. HKSAT = SHA256(player token):
               the PUBLIC handle for prepaid fees (KSAT/KVAC model — see kpay.uk/kvac). The
               player token (KSAT) itself stays private in the browser. Balance + top-up are
               display-only stubs for now; wiring is FEE1 / a backend HKSAT balance lookup. -->
          <div class="profile-nerd-only">
            <div class="profile-label">Access token · KVAC <span class="profile-tag profile-tag-public" title="Public hash (HKSAT = SHA256 of your player token). The handle you'd top up to prepay fees. Your player token itself stays private in this browser.">public</span></div>
            <div id="profileKvac" class="profile-mono" title="HKSAT — public hash of your player token (KSAT). Used as a prepaid balance handle (KSAT/KVAC fee model). STUB: balance + top-up not wired yet."></div>
            <div class="profile-kvac-balance subtle">
              Balance: <span id="profileKvacBalance">— (stub)</span>
              <button id="profileKvacTopupBtn" type="button" class="profile-ghost" disabled title="Prepaid top-up — not wired yet (KSAT/KVAC, FEE1)">Top up…</button>
            </div>
          </div>

          <div class="profile-label">Scope</div>
          <div id="profileScope" class="profile-scope" title="Where this order key operates: domain | network | game."></div>
        </div>
      </div>

      <!-- ═══ REPUTATION BINDING (WalletConnect) — priority section. Optional: sign with a
           wallet to bind your order key to a real account so orders can carry reputation.
           WIREFRAME — options (expiry/scope/publish) are exposed to feel the UX. ═══ -->
      <div class="profile-section profile-repute">
        <div class="profile-section-head">
          <span class="profile-section-title">Reputation binding</span>
          <span class="profile-tag profile-tag-optional" title="Optional. Bind your order key to a wallet account so your orders can carry reputation and be recognised in the marketplace. Nobody has to do this.">optional</span>
        </div>
        <p class="subtle profile-section-sub">Sign with a wallet to bind your order key to a real account. Publishing makes the binding public.</p>

        <div class="profile-auth">

          <!-- Account picker — WalletConnect-connected accounts + connect-another +
               disconnect, mirroring the tx-signer picklist (window.WC add/disconnect). -->
          <div id="authAccountRow" class="profile-auth-account">
            <span class="profile-label">Account</span>
            <select id="authAccount" class="profile-auth-select"></select>
            <button id="authAccountRemove" type="button" class="profile-auth-x hidden" title="Disconnect this wallet account">Disconnect</button>
          </div>

          <!-- Commitment options — shown once an account is chosen. -->
          <div id="authOptions" class="profile-auth-options hidden">
            <label class="profile-label">Expiry
              <select id="authExpiry">
                <option value="86400000">24 hours</option>
                <option value="604800000">7 days</option>
                <option value="2592000000">30 days</option>
                <option value="">No expiry</option>
              </select>
            </label>
            <label class="profile-label">Scope
              <select id="authScope">
                <option value="global">Global — all games</option>
                <option value="game">This game only</option>
              </select>
            </label>
            <label class="profile-auth-publish">
              <input type="checkbox" id="authPublish" checked> Publish this binding (public)
            </label>
          </div>

          <!-- Plain-English statement of what the user is committing to. -->
          <p id="authStatement" class="profile-auth-statement hidden"></p>

          <button id="authBtn" type="button">💠 Raise commitment</button>
          <div id="authStatus" class="profile-auth-status subtle"></div>
          <pre id="authOutput" class="profile-auth-output hidden"></pre>
          <button id="authCopyBtn" type="button" class="hidden">⧉ Copy envelope</button>
        </div>
      </div>

      <!-- ═══ KEA / external signer — KEA-specific (QR → link → copy). Collapsed by
           default so the WalletConnect flow gets priority. ═══ -->
      <details class="profile-section profile-kea">
        <summary class="profile-section-title">Approve orders with KEA <span class="profile-tag" title="Optional external signer. Scan with the KEA app to approve/execute your orders from another device.">app</span></summary>
        <div id="profileQr" class="profile-qr"></div>
        <p class="subtle">Scan with KEA to approve your orders</p>
        <a id="profileQrLink" class="profile-link" href="#"></a>
        <button id="profileCopyLinkBtn">Copy KEA link</button>
      </details>

      <!-- ═══ PREFERENCES & DIAGNOSTICS — dev controls. Collapsed by default. ═══ -->
      <details class="profile-section profile-debug-section">
        <summary class="profile-section-title">Preferences &amp; diagnostics</summary>
        <div class="profile-debug">
          <label class="profile-debug-label nerd-control">
            <input type="checkbox" id="katomia-nerd-toggle" class="nerd-toggle-input">
            🤓 Nerd mode
          </label>
          <label class="profile-debug-label">
            <input type="checkbox" id="kdiagRemoteToggle">
            Remote diagnostic logging
          </label>
          <button id="profileCopyDiagBtn" type="button" title="Copy local diagnostics to clipboard">⧉ Copy local diagnostics</button>
        </div>
      </details>
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
  


<div class="game-layout">

<div class="game-left">

<!-- ORDERS-UI1: orders | tx sit side-by-side on desktop (auto-fit grid), and
     wrap to a single column on narrower viewports. -->
<div class="trade-cols">

<div id="ordersSection" class="mode-order">

  <div class="orders-market-summary subtle"></div>

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
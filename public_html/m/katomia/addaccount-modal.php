<?php
// addaccount-modal.php — PROP-ADDACCT1: add-account modal — a COMPOSER for the
// existing addAccounts() label format (bracket notation "0.0.x(a,b,0.0.n-7)");
// the join path is unchanged. Flow: pick account (WC-connected / connect /
// manual) → tick assets → join. Logic in katomia-addaccount.js.
// Extracted from game.php 2026-07-14 so board.php can share it (its footer
// ➕ Add account used a bare prompt() stopgap until then — user: use the same
// WalletConnect-or-manual modal as the legacy page).
?>
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
			<!-- ADDACCT-LIST1 (user 2026-09-05): "assets to bring in" said what the
			     screen did to the machine; this says what it does to other players.
			     all/none stay here AND are mirrored on the account's own modal, so the
			     choice is never a one-shot at join time. -->
			<div class="addacct-assets-head">
				<label>What others will see in your store</label>
				<span class="addacct-selbtns"><button id="addAcctSelAll" type="button" class="addacct-link">show all</button> · <button id="addAcctSelNone" type="button" class="addacct-link">show none</button></span>
			</div>
			<div id="addAcctAssets" class="addacct-assets"></div>
			<p id="addAcctHint" class="subtle addacct-hint hidden">🔷 Not bound yet — you can join anyway; bind this account in <button id="addAcctProfileLink" type="button" class="addacct-link">Profile → Wallet binding</button> to carry reputation.</p>
		</div>

		<div id="addAcctStatus" class="subtle addacct-status"></div>

		<!-- ADDACCT-LIST1: one primary button whose LABEL carries the count, so the
		     thing you are about to publish is stated on the control that does it.
		     "Add with all assets" is no longer a peer choice — show all is one tap
		     above — and survives only as the fallback when the asset preview failed
		     to load and there is nothing to tick (shown/hidden by updateAddAcctJoinCount). -->
		<div id="addAcctActions" class="addacct-actions hidden">
			<button id="addAcctCancel" type="button" class="addacct-secondary">Cancel</button>
			<button id="addAcctJoinAll" type="button" class="hidden">Add with all assets</button>
			<button id="addAcctJoin" type="button" class="addacct-primary"><span id="addAcctJoinLabel">Add account</span><span id="addAcctJoinCount" hidden>0</span></button>
		</div>
	</div>
</div>

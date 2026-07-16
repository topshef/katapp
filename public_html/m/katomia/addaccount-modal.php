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

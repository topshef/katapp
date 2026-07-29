<?php
// authenticate-modal.php — generic lightweight AUTHENTICATE modal (ENTRY-AUTHMODAL1,
// user brainstorm 2026-07-29). A trimmed-down cousin of the profile modal's Wallet
// binding section: the SAME account picker UX (connect another / disconnect), but NO
// options — expiry/scope/publish are BINDING concerns; a plain authentication is not a
// binding, so retention is Katomia's call (30 days server-side default), not the user's.
// One statement, one button. Invocable from anywhere with a per-call message:
//   window.katomiaAuthenticateModal.open({ message, network, onDone })
// First consumer: the kfw:sent feedback hook (katomia-auth.js) — after an
// unauthenticated feedback send we OFFER authentication so the feedback can be
// attributed to an account/group (tester feedback processing needs authenticated
// senders — see ENTRY-FEEDGROUPS1). The user can just close it; feedback stays
// anonymous. Included by profile-modal.php so every page with the profile stack has
// it; all JS lives in katomia-auth.js (kam* section) — same deps, no extra script tag.
?>
<div id="kamModal" class="profile-modal hidden">
  <div class="profile-card">
    <div id="kamClose" class="profile-close">✕</div>

    <h2>🔐 Authenticate</h2>

    <p id="kamMessage" class="subtle hidden"></p>

    <div class="profile-auth">

      <!-- Network picker — only outside a game (same rule as the binding section). -->
      <div id="kamNetworkRow" class="profile-auth-account hidden">
        <span class="profile-label">Network</span>
        <select id="kamNetwork" class="profile-auth-select">
          <option value="mainnet">🟣 Mainnet</option>
          <option value="testnet">🟠 Testnet</option>
        </select>
      </div>

      <div class="profile-auth-account">
        <span class="profile-label">Account</span>
        <select id="kamAccount" class="profile-auth-select"></select>
        <button id="kamRemove" type="button" class="profile-auth-x hidden" title="Disconnect this wallet account">Disconnect</button>
      </div>

      <!-- Plain-English statement — deliberately NOT the commitment wording: you are
           confirming control of the account, not authorising the intent key to trade. -->
      <p id="kamStatement" class="profile-auth-statement hidden"></p>

      <button id="kamBtn" type="button">🔐 Authenticate</button>
      <div id="kamStatus" class="profile-auth-status subtle"></div>
    </div>
  </div>
</div>

<?php
// profile-modal.php — the profile/binding modal, shared by every page
// (PROFILE-INDEX1: the profile isn't game-scoped, so it must not require being
// inside a game). Lifted verbatim from game.php with ONE addition: the Network
// row, shown only when there's no game context to inherit a network from
// (katomia-auth.js toggles #authNetworkRow and reads it via kauthNetwork()).
// Requires: katomia-core.js, katomia-helpers.js, kemoji.js, qrcode.min.js,
// katomia-profile.js, katomia-auth.js and the WalletConnect script tag.
?>
<div id="profileModal" class="profile-modal hidden">

  <div class="profile-card">
    <div id="profileModalClose" class="profile-close">✕</div>

    <h2 id="profileTitle">Player</h2>

    <div id="profileAvatar" class="profile-avatar"></div>

    <!-- ═══ IDENTITY — your public/private identifiers. The intent public key is NOT
         KEA-specific; it's your core profile identity, so it lives at the top.
         (INTENT-RENAME1: display copy says "intent" — the key signs orders AND proposal
         commitments; wire params/JS names still say orderPubkey pending the compat pass.) ═══ -->
    <div class="profile-section profile-identity">
      <div class="profile-list">
        <div class="profile-label">Intent public key <span class="profile-tag profile-tag-public" title="Public. Your intent key — every order or proposal you place is signed by it, so others can recognise your intents across games.">public</span></div>
        <div id="profilePubkey" class="profile-mono" title="Your session's Ed25519 intent key. Signs your orders and proposal commitments. Reputation can be bound to it via a wallet (see Reputation binding)."></div>

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
        <div id="profileScope" class="profile-scope" title="Where this intent key operates: domain | network | game."></div>
      </div>
    </div>

    <!-- ═══ REPUTATION BINDING (WalletConnect) — priority section. Optional: sign with a
         wallet to bind your intent key to a real account so orders can carry reputation.
         WIREFRAME — options (expiry/scope/publish) are exposed to feel the UX. ═══ -->
    <div class="profile-section profile-repute">
      <div class="profile-section-head">
        <span class="profile-section-title">Reputation binding</span>
        <span class="profile-tag profile-tag-optional" title="Optional. Bind your intent key to a wallet account so your orders can carry reputation and be recognised in the marketplace. Nobody has to do this.">optional</span>
      </div>
      <p class="subtle profile-section-sub">Sign with a wallet to bind your intent key to a real account. Publishing makes the binding public.</p>

      <div class="profile-auth">

        <!-- Network picker — ONLY outside a game (no gameMeta to inherit from);
             inside a game the game's network wins and this row stays hidden. -->
        <div id="authNetworkRow" class="profile-auth-account hidden">
          <span class="profile-label">Network</span>
          <select id="authNetwork" class="profile-auth-select">
            <option value="mainnet">🟣 Mainnet</option>
            <option value="testnet">🟠 Testnet</option>
          </select>
        </div>

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

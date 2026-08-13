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
        <div id="profilePubkey" class="profile-mono" title="Your session's Ed25519 intent key. Signs your orders and proposal commitments — it says WHAT you want. A wallet can stand behind it (see Wallet binding below)."></div>
        <!-- One-line visible explainer (user 2026-07-07) — the tooltips carry the depth,
             this anchors the storyline language: intent key = WHAT you want.
             KEY ROTATION — deliberately NOT a feature (user talked themselves out,
             2026-07-07): the key lives in this browser's localStorage
             (katomiaPlayerKeypair, see katomia-core.js getOrCreatePlayerKeypair);
             clearing site data rotates it naturally — a fresh key is minted on next
             load. Anonymous identity churn is self-serve; bound users wouldn't want it. -->
        <p class="subtle profile-section-sub">This browser's signing identity: every order or proposal you place is signed with it, so others can recognise your intents. It says <em>what</em> you want — the wallet binding below says <em>who</em> you are.</p>

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

    <!-- ═══ WALLET BINDING (WalletConnect) — priority section. Optional: sign with a
         wallet to bind your intent key to a real account. AUTH-LANG1: this is the
         IDENTITY act ("who stands behind this key") — one signed commitment, two
         consumers: reputation on your orders AND members-only market access
         (GAME-JOINRULE1). "Reputation binding" was under-scoped once gating went live.
         WIREFRAME — options (expiry/scope/publish) are exposed to feel the UX. ═══ -->
    <!-- PROFILE-TIDY1: now a collapsible <details> like KEA/Preferences (open by
         default — it stays the priority section) so the modal's organisation can be
         played with. Kept the name "Wallet binding": the binding IS the authorisation
         (one signed commitment covers both), and AUTH-LANG1 pinned this word. -->
    <details class="profile-section profile-repute" id="profileBindSection" open>
      <summary class="profile-section-title" title="One signed commitment, two uses: your orders can carry reputation, and members-only markets unlock for your accounts. Your intent key says WHAT you want; a binding says WHO you are.">🔗 Wallet binding <span class="profile-tag profile-tag-optional" title="Optional. Bind your intent key to a wallet account so your orders carry reputation and members-only markets open up. Nobody has to do this.">optional</span></summary>
      <p class="subtle profile-section-sub">Prove who you are: sign once with a wallet to put a real account behind your intent key — your orders can carry reputation, and members-only markets unlock. Publishing makes the binding public.</p>

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

        <!-- Account picker — KAT-ACCTNORM1 (user 2026-08-05): ONE list, everywhere.
             Union of WC-connected accounts and this game's manually-added ones (tagged
             ⌨️); WC is the untagged default. One button, "Remove", for both kinds —
             "disconnect" is retired as user-facing language, since a connection never
             proved ownership anyway (ids can be spoofed; only the signed commitment
             below proves control). Removing a WC account disconnects the wallet
             session AND takes it off the board. List logic: kauthRenderAccounts. -->
        <div id="authAccountRow" class="profile-auth-account">
          <span class="profile-label">Account</span>
          <select id="authAccount" class="profile-auth-select"></select>
          <button id="authAccountRemove" type="button" class="profile-auth-x hidden" title="Remove this account — disconnects the wallet session (if connected) and removes it from the game">Remove</button>
        </div>

        <!-- NO "Repair connection" BUTTON HERE — REMOVED 2026-08-08, and this comment
             exists so nobody re-adds it. TXSTATUS-CONSOLIDATE1 S8 shipped one (D1:
             "manual button first"); the user reversed that decision on sight of it,
             and was right on three counts:
               1. It was ALWAYS visible, with no idea whether anything was wrong —
                  a mainnet transaction succeeded on pat and the menu still offered
                  to "repair". A control that is permanently lit says nothing.
               2. It asks the USER to fix OUR bug, by destroying their session and
                  re-adding every account. Remove already exists for the thing a
                  user legitimately wants to do.
               3. It called WC.resetWalletLink(), which we have since PROVEN can
                  wedge WC init permanently with no error (WC-RESETWEDGE1) — so the
                  repair could leave someone worse off than the fault it treats.
             The recovery recipe itself is real and stays documented in
             WC-RESETWEDGE1; the right home for it is an automatic self-heal behind
             a proven-safe reset, not a button. -->


        <!-- Commitment options — shown once an account is chosen. Flat grid items (not
             wrapping <label>s) so Expiry sits in the same 64px label column as
             Network/Account, with Scope beside it getting the wider share. -->
        <div id="authOptions" class="profile-auth-options hidden">
          <span class="profile-label">Expiry</span>
          <select id="authExpiry">
            <option value="86400000">24 hours</option>
            <option value="604800000">7 days</option>
            <option value="2592000000">30 days</option>
            <option value="">No expiry</option>
          </select>
          <span class="profile-label">Scope</span>
          <select id="authScope">
            <option value="global">Global — all games</option>
            <option value="game">This game only</option>
          </select>
          <label class="profile-auth-publish">
            <input type="checkbox" id="authPublish" checked> Publish this binding (public)
          </label>
        </div>

        <!-- Plain-English statement of what the user is committing to. -->
        <p id="authStatement" class="profile-auth-statement hidden"></p>

        <button id="authBtn" type="button">🔷 Raise commitment</button>
        <div id="authStatus" class="profile-auth-status subtle"></div>
        <!-- PROFILE-TIDY1: the signed envelope + copy button are tech detail — nerd-only,
             and collapsed even then. Normal mode just gets the status line above. -->
        <details id="authResultDetails" class="profile-nerd-only profile-auth-result hidden">
          <summary>Signed envelope (technical detail)</summary>
          <pre id="authOutput" class="profile-auth-output"></pre>
          <button id="authCopyBtn" type="button">⧉ Copy envelope</button>
        </details>
      </div>
    </details>

    <!-- ═══ EXECUTION AGENT — KEA (QR → link → copy). Collapsed by default so the
         wallet-binding flow gets priority. AUTH-LANG1: this is the DELEGATION act —
         approval happens BEFORE the transaction (a standing policy), not after (a
         signing prompt) — which is why KEA never appears on the signing modal.
         data-feature="kea": hidden wholesale when KATOMIA_FEATURES.kea is off — the
         first release ships without KEA visible; later this whole section should be
         excludable from the bundle (BUNDLE1). ═══ -->
    <!-- KBUNDLE-STRIP:kea (BUNDLE1, user 2026-08-13: KEA is out for alpha — flag off in
         header.php today; the bundle build strips everything between these markers) -->
    <details class="profile-section profile-kea hide-in-proposal" id="profileKeaSection" data-feature="kea">
      <summary class="profile-section-title" title="KEA flips approval around: instead of approving each transaction after it appears (WalletConnect / WhatsApp / offline signing), you approve a policy up front. KEA watches for transactions that match orders your intent key has already signed, verifies them, and signs automatically — so it never needs to prompt you. Fastest way to settle; still self-custody.">🤖 Execution agent — KEA <span class="profile-tag" title="Pre-approve, then let KEA settle automatically. The opposite of a signing prompt: you authorise the policy before the transaction exists.">auto</span></summary>
      <p class="subtle">Pair the KEA app to watch and auto-settle orders your intent key has already signed — approve the policy once, no per-transaction prompts.</p>
      <div id="profileQr" class="profile-qr"></div>
      <p class="subtle">Scan with KEA to start watching this intent key</p>
      <a id="profileQrLink" class="profile-link" href="#"></a>
      <button id="profileCopyLinkBtn">Copy KEA link</button>
    </details>
    <!-- /KBUNDLE-STRIP:kea -->

    <!-- Board preferences lived here briefly (BOARD-HEADERINT1) — moved same
         day to header.php's #boardSettingsPanel popover (user: too tucked
         away in the modal, and the modal covered the board it was adjusting). -->

    <!-- ═══ PREFERENCES & DIAGNOSTICS — dev controls. Collapsed by default. ═══ -->
    <details class="profile-section profile-debug-section">
      <summary class="profile-section-title">Preferences &amp; diagnostics</summary>
      <div class="profile-debug">
        <!-- BOARD-UISIZE1, relocated 2026-08-06 (user): display size is a
             DEVICE preference, not a per-game board setting — it belongs with
             the other app-wide preferences, not in the board's ⚙ popover.
             Same id/storage as before the move (localStorage katomiaUiSize →
             html.ksize-* → CSS --ui-scale); the nerd 🧪 Chip size knob stays on
             the board panel as a dev multiplier on top of this. -->
        <label class="profile-debug-label">
          Size
          <select id="boardPrefUiSize" title="Overall display size — chips, messages and labels together. Normal is tuned to be readable on a phone; Large helps if you'd rather not squint.">
            <option value="small">Small</option>
            <option value="normal">Normal</option>
            <option value="large">Large</option>
          </select>
        </label>
        <!-- ENTRY-AUTOADD1 (user-approved 2026-08-05): normal-mode preference, ON by
             default — connected accounts join a game automatically with all assets.
             Unticked, the ➕ Add account composer stays the only path (connected
             accounts are already listed there as one-tap candidates). -->
        <label class="profile-debug-label">
          <input type="checkbox" id="kprefAutoAdd">
          Automatically add my connected accounts when I join a game
        </label>
        <!-- ORDER-AUTOSIGN1 (user 2026-08-05): matched orders push the signature
             request straight to the wallet (no pop-up here; the wallet prompts, or
             auto-approves if the user enabled that wallet-side). Default ON. -->
        <label class="profile-debug-label">
          <input type="checkbox" id="kprefAutoSignReq">
          Auto-request signatures for matched orders
        </label>
        <label class="profile-debug-label nerd-control">
          <input type="checkbox" id="katomia-nerd-toggle" class="nerd-toggle-input">
          🤓 Nerd mode
        </label>
        <label class="profile-debug-label">
          <input type="checkbox" id="kdiagRemoteToggle">
          Remote diagnostic logging
        </label>
        <button id="profileCopyDiagBtn" type="button" title="Copy local diagnostics to clipboard">⧉ Copy local diagnostics</button>
        <!-- KAT-BUILDSTAMP1 (user 2026-08-06): "when I'm inspecting the app through profile
             or nerd settings, I can see exactly what build we're on". Deploys are a
             blue/green symlink flip, so "did my change actually land, and is this slot the
             one I just pushed?" was previously only answerable by curling build-info.json
             from a terminal. Reads the same file the deploy writes, so it cannot drift from
             what was shipped. Unbundled (swap/labs) has no build-info.json — say so plainly
             rather than showing a blank or a stale value. -->
        <div class="profile-debug-label profile-build-stamp" id="profileBuildStamp"
             title="Which bundle this browser is actually running">build …</div>
      </div>
    </details>
  </div>

</div>
<?php
// ENTRY-AUTHMODAL1: the generic authenticate modal rides along with the profile
// stack — every page that has this modal has the scripts the other one needs too.
require __DIR__ . '/authenticate-modal.php';
?>

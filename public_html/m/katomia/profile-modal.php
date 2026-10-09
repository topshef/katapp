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
    <!-- KATUI3 feedback pass (user 2026-08-17): the ✕ rides a sticky zero-height row so
         it stays reachable however far the card scrolls; #profileBusy sits beside it —
         katomia-auth.js lights it while wallet/network operations are in flight, so a
         slow connection reads as "working", not "crashed". -->
    <div class="profile-stickyrow">
      <div id="profileBusy" class="profile-busy hidden" role="status"></div>
      <div id="profileModalClose" class="profile-close" title="Close">✕</div>
    </div>

    <!-- Title is the player's NAME if one is assigned, otherwise blank (user
         2026-08-17: the old "🔗 Player" header is gone — the 🔗 belonged to the
         binding section specifically, not to the modal). -->
    <h2 id="profileTitle"></h2>

    <div id="profileAvatar" class="profile-avatar"></div>

    <!-- ═══ WALLET CONNECTION — WALLET-CONNECT-IA1 Mock A (user-approved 2026-08-17).
         The three wallet acts as a LADDER, always offering the next rung:
           Connect (rows below) → Authenticate (headline button) → Commitment (fold).
         Supersedes the "🔗 Wallet binding" framing: the advanced act no longer wears
         the section title, and 🔗 survives only on the commitment fold (the binding).
         The intent-key identity block moved from the top of the modal into that fold
         (that's where the key↔account binding actually happens); nerd mode keeps the
         full identity readout in its own section further down. -->
    <div class="profile-section profile-repute" id="profileBindSection">
      <div class="profile-section-title">Wallet connection</div>
      <p class="subtle profile-section-sub">Connect a wallet, then authenticate — one signature that proves the account is yours and unlocks members-only <?= htmlspecialchars(katomiaTerms()['many'], ENT_QUOTES, 'UTF-8') ?>.</p>

      <div class="profile-auth">

        <!-- Network picker — ONLY outside a game (no gameMeta to inherit from);
             inside a game the game's network wins and this row stays hidden. -->
        <!-- MENU-NET1 (owner 2026-10-09): the picker stays (katomia-auth.js reads it) but is
             never shown — it FOLLOWS the network chosen from ☰ on Home, and this note says
             which and where. Hidden inside a circle, where the circle's network wins. -->
        <div id="authNetworkRow" class="profile-auth-account hidden">
          <span class="profile-label">Network</span>
          <select id="authNetwork" class="profile-auth-select">
            <option value="mainnet">🟣 Mainnet</option>
            <option value="testnet">🟠 Testnet</option>
          </select>
        </div>
        <div id="authNetworkNote" class="profile-auth-account hidden">
          <span class="profile-label">Network</span>
          <span class="profile-netnote"><b data-network-note="authNetwork"></b> <span class="subtle">· change it from ☰ on Home or Circles</span></span>
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


        <!-- ── Ladder status + the next rung's one button (Mock A) ──
             kauthRenderLadder (katomia-auth.js) drives all three: the status line
             (nothing / ◆ authenticated / ◈ commitment live — markers from
             KAUTH_MARKS), the Authenticate button's visibility, and the ⌨️/playnet
             explainer for accounts that can't sign here. Expiry of a plain
             authentication is deliberately NOT surfaced (user 2026-08-17, Q8.3 —
             Katomia's retention call, changeable backend-side without UI noise). -->
        <div id="authRungStatus" class="profile-auth-status"></div>
        <button id="authAuthenticateBtn" type="button" class="hidden">◆ Authenticate</button>
        <div id="authStatus" class="profile-auth-status subtle"></div>

        <!-- ── Commitment — the optional upgrade rung (Mock A fold) ──
             LAUNCH-PRUNE CANDIDATE (user 2026-08-17): "we might prune it" — the
             user-facing commitment extras (chosen expiry/scope/publish, reputation
             framing) lean mostly on ORDER MODE (ORDER-AUTHBADGE*) and the auto-settle
             agent flow (see the tagged section below — T:KSTRIP-01 keeps its name out
             of untagged prose like this);
             proposal mode consumes the intent-key BINDING, which a plain
             authentication also creates (same challenge shape, same store). If order
             mode stays hidden at launch, this fold can be feature-flagged off without
             breaking proposal-mode gating or signed locks. Kept in for now — the
             Mock A structure is worth having settled either way. -->
        <details class="profile-commit" id="profileCommitSection">
          <!-- MENU-YOU1 (owner 2026-10-09): "Raise a commitment" is now REPUTATION, its button just
               "Commit" — "people don't want wordy long shit anymore". One short line says what it
               does; the ⓘ unrolls the longer explanation (a tap, so it works on a phone, where a
               title tooltip never shows). The signed statement below stays in full: that is the
               part that matters. -->
          <summary class="profile-section-title" title="Bind your activity to your reputation: put this account behind your intent key for a period you choose.">🔗 Reputation <span class="profile-tag profile-tag-optional" title="Optional. Adds reputation to your intents — authenticating alone already unlocks members-only access.">optional</span></summary>
          <p class="subtle profile-section-sub">Commit to bind your activity here to this account's reputation.
            <button type="button" class="profile-info" aria-expanded="false" aria-controls="authCommitMore" title="What does committing do?"
                    onclick="var m=document.getElementById('authCommitMore');m.hidden=!m.hidden;this.setAttribute('aria-expanded',String(!m.hidden))">ⓘ</button></p>
          <p class="subtle profile-section-sub" id="authCommitMore" hidden>Committing goes further than authenticating: you put this account behind your <b>intent key</b> — the key this browser signs your proposals with — for a period you choose. Publishing lets others see who stands behind your intents.</p>

          <!-- Commitment options — shown once a signable account is chosen. Flat grid
               items (not wrapping <label>s) so Expiry sits in the same 64px label
               column as Network/Account, with Scope beside it getting the wider share. -->
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

          <button id="authBtn" type="button">◈ Commit</button>
          <!-- PROFILE-TIDY1: the signed envelope + copy button are tech detail — nerd-only,
               and collapsed even then. Normal mode just gets the status line above. -->
          <details id="authResultDetails" class="profile-nerd-only profile-auth-result hidden">
            <summary>Signed envelope (technical detail)</summary>
            <pre id="authOutput" class="profile-auth-output"></pre>
            <button id="authCopyBtn" type="button">⧉ Copy envelope</button>
          </details>

          <!-- Intent key, compact — INSIDE the fold (Mock A): this is the key the
               statement above quotes, i.e. exactly where the key↔account binding is
               made. The order-mode-flavoured "every order…" copy is retired from
               normal mode; nerd mode's identity section below keeps the full story. -->
          <div class="profile-commit-key">
            <div class="profile-label">Intent key <span class="profile-tag profile-tag-public" title="Public. This browser's signing identity — the commitment binds your account to it.">public</span></div>
            <div id="profileCommitPubkey" class="profile-mono" title="Your session's Ed25519 intent key. It says WHAT you want — the commitment says WHO you are."></div>
            <p class="subtle profile-section-sub">This browser's signing identity — it says <em>what</em> you want; the commitment says <em>who</em> you are.</p>
            <!-- MENU-YOU1: the key's scope, moved here from the old nerd identity section — it
                 describes this key, so it sits with it -->
            <div class="profile-nerd-only">
              <div class="profile-label">Scope</div>
              <div id="profileScope" class="profile-scope" title="Where this intent key operates: domain | network | game."></div>
            </div>
          </div>
        </details>
      </div>
    </div>

    <!-- ═══ FEES AND REWARDS — nerd-only (MENU-YOU1, owner 2026-10-09). This was the IDENTITY
         readout (nerd-only since WALLET-CONNECT-IA1): intent public key, KVAC, scope. The key
         showed TWICE in nerd mode — here and in the Reputation fold — "that's fucking
         confusing", so it lives only in the fold now, with its scope beside it. What is left is
         the prepaid-access handle, which is about paying fees and earning rewards, not identity:
         hence the name. (INTENT-RENAME1 and the no-key-rotation ruling of 2026-07-07 are
         unchanged: the key lives in localStorage katomiaPlayerKeypair.) ═══ -->
    <details class="profile-section profile-fees profile-nerd-only">
      <summary class="profile-section-title">Fees and rewards</summary>
      <div class="profile-list">
        <!-- KVAC / prepaid access id — NERD ONLY, STUBBED. HKSAT = SHA256(player token):
             the PUBLIC handle for prepaid fees (KSAT/KVAC model — see kpay.uk/kvac). The
             player token (KSAT) itself stays private in the browser. Balance + top-up are
             display-only stubs for now; wiring is FEE1 / a backend HKSAT balance lookup. -->
        <div class="profile-label">Access token · KVAC <span class="profile-tag profile-tag-public" title="Public hash (HKSAT = SHA256 of your player token). The handle you'd top up to prepay fees. Your player token itself stays private in this browser.">public</span></div>
        <div id="profileKvac" class="profile-mono" title="HKSAT — public hash of your player token (KSAT). Used as a prepaid balance handle (KSAT/KVAC fee model). STUB: balance + top-up not wired yet."></div>
        <div class="profile-kvac-balance subtle">
          Balance: <span id="profileKvacBalance">— (stub)</span>
          <button id="profileKvacTopupBtn" type="button" class="profile-ghost" disabled title="Prepaid top-up — not wired yet (KSAT/KVAC, FEE1)">Top up…</button>
        </div>
      </div>
    </details>

    <!-- KBUNDLE-STRIP:kea -->
    <!-- ═══ EXECUTION AGENT — KEA (QR → link → copy). Collapsed by default so the
         wallet-binding flow gets priority. AUTH-LANG1: this is the DELEGATION act —
         approval happens BEFORE the transaction (a standing policy), not after (a
         signing prompt) — which is why KEA never appears on the signing modal.
         data-feature="kea": hidden wholesale when KATOMIA_FEATURES.kea is off — the
         first release ships without KEA visible; later this whole section should be
         excludable from the bundle (BUNDLE1). ═══ -->
    <!-- (BUNDLE1, user 2026-08-13: KEA is out for alpha — flag off in header.php
         today; the bundle build strips everything between the markers above/below) -->
    <!-- BUNDLE-STRIP1: PHP admin gate on top of the flag — non-admin visitors get
         nothing in the DOM at all on the dev estate; admins (VPN) see it badged. -->
    <?php if (!empty($katomiaIsAdmin)): ?>
    <details class="profile-section profile-kea hide-in-proposal" id="profileKeaSection" data-feature="kea">
      <summary class="profile-section-title" title="KEA flips approval around: instead of approving each transaction after it appears (WalletConnect / WhatsApp / offline signing), you approve a policy up front. KEA watches for transactions that match orders your intent key has already signed, verifies them, and signs automatically — so it never needs to prompt you. Fastest way to settle; still self-custody.">🤖 Execution agent — KEA <span class="profile-tag" title="Pre-approve, then let KEA settle automatically. The opposite of a signing prompt: you authorise the policy before the transaction exists.">auto</span></summary>
      <p class="subtle">Pair the KEA app to watch and auto-settle orders your intent key has already signed — approve the policy once, no per-transaction prompts.</p>
      <div id="profileQr" class="profile-qr"></div>
      <p class="subtle">Scan with KEA to start watching this intent key</p>
      <a id="profileQrLink" class="profile-link" href="#"></a>
      <button id="profileCopyLinkBtn">Copy KEA link</button>
    </details>
    <?php endif; ?>
    <!-- /KBUNDLE-STRIP:kea -->

    <!-- Board preferences lived here briefly (BOARD-HEADERINT1) — moved same
         day to header.php's #boardSettingsPanel popover (user: too tucked
         away in the modal, and the modal covered the board it was adjusting). -->

    <!-- ═══ PREFERENCES — MENU-YOU1 (owner 2026-10-09): split from the old "Preferences &
         diagnostics". Only switches that change what HAPPENS for you live here; how the board
         LOOKS is the board's ☰ → 👁 View. Collapsed by default. ═══ -->
    <details class="profile-section profile-debug-section profile-prefs">
      <summary class="profile-section-title">Preferences</summary>
      <div class="profile-debug">
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
        <!-- BAR-ACTONLY1 (owner 2026-10-09): the board's bar lists only the accounts that need
             to lock or sign, and hides the button when there is nothing to do. Default ON;
             unticked = the old bar (every account, the button always there), kept for A/B. -->
        <label class="profile-debug-label">
          <input type="checkbox" id="kprefBarActOnly">
          Board bar: only show accounts that need to lock or sign
        </label>
        <!-- MENU-VIEW1 (owner 2026-10-09): the three board switches that change what HAPPENS,
             not how it looks, moved here from the old ⚙ Settings popover — everything left on
             the board's ☰ is now 👁 View. Same ids, so katomia-board.js boardSyncPrefsUI()
             wires them on a board; katomia-profile.js wires them off one.
             Pickable is the exception to "preferences are yours everywhere": it is a server
             setting for YOUR SEAT IN ONE CIRCLE (game_setPref allowPick, the only per-player
             key the backend has — PLAYER_PREF_KEYS). So it says so, and off a circle it is
             shown but disabled. (Owner: it may become per account later; not used much yet.) -->
        <label class="profile-debug-label" id="kprefPickableRow">
          <input type="checkbox" id="boardPrefPickable" title="Allow other players to pick assets straight from your store (they shop, you agreed in advance). Applies to the circle you are in.">
          <span>Pickable <span class="profile-pref-scope" id="kprefPickableScope">— this circle only</span></span>
        </label>
        <!-- SIGN-EXTGATE1 (user 2026-09-04): the external signing page (/m/sign — every wallet
             option incl. KSIG offline multi-sig, and the index for coming back to a future-dated
             tx) stays a LAB feature: alpha testers sign with WalletConnect from the board. Off by
             default; on = the countdown hub and the per-tx dots open /m/sign in a new tab. -->
        <label class="profile-debug-label profile-nerd-only">
          <input type="checkbox" id="boardPrefExtSign" title="Lab: the countdown and the per-transaction dots open the full signing page (/m/sign) in a new tab — WalletConnect, WhatsApp (parked) and KSIG offline signing for multi-sig and future-dated deals. Off (default) = sign from the board with WalletConnect only.">
          🧪 Advanced signing page (multi-sig)
        </label>
        <!-- PROP-TICKETS1 phase-5a (user 2026-08-20): lab switch for priced tickets in
             proposal circles — same effect as the ?tickets=1 dev flag, default off. -->
        <label class="profile-debug-label profile-nerd-only">
          <input type="checkbox" id="boardPrefTickets" title="Lab: allow priced tickets in proposal circles — price an asset from its card, anyone can take the ticket. Same as the ?tickets=1 URL flag; default off.">
          🎟 Allow tickets (proposal circles)
        </label>
      </div>
    </details>

    <!-- ═══ TECH — MENU-YOU1: the other half of the old "Preferences & diagnostics" — nerd mode,
         remote logging, the local diagnostics copy and the build stamp. Not nerd-gated: the
         nerd-mode switch itself lives here. ═══ -->
    <details class="profile-section profile-debug-section profile-tech">
      <summary class="profile-section-title">Tech</summary>
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

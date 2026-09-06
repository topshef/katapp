// kchanges-log.js — KCHANGES1: the log of shipped changes that kchanges.js shows on
// the page. One entry per change, written by whoever ships it, newest last.
//
//   ref       letter+2 digits. The letter is the batch (A = the round shipped the night
//             of 2026-09-05, B = 2026-09-06 …), the digits the item within it.
//   at        ISO date the change went live — drives the fade (7d to 35%, gone at 14d)
//   title     one line, what changed, as the operator would say it
//   detail    a few lines: what was wrong, what it does now, anything to test
//   from      the feedback tag it came from (the NATO slug), for the popover
//   feedback  the feedback record id, for the permalink
//   where     [{page: regex on location.pathname, sel: CSS selector}] — the first
//             selector that matches a visible element gets the tag; none → the tray
//
// Selectors point at the thing that CHANGED, not the page. Inside the signing modal
// they only resolve once the modal is open, which is exactly when the tag is wanted;
// until then the entry sits in the tray. `page` is a plain substring-style regex on
// the path — "board" matches the live /m/katomia/board/<id> and a bare board.html alike.
window.KCHANGES_LOG = [

  // ── batch A: the signing-modal round, night of 2026-09-05 ──────────────────
  { ref: "A01", at: "2026-09-05T23:00:00Z",
    title: "Signing window: the real number, not \"2m\"",
    detail: "The header said \"valid 2m\" for a 40-second transaction and the countdown ran on 180s. It now shows the window written in the transaction's own bytes (\"valid 40s\", never rounded up to a minute) and the status is judged against it.",
    from: "your retest", feedback: null,
    where: [{ page: "m/sign|board|game", sel: ".txread-scope-due" }] },
  { ref: "A02", at: "2026-09-05T23:00:00Z",
    title: "Signing modal opens inside the game",
    detail: "Tap the middle of the board during signing and the all-wallets modal opens over the board instead of a new tab to /m/sign. Add ?sign=external to the board URL for the old hop.",
    from: "e7d5ccc3", feedback: "e7d5ccc3-8daa-421e-9788-81b4032d8674",
    where: [{ page: "board", sel: ".ring-hub" }] },
  { ref: "A03", at: "2026-09-05T23:00:00Z",
    title: "Choosing a wallet scrolls it into view",
    detail: "Pick Offline and the QR is revealed; pick WalletConnect and the buttons are. The row of options stays on screen so you can see what you chose.",
    from: "4bc3e7fe", feedback: "4bc3e7fe-bb55-4362-8125-72bc2c93123e",
    where: [{ page: "m/sign|board|game", sel: ".kpsign-tabs" }] },
  { ref: "A04", at: "2026-09-05T23:00:00Z",
    title: "Expanding a card scrolls it into view",
    detail: "A card near the bottom used to open off-screen. It now scrolls up just enough, never pushing the header you tapped off the top.",
    from: "7aed40c0", feedback: "7aed40c0-de2d-457d-8a9d-4a574f358886",
    where: [{ page: "m/sign|board|game", sel: ".txcard-head--toggle" }] },
  { ref: "A05", at: "2026-09-05T23:00:00Z",
    title: "A settled transaction says when, not when it was due",
    detail: "\"settled 5 Sept 2026, 23:29:00\" (the consensus time) replaces \"due … · valid …\" once the network has agreed it. Unsettled ones still show their deadline.",
    from: "f5ce7942", feedback: "f5ce7942-8415-42df-b9b3-98ea12709f09",
    where: [{ page: "m/sign|board|game", sel: ".txread-scope-due" }] },
  { ref: "A06", at: "2026-09-05T23:00:00Z",
    title: "The AFTER animation draws in one colour",
    detail: "Trail lines were a different hue per asset (red, green and orange among them — all of which mean something else here). One muted blue now; the amber puff joins it.",
    from: "c5786027", feedback: "c5786027-5ca3-43d4-b737-43ae2435500e",
    where: [{ page: "m/sign|board|game", sel: ".txpreview-after" }] },
  { ref: "A07", at: "2026-09-05T23:00:00Z",
    title: "BEFORE/AFTER highlight no longer clips at the corners",
    detail: "The halves were square boxes inside a rounded, clipped parent. Each now carries the matching outer radius so the highlight ring follows the card's shape.",
    from: "9b704fde", feedback: "9b704fde-685f-4adb-8519-f7a577dd3ac1",
    where: [{ page: "m/sign|board|game", sel: ".txpreview-before" }] },
  { ref: "A08", at: "2026-09-05T23:00:00Z",
    title: "Tap-to-enlarge gone from the QR",
    detail: "You were right about the maths — the overlay sized to 70% of the shorter edge, smaller than the inline QR on a phone. The QR is what it is; nothing happens when you tap it.",
    from: "e61ecc7b", feedback: "e61ecc7b-b9d8-4c7c-be3b-a856730035cd",
    where: [{ page: "m/sign|board|game", sel: ".kpsign-qr-cap" }] },
  { ref: "A09", at: "2026-09-05T23:00:00Z",
    title: "Card headers highlight on hover; silvery ground behind the cards",
    detail: "A light wash on the whole header row says it's the tap target. The modal card is a shallow grey gradient so the white account cards sit ON something.",
    from: "705f3951", feedback: "705f3951-cf4b-49b2-b906-cfd9090fd90a",
    where: [{ page: "m/sign|board|game", sel: ".kpm-card" }] },
  { ref: "A10", at: "2026-09-05T23:00:00Z",
    title: "Top info line centres when it wraps",
    detail: "The wrapped lines of the network/txid/pch row used to jump left. Every line centres now.",
    from: "13830975", feedback: "13830975-26d2-4dfe-9128-3938bb0a0f1e",
    where: [{ page: "m/sign|board|game", sel: ".txread-scope-ids" }] },

  // ── batch B: 2026-09-06 ────────────────────────────────────────────────────
  { ref: "B01", at: "2026-09-06T10:00:00Z",
    title: "This: changes shown on the page, toggled from ☰",
    detail: "Your tango-delta-81 idea. A 🗒️ tag beside each recent change (fades over a week, gone at two); tap for what changed and why; 👍 👎 💬 to feed back on that exact change; ✕ ticks it off in this browser. ☰ → Show changes turns it on and off; it's offered when you're authenticated as an admin account.",
    from: "tango-delta-81", feedback: "af97b243-0310-49ad-9bb0-3a0eaf5aa20f",
    where: [{ page: ".", sel: "[data-menu-kchanges]" }] },
  { ref: "B02", at: "2026-09-06T10:00:00Z",
    title: "Add account: \"show all · none\", label wraps cleanly, and you're told you can change it later",
    detail: "Matches the account's own modal. The head label breaks after \"see\" so \"store\" isn't orphaned; a line under the list says what's visible can be changed any time by tapping your account on the board.",
    from: "india-oscar-57 · charlie-lima-48", feedback: "570fbf32-022e-4875-8bbf-4c71196a1ea8",
    where: [{ page: "board", sel: ".addacct-later" }, { page: "board", sel: "#addAcctSelNone" }] },
  { ref: "B03", at: "2026-09-06T10:00:00Z",
    title: "Add account is the emphasised button",
    detail: "Solid blue with white text — the expected next step in a flow you have to complete. The class (k-primary-action) is generic so the same rule can mark the next step in any flow; this is its first use, the start of the house style you asked for.",
    from: "foxtrot-kilo-76", feedback: "820533c1-788f-4d8c-9da9-dd0f99b19ff8",
    where: [{ page: "board", sel: "#addAcctJoin" }] },
  { ref: "B04", at: "2026-09-06T10:00:00Z",
    title: "Account modal: Done at the bottom, Remove demoted to a link",
    detail: "The modal is mostly about changing what's visible now, so the big red Remove made no sense as its one button. Done just closes (every toggle saved as you made it); Remove is a quiet link under it with the same confirmation, which now carries the consequences the old explainer paragraph did.",
    from: "echo-foxtrot-11", feedback: "37c904c0-6505-4aba-b083-923a2155697a",
    where: [{ page: "board", sel: ".board-playercard-done" }] },
  { ref: "B05", at: "2026-09-06T10:00:00Z",
    title: "Lab: taller chips — symbol over a muted amount",
    detail: "⚙ Settings (nerd mode) → Chip shape → \"Symbol over amount\". Or ?chipshape=tall on the board URL for one look. Not the default; the amount is smaller and fainter because the asset, not the balance, is the point of a chip.",
    from: "victor-november-92 · foxtrot-delta-81", feedback: "f213e4a2-1c53-4d79-8c52-2fdd1dc2f1a4",
    where: [{ page: "board", sel: "#boardPrefChipShape" }, { page: "board", sel: ".board-chip" }] },
  { ref: "B06", at: "2026-09-06T10:00:00Z",
    title: "Signing modal: network on its own line, id + pch together, no underline, ↗ only once settled",
    detail: "The transaction id is plain muted text now. A small ↗ beside it opens HashScan — and only appears once the mirror has a record, because before consensus there is nothing there to look at.",
    from: "tango-victor-15", feedback: "ccc2fbd7-fca5-460d-b64f-5beca7e04802",
    where: [{ page: "m/sign|board|game", sel: ".txread-scope-ids" }] },
  { ref: "B07", at: "2026-09-06T10:00:00Z",
    title: "BEFORE/AFTER: a very subtle diagonal hatch",
    detail: "Pink stripes at 45° down, green at 45° up, so the pairing reads in greyscale too. Faint by design. Tune from the URL: ?hatchw=9 (pitch px) ?hatcha=0.06 (alpha) ?hatchdeg=45 (angle), ?hatch=0 off. All URL knobs are listed at /m/katomia/qa/url-params.html.",
    from: "mike-foxtrot-94", feedback: "fd9f36b5-a0c2-48df-a153-ced4ae5aef76",
    where: [{ page: "m/sign|board|game", sel: ".txcards-preview" }] },
  { ref: "B08", at: "2026-09-06T10:00:00Z",
    title: "Feedback toast: your own site's link, wider, dismissable, calmer",
    detail: "\"View\" no longer opens the backend host — it's the same record on this site's origin. The toast is wider on a phone, has a ✕, and is a dark slate instead of black.",
    from: "lima-foxtrot-83", feedback: "b2a7df20-35ac-44f0-80a8-28c528946b92",
    where: [{ page: ".", sel: ".kfw-toast" }] },
  { ref: "B09", at: "2026-09-06T10:00:00Z",
    title: "Written up: every hidden URL switch",
    detail: "/m/katomia/qa/url-params.html — the design and debug parameters nothing in the UI discovers (?chipshape, ?sign=external, ?hatch…, ?signtabs, ?skin, ?tickets, ?kdiag, ?kchanges …). Linked from ☰ → 🧪 QA.",
    from: "mike-foxtrot-94", feedback: "fd9f36b5-a0c2-48df-a153-ced4ae5aef76",
    where: [{ page: "qa", sel: "a[href*='url-params']" }] },
  { ref: "B10", at: "2026-09-06T10:00:00Z",
    title: "Design note: names, identity, and the number on the felt",
    detail: "/m/katomia/qa/design-identity-felt-chips.html — what naming exists today (nothing user-facing yet), what Hedera offers for identity (xproof, DIDs, HCS profiles, token metadata), mock-ups of the account number set into the felt, and chip styles worth trying. No behaviour changed; the P-number stays until you choose.",
    from: "hotel-oscar-25 · quebec-whiskey-46", feedback: "9748b79a-6098-42be-bf4b-cf55ed727c31",
    where: [{ page: "qa", sel: "a[href*='design-identity']" }] }
]

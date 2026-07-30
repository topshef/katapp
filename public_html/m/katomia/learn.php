<?php
require_once __DIR__ . '/kasset.php';
require_once __DIR__ . '/site-config.php';
// learn.php — ENTRY-LEARN1 (user 2026-07-30): the explainer + FAQ page.
//
// "What is a circle?" needed somewhere to point. This is that page, and it also
// carries the pitch: what peer-to-peer multi-party exchange is, why Katomia exists,
// what the areas on the board are called and how they interact, then an FAQ.
//
// TWO THINGS TO KEEP TRUE AS THIS GROWS:
//  1. The concepts are PRESENTATION-INDEPENDENT. The user was explicit: "the concepts
//     carried regardless of whether you're in a circle or a grid mode ... we can
//     substitute in boardroom or whatever". So every user-facing name for the space
//     comes from katomiaTerms() and the copy talks about the space, the areas and the
//     flow — never about a particular skin's geometry as if it were the concept.
//  2. Anything not yet decided says TBC, out loud. The user asked for that directly
//     ("Many items might be tbc as we develop the app"), and a confident invented
//     answer on a page like this is worse than an honest gap.
//
// Later (user, same day, explicitly deferred): a short video walking through the
// layouts, and a first-run in-game coach pointing at each area on the real board.
// Both tracked on ENTRY-LEARN1 — this page is the text version that comes first.
$T = katomiaTerms();
$siteConfig = katomiaSiteConfig();
$brand = $siteConfig['landing']['title'] ?? 'Katomia';
?>
<!DOCTYPE html>
<html data-kfb-product="katomia">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="<?= kasset('kfade.js') ?>"></script>
<link rel="stylesheet" href="<?= kasset('katomia.css') ?>">
<title><?= htmlspecialchars($brand, ENT_QUOTES, 'UTF-8') ?> — what is a <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?>?</title>
<style>
  body{ background:#f7f9fc; color:#2b3038; }
  .learn{ max-width: 720px; margin: 26px auto 60px; padding: 0 18px; line-height: 1.62; }
  .learn h1{ font-size: 27px; margin: 0 0 6px; letter-spacing:-.3px; }
  .learn .lede{ font-size: 16.5px; color:#525b68; margin: 0 0 8px; }
  .learn h2{ font-size: 20px; margin: 38px 0 10px; letter-spacing:-.2px; scroll-margin-top: 18px; }
  .learn h3{ font-size: 15.5px; margin: 22px 0 4px; }
  .learn p{ margin: 0 0 13px; }
  .learn a{ color:#2f6fed; }
  .learn ul{ margin: 0 0 13px; padding-left: 20px; }
  .learn li{ margin-bottom: 6px; }
  .muted{ color:#6b7482; }
  .small{ font-size: 13.5px; }

  /* Table of contents — the "what is a circle?" link lands at the top of the page,
     so the reader can see the shape of the whole thing before diving in. */
  .toc{ background:#fff; border:1px solid #e3e7ee; border-radius:12px; padding:14px 18px; margin: 22px 0 6px; }
  .toc ol{ margin:0; padding-left: 20px; }
  .toc li{ margin: 3px 0; }

  section{ scroll-margin-top: 14px; }
  .card{ background:#fff; border:1px solid #e3e7ee; border-radius:12px; padding: 16px 18px; margin: 14px 0; }
  .card h3{ margin-top: 0; }
  .tbc{ display:inline-block; padding:1px 7px; border-radius:999px; background:#fff4e0; color:#8a5a12;
        font-size:11.5px; font-weight:600; vertical-align:middle; margin-left:6px; }
  .term{ font-weight:600; }

  /* Zone diagram — deliberately schematic, not a screenshot of one skin: the areas
     are the concept, the ring geometry is just today's clearest way to draw them. */
  .zonefig{ background:#fff; border:1px solid #e3e7ee; border-radius:12px; padding:14px; margin:16px 0; }
  .zonefig svg{ display:block; width:100%; height:auto; max-width:520px; margin:0 auto; }
  .zonefig figcaption{ font-size:13px; color:#6b7482; text-align:center; margin-top:8px; }

  .faq details{ background:#fff; border:1px solid #e3e7ee; border-radius:10px; padding: 11px 14px; margin-bottom: 9px; }
  .faq summary{ cursor:pointer; font-weight:600; font-size:15px; }
  .faq details[open] summary{ margin-bottom: 8px; }
  .faq p:last-child{ margin-bottom: 0; }

  /* CTA */
  .cta{ margin-top: 42px; padding-top: 22px; border-top:1px solid #e3e7ee;
        display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
  .cta .kbtn{ text-decoration:none; }
  .cta-note{ font-size:13px; color:#6b7482; width:100%; margin: 0 0 4px; }

  /* ── kfeedbits (ENTRY-VARIANTS1) ──────────────────────────────────────────
     User's rule: per-ITEM controls in nerd mode, and in normal mode "just to the
     bottom of the page or larger per section". So section-scope bits are always on
     and read as a proper prompt; item-scope bits are compact and nerd-only. */
  .kfb{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .kfb-btn{ border:1px solid #dde3ec; background:#fff; border-radius:999px; cursor:pointer;
            line-height:1; padding:4px 9px; font-size:13px; }
  .kfb-btn:hover{ border-color:#2f6fed; }
  .kfb-btn.on{ border-color:#2f6fed; background:#eaf1fe; }
  .kfb-btn:disabled{ opacity:.5; cursor:default; }
  .kfb-msg{ font-size:12.5px; color:#2f6fed; }
  .kfb-msg-warn{ color:#b4690e; }
  .kfb-lead{ font-size:13px; color:#6b7482; margin-right:2px; }
  .kfb-section{ margin: 14px 0 2px; padding: 9px 12px; background:#fff;
                border:1px dashed #dde3ec; border-radius:10px; }
  /* per-item: nerd mode only, and quiet enough not to fight the prose */
  .kfb-item{ display:none; margin-top:7px; }
  body.nerd .kfb-item{ display:flex; }
  .kfb-item .kfb-btn{ padding:2px 7px; font-size:12px; }
  .kfb-inline{ float:right; margin-left:10px; }
  .nerdnote{ display:none; font-size:12.5px; color:#6b7482; margin: 6px 0 0; }
  body.nerd .nerdnote{ display:block; }
</style>
</head>
<body>
<?php
  require __DIR__ . '/header.php';
  require __DIR__ . '/profile-modal.php';
?>

<div class="learn">

  <h1>What is a <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?>?</h1>
  <p class="lede">A <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?> is a space where several people swap
     things directly with each other — no middleman, no order book, and no one setting a price for you.
     Here's the whole idea, the areas you'll see on screen, and what we don't know yet.</p>

  <nav class="toc small">
    <ol>
      <li><a href="#p2p">Why this exists</a></li>
      <li><a href="#what-is-it">What a <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?> actually is</a></li>
      <li><a href="#areas">The areas — store, counter, basket, table</a></li>
      <li><a href="#how">How a deal happens, step by step</a></li>
      <li><a href="#faq">FAQ</a></li>
    </ol>
  </nav>

  <!-- ═══ 1. WHY ═══ -->
  <section id="p2p">
    <h2>Why this exists</h2>

    <p>People traded long before anyone invented a price. You brought what you had, someone else brought
       what they had, and you worked out between you whether the swap felt fair. The accounting was
       messy and human.</p>

    <p>Money fixed the messiness by flattening it: every kind of value collapsed into a single number
       on one dimension. That was an enormous simplification, and we gave up something real for it.
       Deals where <em>who gets what</em> matters as much as <em>how much</em> became hard to express.</p>

    <div class="card">
      <h3>The problem, plainly</h3>
      <p>Coordination is hard. A deal between more than two parties usually needs intermediaries, trust
         in those intermediaries, several sequential steps, and it can still fall over halfway through
         and leave someone exposed.</p>
      <p class="small muted">And because most systems reduce everything to price, the interesting
         agreements — the multi-sided, conditional, "only if everyone else does too" ones — are
         difficult to even write down, let alone execute.</p>
      <div data-kfb="learn-problem" data-kfb-scope="item" data-kfb-label="Learn: the problem, plainly" class="kfb-item"></div>
    </div>

    <h3>Peer-to-peer, and what we mean by it</h3>
    <p><span class="term">Peer-to-peer</span> here means the participants deal with each other directly.
       There is no exchange in the middle taking custody, no market maker quoting you a spread, and no
       matching engine deciding who trades with whom. You put things where you want them to go, other
       people do the same, and when everyone involved agrees, it happens.</p>

    <p>What <?= htmlspecialchars($brand, ENT_QUOTES, 'UTF-8') ?> adds is the coordination: a real-time,
       shared space where a multi-party agreement can be assembled piece by piece, seen by everyone as
       it forms, and then executed <span class="term">atomically</span> — all of it, or none of it.</p>

    <div class="card">
      <h3>How it's built</h3>
      <ul>
        <li>On <span class="term">Hedera</span>, using HTS (the native token service).</li>
        <li>Fast finality, low fees, and native atomic execution.</li>
        <li><span class="term">No smart contracts required</span> — the atomic swap is a single native
            transaction, not custom on-chain code you have to trust.</li>
      </ul>
      <p class="small muted">Nothing takes custody of your assets along the way. They stay in your own
         Hedera account until the moment the whole agreement executes.</p>
      <div data-kfb="learn-built" data-kfb-scope="item" data-kfb-label="Learn: how it's built" class="kfb-item"></div>
    </div>

    <div data-kfb="sec-p2p" data-kfb-scope="section" data-kfb-target="#p2p" data-kfb-label="Learn section: Why this exists" class="kfb-section"></div>
  </section>

  <!-- ═══ 2. WHAT IS A CIRCLE ═══ -->
  <section id="what-is-it">
    <h2>What a <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?> actually is</h2>

    <p>A <span class="term"><?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?></span> is a coordination
       space. People join it with their own accounts, bring whatever they hold, and propose swaps to each
       other in real time until a set of transfers everyone is happy with has taken shape.</p>

    <p>That's the whole concept. Everything else — the round table, the market square, a plain grid of
       rows — is just <em>how it's drawn</em>. The same space can be presented as a
       <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?>, a boardroom, a market or a game board
       without any of the underlying ideas changing. The areas described below exist in every one of
       those views; only their shapes and names on screen differ.</p>

    <p class="small muted">So if you're looking at a grid rather than a ring, don't worry — your store is
       still your store and your basket is still your basket.</p>

    <p class="nerdnote">Nerd note: internally a
       <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?> is a <code>proposal</code>-mode game, and
       the display word comes from <code>site-config.json</code> → <code>terms.space</code>. The name is a
       parameter precisely so it can be re-pitched per audience.</p>

    <div data-kfb="sec-what" data-kfb-scope="section" data-kfb-target="#what-is-it" data-kfb-label="Learn section: What a circle is" class="kfb-section"></div>
  </section>

  <!-- ═══ 3. AREAS ═══ -->
  <section id="areas">
    <h2>The areas — store, counter, basket, table</h2>

    <p>Every participant has their own space, and the space is divided into zones that mean different
       things. Where an item <em>sits</em> is what says what you intend to do with it — that's the core
       of the interface.</p>

    <figure class="zonefig">
      <svg viewBox="0 0 520 300" role="img" aria-label="Diagram: the store is the outer band, the counter is the dashed band at its inner edge, the basket sits inside that, and the shared table is in the centre.">
        <defs>
          <linearGradient id="lgStore" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f4f7fc"/><stop offset="100%" stop-color="#e9eef7"/>
          </linearGradient>
        </defs>
        <!-- your space: outer store band -->
        <rect x="14" y="14" width="492" height="272" rx="16" fill="url(#lgStore)" stroke="#d8e0ec"/>
        <text x="30" y="38" font-size="13" font-weight="600" fill="#4a5462">YOUR STORE — what you hold here</text>
        <g fill="#fff" stroke="#c6d0e0">
          <rect x="30" y="50" width="52" height="34" rx="6"/><rect x="90" y="50" width="52" height="34" rx="6"/>
          <rect x="150" y="50" width="52" height="34" rx="6"/><rect x="210" y="50" width="52" height="34" rx="6"/>
        </g>
        <!-- reserved / ghosted -->
        <rect x="270" y="50" width="52" height="34" rx="6" fill="#fff" stroke="#c6d0e0"
              stroke-dasharray="4 3" opacity=".55"/>
        <text x="330" y="72" font-size="11.5" fill="#8a5a12">← reserved (promised, ghosted)</text>

        <!-- counter band -->
        <rect x="30" y="104" width="460" height="30" rx="8" fill="#fffaf2" stroke="#e8c99a" stroke-dasharray="5 4"/>
        <text x="42" y="123" font-size="12.5" font-weight="600" fill="#8a5a12">THE COUNTER — deal-adjacent, about to move</text>

        <!-- basket -->
        <rect x="30" y="146" width="460" height="60" rx="10" fill="#fff" stroke="#b9c8e6"/>
        <text x="42" y="166" font-size="12.5" font-weight="600" fill="#3a5680">YOUR BASKET — what others have offered you</text>
        <g fill="#eaf1fe" stroke="#9fb8e8">
          <rect x="42" y="172" width="46" height="26" rx="5"/><rect x="96" y="172" width="46" height="26" rx="5"/>
          <rect x="150" y="172" width="46" height="26" rx="5"/>
        </g>
        <text x="212" y="190" font-size="11.5" fill="#6b7482">coloured by who put them there</text>

        <!-- table -->
        <ellipse cx="260" cy="248" rx="150" ry="30" fill="#f3f6fb" stroke="#c6d0e0"/>
        <text x="260" y="245" font-size="12.5" font-weight="600" fill="#4a5462" text-anchor="middle">THE TABLE — shared centre</text>
        <text x="260" y="261" font-size="11" fill="#6b7482" text-anchor="middle">lock ring · whole-deal progress</text>
      </svg>
      <figcaption>Schematic, not a screenshot — the ring, market-square and grid views all draw these
        same four zones differently.</figcaption>
    </figure>

    <div class="card">
      <h3>Your store <span class="muted small">— what you hold in this <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?></span></h3>
      <p>Your own holdings, visible to the others so they know what there is to ask for. Things sitting
         in your store are yours and uncommitted — nothing about having them here promises them to anybody.</p>
      <div data-kfb="learn-store" data-kfb-scope="item" data-kfb-label="Learn: your store" class="kfb-item"></div>
    </div>

    <div class="card">
      <h3>The counter <span class="muted small">— the deal-adjacent strip</span></h3>
      <p>The band at the edge of your store, nearest the middle. Think of it as the cashier's counter:
         it's where things gather when they're part of a deal that's coming together, rather than just
         sitting on your shelves.</p>
      <p>An item that you've promised into a pending deal is <span class="term">reserved</span>. It stays
         where it is but goes ghosted — faded and dashed — so everyone can see it's spoken for and
         shouldn't be counted on twice.</p>
      <div data-kfb="learn-counter" data-kfb-scope="item" data-kfb-label="Learn: the counter / reserved" class="kfb-item"></div>
    </div>

    <div class="card">
      <h3>Your basket <span class="muted small">— what's being offered to you</span></h3>
      <p>The area that holds what other people have put forward <em>for you</em>. You propose a transfer
         by placing one of your things into someone else's basket; when they do the same to yours, the
         two halves of a swap exist and you can both see it.</p>
      <p>Baskets are colour-coded by who put the item there, so a basket with three different givers in
         it reads at a glance as a three-way deal forming.</p>
      <div data-kfb="learn-basket" data-kfb-scope="item" data-kfb-label="Learn: your basket" class="kfb-item"></div>
    </div>

    <div class="card">
      <h3>The table <span class="muted small">— the shared middle</span></h3>
      <p>The common centre of the space. It carries the state of the deal as a whole rather than any one
         person's things: who has locked, how close the group is to agreement, and the progress ring for
         the cluster that's about to settle.</p>
      <div data-kfb="learn-table" data-kfb-scope="item" data-kfb-label="Learn: the table" class="kfb-item"></div>
    </div>

    <h3>How they interact</h3>
    <p>The flow is a loop, and it's the same loop in every view:</p>
    <ul>
      <li>Something starts in <span class="term">your store</span>, uncommitted.</li>
      <li>You place it into <span class="term">someone else's basket</span> — that's a proposal. Your copy
          goes <span class="term">reserved</span> and ghosts out, and it gathers at
          <span class="term">the counter</span> because it's now deal-adjacent.</li>
      <li>They accept, reject, or counter by putting something into <span class="term">your basket</span>.</li>
      <li>When the shape is right, everyone involved <span class="term">locks</span>. The
          <span class="term">table</span> shows that agreement building.</li>
      <li>On the last lock it all executes at once, and the items move for real.</li>
    </ul>
    <p class="small muted">Nothing leaves your account until that final step, and if any part of the
       agreement fails, none of it happens.</p>

    <div data-kfb="sec-areas" data-kfb-scope="section" data-kfb-target="#areas" data-kfb-label="Learn section: The areas" class="kfb-section"></div>
  </section>

  <!-- ═══ 4. HOW ═══ -->
  <section id="how">
    <h2>How a deal happens, step by step</h2>
    <ol>
      <li>Someone creates a <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?> — a coordination space.</li>
      <li>Participants join with their Hedera accounts. They can be people or agents.</li>
      <li>Anyone proposes a transfer by placing assets into someone else's basket.</li>
      <li>Others accept, reject or modify what's been proposed, live, and the shape of the deal changes
          in front of everybody.</li>
      <li>When the group is happy, participants <span class="term">lock</span> — the signal that says
          "this is agreed as far as I'm concerned".</li>
      <li>Once the lock rule is satisfied it's signed and executed as a
          <span class="term">single atomic transaction</span> on Hedera. All of it, or none of it.</li>
    </ol>

    <div class="card">
      <h3>Locking, and who has to agree</h3>
      <p>How much of the room has to agree before a deal can go through is set per
         <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?>:</p>
      <ul>
        <li><span class="term">Any connected cluster</span> — any group whose swaps interlock can settle
            on its own, without waiting for people they aren't trading with. This is the usual setting.</li>
        <li><span class="term">Active players</span> — everyone currently taking part must agree.
            Separate, unconnected clusters can still execute atomically.</li>
        <li><span class="term">All players</span> — everyone in the space must agree, which suits a
            private <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?> where everyone is expected
            to be involved.</li>
      </ul>
      <p class="small muted">A <span class="term">cluster</span> is just a group of people whose proposed
         transfers connect to each other. Two clusters that don't touch don't have to wait for one another.</p>
      <div data-kfb="learn-lock" data-kfb-scope="item" data-kfb-label="Learn: locking and lock rules" class="kfb-item"></div>
    </div>

    <div class="card">
      <h3>Strike delay</h3>
      <p>A <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?> can be set to execute immediately once
         agreement is reached, or to wait a set time first — a window in which the deal is agreed but has
         not yet fired.</p>
      <p class="small muted">Exactly how a pending strike can be interrupted, and by whom, is still being
         worked out. <span class="tbc">TBC</span></p>
      <div data-kfb="learn-strike" data-kfb-scope="item" data-kfb-label="Learn: strike delay" class="kfb-item"></div>
    </div>

    <div data-kfb="sec-how" data-kfb-scope="section" data-kfb-target="#how" data-kfb-label="Learn section: How a deal happens" class="kfb-section"></div>
  </section>

  <!-- ═══ 5. FAQ ═══ -->
  <section id="faq" class="faq">
    <h2>FAQ</h2>
    <p class="small muted">We're building in the open, so a fair few of these are honestly unfinished.
       Anything marked <span class="tbc">TBC</span> is a real open question, not a dodge — and the 💬
       button is the fastest way to push us on one.</p>

    <details>
      <summary>Do I need a wallet to look around?</summary>
      <p>No. You can walk into a <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?> and watch without
         connecting anything. You need a connected account when you want to actually put something into
         a deal.</p>
      <div data-kfb="faq-wallet" data-kfb-scope="item" data-kfb-label="FAQ: do I need a wallet to look around" class="kfb-item"></div>
    </details>

    <details>
      <summary>Is my stuff held by anyone while a deal is forming?</summary>
      <p>No. Assets stay in your own Hedera account the entire time. Reserving something marks it as
         promised so it can't be double-spent inside the space — it doesn't move it anywhere.</p>
      <div data-kfb="faq-custody" data-kfb-scope="item" data-kfb-label="FAQ: custody while a deal forms" class="kfb-item"></div>
    </details>

    <details>
      <summary>What if one person backs out at the last moment?</summary>
      <p>Then nothing happens. Execution is atomic: either the whole agreed set of transfers goes through
         as one transaction, or none of it does. Nobody ends up half-swapped.</p>
      <div data-kfb="faq-backout" data-kfb-scope="item" data-kfb-label="FAQ: someone backs out" class="kfb-item"></div>
    </details>

    <details>
      <summary>What's the difference between testnet and mainnet <?= htmlspecialchars($T['many'], ENT_QUOTES, 'UTF-8') ?>?</summary>
      <p>Which Hedera network the accounts and assets live on. Testnet assets have no real value, so it's
         the comfortable place to learn the interface. Mainnet is live value.</p>
      <p>We deliberately don't frame this as "practice versus real" — there are play tokens on mainnet
         too, and people do serious things on testnet. Pick the network you want to be on.</p>
      <div data-kfb="faq-networks" data-kfb-scope="item" data-kfb-label="FAQ: testnet vs mainnet" class="kfb-item"></div>
    </details>

    <details>
      <summary>Can I trade anything, or only certain tokens?</summary>
      <p>Whatever the <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?> has been set up to allow —
         each one carries its own list of permitted pairs. HBAR, fungible tokens and NFTs are all in scope
         on Hedera.</p>
      <p class="small muted">The exact rules for how a creator configures allowed assets are still
         settling. <span class="tbc">TBC</span></p>
      <div data-kfb="faq-assets" data-kfb-scope="item" data-kfb-label="FAQ: what can be traded" class="kfb-item"></div>
    </details>

    <details>
      <summary>Who can join a <?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?>?</summary>
      <p>Depends how it was made. It can be open to anyone, limited to a named list of accounts, or gated
         on a rule — belonging to a group, or holding something in particular. Public ones appear in
         listings; unlisted ones are reachable by link; private ones need permission.</p>
      <div data-kfb="faq-join" data-kfb-scope="item" data-kfb-label="FAQ: who can join" class="kfb-item"></div>
    </details>

    <details>
      <summary>How many people can be in one at once?</summary>
      <p>There's no hard cap in the engine, but the current board views get crowded past roughly four
         participants on a phone. Handling genuinely large rooms — starting wide and narrowing to the
         cluster that matters — is an open design problem we're actively working on.
         <span class="tbc">TBC</span></p>
      <div data-kfb="faq-size" data-kfb-scope="item" data-kfb-label="FAQ: how many people" class="kfb-item"></div>
    </details>

    <details>
      <summary>What does it cost?</summary>
      <p>Hedera network fees for the transaction itself, which are famously small. Whether anything sits
         on top of that is not decided. <span class="tbc">TBC</span></p>
      <div data-kfb="faq-cost" data-kfb-scope="item" data-kfb-label="FAQ: what does it cost" class="kfb-item"></div>
    </details>

    <details>
      <summary>Which wallets work?</summary>
      <p>Connection is over WalletConnect, so Hedera wallets supporting it should work. We're not yet
         publishing a tested-and-supported list. <span class="tbc">TBC</span></p>
      <div data-kfb="faq-wallets" data-kfb-scope="item" data-kfb-label="FAQ: which wallets" class="kfb-item"></div>
    </details>

    <details>
      <summary>Is there a mobile app?</summary>
      <p>Not separately — it runs in the browser and is built to work on a phone. A packaged app isn't
         ruled out. <span class="tbc">TBC</span></p>
      <div data-kfb="faq-mobile" data-kfb-scope="item" data-kfb-label="FAQ: mobile app" class="kfb-item"></div>
    </details>

    <details>
      <summary>Why "<?= htmlspecialchars($T['one'], ENT_QUOTES, 'UTF-8') ?>"?</summary>
      <p>Because it's a group of people meeting as equals, and the word carries none of the hierarchy or
         combativeness of the alternatives. It's also genuinely provisional — the name is a setting, and
         we may well call it something else for a different audience. If you have a better word, the 💬
         button below is right there.</p>
      <div data-kfb="faq-naming" data-kfb-scope="item" data-kfb-label="FAQ: why the word circle" class="kfb-item"></div>
    </details>

    <details>
      <summary>Is there a video walkthrough?</summary>
      <p>Not yet — a short one taking you through the layouts is planned, and this page is the written
         version in the meantime. <span class="tbc">TBC</span></p>
      <div data-kfb="faq-video" data-kfb-scope="item" data-kfb-label="FAQ: video walkthrough" class="kfb-item"></div>
    </details>

    <div data-kfb="sec-faq" data-kfb-scope="section" data-kfb-target="#faq" data-kfb-label="Learn section: FAQ" class="kfb-section"></div>
  </section>

  <!-- ═══ CTA ═══ -->
  <div class="cta">
    <p class="cta-note">Anything here unclear, wrong, or missing? Tell us — especially now.</p>
    <a class="kbtn kbtn-green" href="/m/katomia/">← Back to home</a>
    <button type="button" class="kbtn kbtn-blue"
            onclick="if(window.KFeedbackWidget){KFeedbackWidget.open()}else{location.href='/m/feedback/?product=katomia'}">💬 Send feedback</button>
    <a class="kbtn" href="https://x.com/kpaylive" target="_blank" rel="noopener">Follow us on X ↗</a>
  </div>
</div>

<script>
window.KTERMS = <?= json_encode($T, JSON_UNESCAPED_UNICODE) ?>;
</script>

<script><?php require_once('config.php'); ?>
  window.CONFIG = {
    HAPI_BASE: "<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>"
  }
</script>

<script src="/vendor/kpay/kpool_widget/qrcode.min.js"></script>
<script src="<?= kasset('katomia-core.js') ?>"></script>
<script src="<?= kasset('katomia-helpers.js') ?>"></script>
<script src="<?= kasset('kemoji.js') ?>"></script>
<script src="<?= kasset('katomia-profile.js') ?>"></script>
<!-- KAT-FEEDBACK1: the modal (long-press anywhere, or the buttons above). Served from
     the backend, its canonical home — the 💬 bits below hand off to it. -->
<script src="https://<?= htmlspecialchars($hapi_base, ENT_QUOTES, 'UTF-8') ?>/feedback-widget.js"
        data-product="katomia"></script>
<!-- ENTRY-VARIANTS1: 👍/👎/💬 bits. Loaded AFTER the widget so 💬 finds it. -->
<script src="<?= kasset('kfeedbits.js') ?>"></script>
</body>
</html>

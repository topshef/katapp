<?php

// ┬┌┐┌┌┬┐┌─┐─┐ ┬  ┬  ┬┌─┐
// │││││ ││├┤ ┌┴┬┘  └┐┌┘├─┤
// ┴┘└┘─┴┘└─┘┴ └─   └┘ ┴ ┴
//
// v2 signing index — list + controls + modular widget modal.
//
// Reached only via ?v=v2 (gated in index.php), so v1 is untouched.
//
// The list lives HERE (the OG page), not in the widget — the widget is a
// single-transaction signing widget only. Clicking a row calls KPOOL.open(),
// which mounts the kpay widget directly inside a brandable modal (no iframe).
// The legacy "↗ tab" link is kept per row for side-by-side comparison.

$docroot = $_SERVER['DOCUMENT_ROOT'];

require_once "$docroot/readenv.php";
require_once "$docroot/auth.php";
require_once "$docroot/config.php";
require_once "$docroot/assets/php/elog.php";

// index.php may already have started the session before requiring this file
if (session_status() === PHP_SESSION_NONE) session_start();

require_once "$docroot/vendor/hashconnect/configLoad.php";
$network = getNetwork() ?? ($_GET['network'] ?? 'mainnet');

// deep-link params: if a txid is present we auto-open the modal on load
$txid = $_GET['txid'] ?? null;
$pch  = $_GET['pch']  ?? null;

// IMPORTANT: headheader.php builds the site's CSS/base tags from these. v1 sets
// them before the header include; v2 must too, or the page chrome loads unstyled
// (serif fonts, no theme). Mirror v1 exactly.
$custom_style  = '<link rel="stylesheet" type="text/css" href="future/future.css">';
$path_base     = "https://{$_SERVER['SERVER_NAME']}";
$html_viewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';

require_once "$docroot/elog.php";
require_once "$docroot/headheader.php";

?>

    <!-- Page Content -->
    <div class="page-heading header-text" style="background-image: url('<?php echo $content['checkout'][1]['imgsrc']; ?>'); padding-top: 120px;padding-bottom: 60px;">
      <div class="container">
        <div class="row">
          <div class="col-md-12">
            <h1>OPEN OFFERS</h1>
            <span>Select a queued transaction to review &amp; sign</span>
          </div>
        </div>
      </div>
    </div>

    <div class="callback-form contact-us" style="padding-top: 10px; margin-top: 0px;">
      <div class="container">
        <div class="contact-form">
          <div class="row">
            <div class="col-lg-12">

              <!-- controls -->
              <div id="kp-controls" class="kp-controls">
                <label class="kp-field">
                  <span class="kp-cap">Network</span>
                  <select id="kp-network" class="kp-input">
                    <option value="mainnet">mainnet</option>
                    <option value="testnet">testnet</option>
                  </select>
                </label>

                <label class="kp-field">
                  <span class="kp-cap">Since</span>
                  <select id="kp-since" class="kp-input">
                    <option value="120">2 min</option>
                    <option value="600" selected>10 min</option>
                    <option value="1800">30 min</option>
                    <option value="3600">1 hour</option>
                    <option value="14400">4 hours</option>
                    <option value="86400">24 hours</option>
                  </select>
                </label>

                <label class="kp-field">
                  <span class="kp-cap">Until</span>
                  <select id="kp-until" class="kp-input">
                    <option value="120" selected>2 min</option>
                    <option value="600">10 min</option>
                    <option value="1800">30 min</option>
                    <option value="3600">1 hour</option>
                    <option value="14400">4 hours</option>
                    <option value="86400">24 hours</option>
                    <option value="259200">72 hours</option>
                  </select>
                </label>

                <label class="kp-field kp-filter">
                  <span class="kp-cap">Filter</span>
                  <input id="kp-filter" class="kp-input" type="text" placeholder="txid / pch / account">
                </label>

                <div class="kp-actions">
                  <button id="kp-refresh" type="button" class="kp-btn">Refresh</button>
                  <label class="kp-auto">
                    <input id="kp-autorefresh" type="checkbox"> auto
                  </label>
                  <span id="kp-count" class="kp-count"></span>
                </div>

              </div>

              <!-- list -->
              <div id="kp-list" class="kp-list"></div>

            </div>
          </div>
        </div>
      </div>
    </div>

<?php include "$docroot/footer.php"; ?>

    <!-- Bootstrap core JavaScript (kept for site chrome) -->
    <script src="vendor/jquery/jquery.min.js"></script>
    <script src="vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
    <script src="assets/js/custom.js"></script>

    <!-- Localbase (IndexedDB): persists terminal tx statuses across reloads -->
    <script src="/m/bid/localbase.min.js"></script>

    <!-- WalletConnect bundle: exposes window.WC for the widget's signer -->
    <?php require_once("$docroot/vendor/walletconnect/kwcScriptTag.php"); ?>

    <!-- glog: global logger (writes to localbase). kdiag forwards into it. -->
    <script type="module" data-global src="/m/tools/glog/latest/glog.js"></script>
    <script>const glog = globalThis.glog ?? (() => {})</script>

    <!-- kdiag diagnostics buffer: in console use kdiag.dump() / kdiag.copy() -->
    <script type="module">import('/vendor/kpay/kpool_widget/diag.js')</script>

    <!-- kpay signing widget: exposes window.KPOOL (no #kpool_widget here, so no auto-boot) -->
    <script type="module" src="/vendor/kpay/kpool_widget/bootstrap.js"></script>

<style>
  #kp-controls.kp-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px 14px;
    margin: 6px 0 20px;
    text-align: left;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  #kp-controls .kp-field { display: flex; flex-direction: column; gap: 4px; margin: 0; }
  /* subtle, quiet captions */
  #kp-controls .kp-cap {
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: #8a8f98;
  }
  /* compact, lightly-rounded fields. Scoped under the #id so the site theme's
     own input/select rules (which were rounding these into tall pills) lose on
     specificity; all:revert clears inherited theme styling too. */
  #kp-controls .kp-input {
    all: revert;
    height: 30px;
    box-sizing: border-box;
    padding: 0 8px;
    border: 1px solid #d9dce1;
    border-radius: 5px;
    background: #fff;
    color: #222;
    font-size: 13px;
    font-family: inherit;
    line-height: normal;
    outline: none;
  }
  #kp-controls .kp-input:focus { border-color: #4aa3ff; box-shadow: 0 0 0 2px rgba(74,163,255,.15); }
  #kp-controls select.kp-input { padding-right: 4px; }
  /* filter takes up the slack between the fields and the actions */
  #kp-controls .kp-filter { flex: 1 1 220px; min-width: 160px; }
  #kp-controls .kp-filter .kp-input { width: 100%; }

  /* Refresh + auto + count: one nowrap row, the same 30px height as the fields,
     pinned to the bottom edge so everything sits on a single clean baseline. */
  #kp-controls .kp-actions {
    display: inline-flex;
    align-items: center;
    flex-wrap: nowrap;
    gap: 14px;
    margin-left: auto;
    align-self: flex-end;
    height: 30px;
  }
  #kp-controls .kp-btn {
    all: revert;
    height: 30px;
    box-sizing: border-box;
    padding: 0 14px;
    border: 1px solid #d9dce1;
    border-radius: 5px;
    background: #f6f7f9;
    color: #222;
    font-size: 13px;
    font-family: inherit;
    line-height: normal;
    cursor: pointer;
    vertical-align: middle;
  }
  #kp-controls .kp-btn:hover { background: #eceef1; }
  #kp-controls .kp-auto {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 13px;
    color: #8a8f98;
    white-space: nowrap;
  }
  #kp-controls .kp-auto input { all: revert; width: auto; height: auto; margin: 0; }
  #kp-controls .kp-count { font-size: 13px; color: #b0b4bb; white-space: nowrap; }

  .kp-list {
    text-align: left;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
  }
  .kp-row {
    display: grid;
    grid-template-columns: 90px 80px 1fr 70px 170px 140px 120px;
    gap: 12px;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid #eee;
  }
  .kp-row:hover { background: #fafafa; }
  .kp-head {
    font-weight: 600;
    color: #666;
    border-bottom: 2px solid #ddd;
  }
  .kp-row .kp-txid { word-break: break-all; }
  .kp-row .kp-net  { color: #888; }
  .kp-remaining    { font-weight: 600; }
  .kp-remaining.future { color: #2e7d32; }
  .kp-remaining.past   { color: #b26a00; }

  /* per-tx status — mirrors the modal header tones (filled async via
     window.KPOOL.readStatus). square dot = on-chain result, round = off-chain. */
  .kp-status { display: flex; align-items: center; gap: 7px; color: #555; font-size: 12px; min-width: 0; }
  .kp-status-dot { width: 9px; height: 9px; border-radius: 50%; background: #cdd1d7; flex: none; }
  .kp-status-dot.square { border-radius: 2px; }
  .kp-status-dot[data-tone="success"] { background: #2e9e57; }
  .kp-status-dot[data-tone="warn"]    { background: #e0a008; }
  .kp-status-dot[data-tone="info"]    { background: #4aa3ff; }
  .kp-status-dot[data-tone="error"]   { background: #d64550; }
  .kp-status-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .kp-status-dot[data-tone="pending"] ~ .kp-status-label { color: #b0b4bb; }

  .kp-open {
    all: revert;
    padding: 5px 14px;
    border: 1px solid #4aa3ff;
    border-radius: 6px;
    background: #eaf4ff;
    color: #084298;
    cursor: pointer;
    font: inherit;
  }
  .kp-open:hover { background: #d6eaff; }
  .kp-ext { font-size: 11px; color: #999; }

  .kp-empty, .kp-error {
    padding: 24px;
    text-align: center;
    color: #999;
  }
  .kp-error { color: #b00020; }

  @media (max-width: 768px) {
    .kp-row {
      grid-template-columns: 1fr;
      gap: 4px;
      row-gap: 2px;
    }
    .kp-head { display: none; }
  }
</style>

<script>
// ┬┌─┌─┐  ┬  ┬┌─┐┌┬┐  ┌─┐  ┌┬┐┌─┐┌┬┐┌─┐┬
// ├┴┐├─┘  │  │└─┐ │   ┌─┘  ││││ │ ││├─┤│
// ┴ ┴┴    ┴─┘┴└─┘ ┴   └─┘  ┴ ┴└─┘─┴┘┴ ┴┴─┘
// v2 list + modular widget modal. List reuses the existing ?action=txList
// endpoint. The modal is the kpay widget mounted via window.KPOOL.open().

;(() => {

  const DEEP = {
    txid:    <?php echo json_encode($txid); ?>,
    network: <?php echo json_encode($network); ?>,
    pch:     <?php echo json_encode($pch); ?>
  }

  const els = {
    network:     document.getElementById('kp-network'),
    since:       document.getElementById('kp-since'),
    until:       document.getElementById('kp-until'),
    filter:      document.getElementById('kp-filter'),
    refresh:     document.getElementById('kp-refresh'),
    autorefresh: document.getElementById('kp-autorefresh'),
    count:       document.getElementById('kp-count'),
    list:        document.getElementById('kp-list')
  }

  els.network.value = DEEP.network || 'mainnet'

  let lastTxs = []
  let autoTimer = null

  // ── helpers ───────────────────────────────────────────────────────────────

  const txStartSec = txid => Number(txid.split('@')[1])

  const formatRemaining = ts => {
    const now  = Math.floor(Date.now() / 1000)
    const diff = ts - now
    const abs  = Math.abs(diff)
    const h = Math.floor(abs / 3600)
    const m = String(Math.floor((abs % 3600) / 60)).padStart(2, '0')
    const s = String(Math.floor(abs % 60)).padStart(2, '0')
    return { text: `${diff >= 0 ? '+' : '-'} ${h}:${m}:${s}`, future: diff >= 0 }
  }

  const formatUtc = ts =>
    new Date(ts * 1000).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'

  // wait until the widget module has set window.KPOOL (bootstrap is async)
  const whenReady = (cond, ms = 50, tries = 100) => new Promise((res, rej) => {
    const t = setInterval(() => {
      if (cond()) { clearInterval(t); res() }
      else if (--tries < 0) { clearInterval(t); rej(new Error('KPOOL not ready')) }
    }, ms)
  })

  // ── data ──────────────────────────────────────────────────────────────────

  const loadTxList = async () => {
    const network = els.network.value
    const since   = els.since.value || 600
    const until   = els.until.value || 600

    // keep the call relative to this page (portable if the folder moves)
    const url = `${location.pathname}?action=txList`
      + `&network=${encodeURIComponent(network)}`
      + `&since=${encodeURIComponent(since)}`
      + `&until=${encodeURIComponent(until)}`

    els.list.innerHTML = `<div class="kp-empty">Loading…</div>`

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`txList failed (${res.status})`)

      const json = await res.json()
      lastTxs = (json?.result?.tx || []).filter(t => t.type === 'tx')
      lastTxs.sort((a, b) => txStartSec(a.txid) - txStartSec(b.txid))

      // fresh list → drop in-memory cache so non-terminal statuses (pending /
      // awaiting) get re-probed, then re-seed the terminal ones from Localbase.
      statusCache.clear()
      await preloadStoredStatuses(lastTxs)

      window.kdiag?.('list:loaded', { count: lastTxs.length, network })
      renderList()
    } catch (err) {
      window.kdiag?.('list:error', { error: String(err) })
      console.error(err)
      els.list.innerHTML = `<div class="kp-error">${err.message}</div>`
    }
  }

  // ── render ──────────────────────────────────────────────────────────────────

  const renderList = () => {
    const needle = els.filter.value.trim().toLowerCase()

    const rows = lastTxs.filter(t => {
      if (!needle) return true
      const hay = `${t.txid} ${t.pch ?? ''} ${t.network ?? ''}`.toLowerCase()
      return hay.includes(needle)
    })

    els.count.textContent = `${rows.length} / ${lastTxs.length}`

    if (!rows.length) {
      els.list.innerHTML = `<div class="kp-empty">No queued transactions</div>`
      return
    }

    const head = `
      <div class="kp-row kp-head">
        <div>Remaining</div>
        <div>Network</div>
        <div>Transaction</div>
        <div>pch</div>
        <div>Scheduled (UTC)</div>
        <div>Status</div>
        <div></div>
      </div>`

    const body = rows.map(t => {
      const ts = txStartSec(t.txid)
      const rem = formatRemaining(ts)

      // legacy full-page detail link (v1, new tab) for side-by-side compare
      const ext = new URL(location)
      ext.searchParams.delete('v')
      ext.searchParams.set('network', t.network)
      ext.searchParams.set('txid', t.txid)
      if (t.pch) ext.searchParams.set('pch', t.pch)

      // reuse a cached status if we already probed this tx (e.g. on filter
      // re-render); otherwise show a neutral pending dot for hydrateStatuses().
      const cached = statusCache.get(statusKey(t))
      const tone   = cached?.tone ?? 'pending'
      const sq     = cached?.shape === 'square' ? ' square' : ''
      const slab   = cached?.label ?? '—'

      return `
        <div class="kp-row">
          <div class="kp-remaining ${rem.future ? 'future' : 'past'}">${rem.text}</div>
          <div class="kp-net">${t.network}</div>
          <div class="kp-txid">${t.txid}</div>
          <div>${t.pch ?? ''}</div>
          <div>${formatUtc(ts)}</div>
          <div class="kp-status" data-txid="${t.txid}" data-network="${t.network}" data-pch="${t.pch ?? ''}">
            <span class="kp-status-dot${sq}" data-tone="${tone}"></span>
            <span class="kp-status-label">${slab}</span>
          </div>
          <div>
            <button class="kp-open"
              data-txid="${t.txid}"
              data-network="${t.network}"
              data-pch="${t.pch ?? ''}">Sign</button>
            <a class="kp-ext" href="${ext}" target="_blank" rel="noopener">↗ tab</a>
          </div>
        </div>`
    }).join('')

    els.list.innerHTML = head + body
    hydrateStatuses()
  }

  // ── status hydration ──────────────────────────────────────────────────────
  // Fill the Status column asynchronously using the widget's read-only probe
  // (window.KPOOL.readStatus). Two layers of cache:
  //   • statusCache (in-memory) — survives filter re-renders this session.
  //   • Localbase (IndexedDB)   — persists TERMINAL statuses (success / expired /
  //     failed) across reloads, exactly like katomia-localdb caches settled txs.
  //     A terminal status can never change, so once stored we never re-probe it.
  // Probing order expands outward from "now": nearest-to-present first, then
  // alternating forward/back, so the rows a signer actually cares about resolve
  // first. Cancellable via a generation token and capped so a huge list won't
  // hammer the backend. If the widget predates readStatus, pending dots remain.
  const statusKey = t => `${t.network};${t.txid};${t.pch ?? 'no_pch'}`
  const statusCache = new Map()
  let statusGen = 0
  const STATUS_MAX = 40   // don't auto-probe more than this many rows

  // A status is "terminal" (won't change) when it's on-chain (square dot) or
  // expired — safe to persist and trust on the next reload.
  const isTerminal = s => !!s && (s.shape === 'square' || /expir/i.test(s.label || ''))

  // Localbase store for terminal statuses. Soft dependency: if Localbase isn't
  // present we just skip persistence and probe live every time.
  const STATUS_DB = (() => {
    try { return (typeof Localbase !== 'undefined') ? new Localbase('kpoolStatus') : null }
    catch { return null }
  })()
  const STATUS_COLL = 'status'

  const loadStored = async key => {
    if (!STATUS_DB) return null
    try { return await STATUS_DB.collection(STATUS_COLL).doc(key).get() } catch { return null }
  }
  const storeTerminal = async (key, s) => {
    if (!STATUS_DB || !isTerminal(s)) return
    try {
      if (await STATUS_DB.collection(STATUS_COLL).doc(key).get()) return  // already stored
      await STATUS_DB.collection(STATUS_COLL).add({ key, tone: s.tone, label: s.label, shape: s.shape }, key)
    } catch (err) { window.kdiag?.('list:status:store-fail', { key, error: String(err) }) }
  }

  // Seed statusCache from Localbase so terminal statuses paint instantly on load
  // (no pending flash, no network call). Only terminal entries are ever stored.
  const preloadStoredStatuses = async txs => {
    if (!STATUS_DB) return
    await Promise.all(txs.map(async t => {
      const key = statusKey(t)
      const stored = await loadStored(key)
      if (isTerminal(stored)) statusCache.set(key, stored)
    }))
  }

  const hydrateStatuses = async () => {
    if (!window.KPOOL?.readStatus) return
    const gen = ++statusGen
    const now = Math.floor(Date.now() / 1000)

    // pending cells only, ordered by distance from now (nearest first → expands
    // outward, naturally alternating future/past as the gaps interleave)
    const cells = [...els.list.querySelectorAll('.kp-status')]
      .filter(c => c.querySelector('.kp-status-dot')?.dataset.tone === 'pending')
      .map(c => ({ c, d: Math.abs((Number(c.dataset.txid.split('@')[1]) || now) - now) }))
      .sort((a, b) => a.d - b.d)
      .map(x => x.c)
      .slice(0, STATUS_MAX)
    if (!cells.length) return

    let i = 0
    const worker = async () => {
      while (i < cells.length) {
        if (gen !== statusGen) return            // a newer render superseded us
        const cell = cells[i++]
        const { txid, network, pch } = cell.dataset
        const key = statusKey({ network, txid, pch })
        try {
          const s = await window.KPOOL.readStatus({ network, txid, pch: pch || 'no_pch' })
          if (gen !== statusGen) return
          statusCache.set(key, s)
          await storeTerminal(key, s)            // persist if it can never change
          const dot = cell.querySelector('.kp-status-dot')
          const lab = cell.querySelector('.kp-status-label')
          dot.dataset.tone = s.tone || 'info'
          dot.classList.toggle('square', s.shape === 'square')
          lab.textContent = s.label || ''
        } catch (err) {
          const lab = cell.querySelector('.kp-status-label')
          if (lab) lab.textContent = '—'
          window.kdiag?.('list:status:error', { txid, error: String(err) })
        }
      }
    }
    // gentle 4-way concurrency
    await Promise.all([worker(), worker(), worker(), worker()])
  }

  // ── modal (modular widget load) ───────────────────────────────────────────

  let activeModal = null

  const openModal = async ({ txid, network, pch }) => {
    window.kdiag?.('modal:open', { network, txid, pch })

    // reflect in the address bar so the open modal is itself shareable
    const addr = new URL(location)
    // addr.searchParams.set('v', 'v2')
    addr.searchParams.set('network', network)
    addr.searchParams.set('txid', txid)
    if (pch) addr.searchParams.set('pch', pch)
    history.replaceState(null, '', addr)

    try {
      await whenReady(() => window.KPOOL?.open)
    } catch (err) {
      window.kdiag?.('modal:kpool-not-ready')
      els.list.insertAdjacentHTML('afterbegin',
        `<div class="kp-error">Signing widget failed to load</div>`)
      return
    }

    activeModal = await window.KPOOL.open({
      network,
      txid,
      pch: pch || 'no_pch',
      brand: {
        title: `Sign · ${network}`,
        // showHeader: true, logo: '/path/to/logo.svg'   // customise here
        onClose: clearDeepLink
      }
    })
  }

  const clearDeepLink = () => {
    const a = new URL(location)
    a.searchParams.delete('txid')
    a.searchParams.delete('pch')
    history.replaceState(null, '', a)
  }

  // ── wiring ────────────────────────────────────────────────────────────────

  els.list.addEventListener('click', e => {
    const btn = e.target.closest('.kp-open')
    if (!btn) return
    openModal({
      txid:    btn.dataset.txid,
      network: btn.dataset.network,
      pch:     btn.dataset.pch || null
    })
  })

  els.refresh.addEventListener('click', loadTxList)
  els.network.addEventListener('change', loadTxList)
  els.filter.addEventListener('input', renderList)


  els.autorefresh.addEventListener('change', () => {
    clearInterval(autoTimer)
    if (els.autorefresh.checked) autoTimer = setInterval(loadTxList, 5000)
  })

  // ── boot ────────────────────────────────────────────────────────────────────

  loadTxList()

  // deep link: ?txid=… auto-opens the modal (backward-compatible popup)
  if (DEEP.txid) {
    openModal({ txid: DEEP.txid, network: DEEP.network, pch: DEEP.pch })
  }

})()
</script>

  </body>
</html>
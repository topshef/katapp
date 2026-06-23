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
                <label>Network
                  <select id="kp-network">
                    <option value="mainnet">mainnet</option>
                    <option value="testnet">testnet</option>
                  </select>
                </label>

                <label>Since (s)
                  <input id="kp-since" type="number" min="0" step="60" value="600">
                </label>

                <label>Until (s)
                  <input id="kp-until" type="number" min="0" step="60" value="600">
                </label>

                <label>Filter
                  <input id="kp-filter" type="text" placeholder="txid / pch / account">
                </label>

                <button id="kp-refresh" type="button">Refresh</button>

                <label class="kp-auto">
                  <input id="kp-autorefresh" type="checkbox"> auto
                </label>

                <span id="kp-count" class="kp-count"></span>

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
  .kp-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px;
    margin: 8px 0 20px;
    text-align: left;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px;
  }
  .kp-controls label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: #555;
    margin: 0;
  }
  .kp-controls input,
  .kp-controls select {
    all: revert;
    padding: 4px 6px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 13px;
  }
  .kp-controls input[type="number"] { width: 90px; }
  .kp-controls input[type="text"]   { width: 220px; }
  .kp-controls .kp-auto { flex-direction: row; align-items: center; gap: 6px; }
  .kp-controls button {
    all: revert;
    padding: 6px 14px;
    border: 1px solid #888;
    border-radius: 4px;
    background: #f5f5f5;
    cursor: pointer;
    font-size: 13px;
  }
  .kp-controls button:hover { background: #ececec; }
  .kp-count   { color: #999; margin-left: auto; }

  .kp-list {
    text-align: left;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
  }
  .kp-row {
    display: grid;
    grid-template-columns: 90px 80px 1fr 70px 170px 120px;
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

  .kp-open {
    all: revert;
    padding: 4px 12px;
    border: 1px solid #4aa3ff;
    border-radius: 4px;
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

      return `
        <div class="kp-row">
          <div class="kp-remaining ${rem.future ? 'future' : 'past'}">${rem.text}</div>
          <div class="kp-net">${t.network}</div>
          <div class="kp-txid">${t.txid}</div>
          <div>${t.pch ?? ''}</div>
          <div>${formatUtc(ts)}</div>
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
  }

  // ── modal (modular widget load) ───────────────────────────────────────────

  let activeModal = null

  const openModal = async ({ txid, network, pch }) => {
    window.kdiag?.('modal:open', { network, txid, pch })

    // reflect in the address bar so the open modal is itself shareable
    const addr = new URL(location)
    addr.searchParams.set('v', 'v2')
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

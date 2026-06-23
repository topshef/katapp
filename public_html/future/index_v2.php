<?php

// ┬┌┐┌┌┬┐┌─┐─┐ ┬  ┬  ┬┌─┐
// │││││ ││├┤ ┌┴┬┘  └┐┌┘├─┤
// ┴┘└┘─┴┘└─┘┴ └─   └┘ ┴ ┴
//
// v2 signing index — list + controls + full-screen modal.
//
// Reached only via ?v=v2 (gated in index.php), so v1 is untouched.
//
// This pass deliberately hosts the EXISTING detail page (tx_approval.php) inside
// an iframe modal. Zero widget changes, WalletConnect signing works as-is, and
// it previews exactly the modal UX we'll want when the widget is injected into
// Katomia directly (Step 2). The legacy "open in new tab" link is kept on every
// row so you can compare modal vs full-page side by side.

$docroot = $_SERVER['DOCUMENT_ROOT'];

require_once "$docroot/readenv.php";
require_once "$docroot/auth.php";
require_once "$docroot/config.php";
require_once "$docroot/assets/php/elog.php";

session_start();

require_once "$docroot/vendor/hashconnect/configLoad.php";
$network = getNetwork() ?? ($_GET['network'] ?? 'mainnet');

// deep-link params: if a txid is present we auto-open the modal on load
$txid = $_GET['txid'] ?? null;
$pch  = $_GET['pch']  ?? null;

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

                <a class="kp-v1link" href="?v=v1">legacy view</a>
              </div>

              <!-- list -->
              <div id="kp-list" class="kp-list"></div>

            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- full-screen signing modal (iframe host for now) -->
    <div id="kp-modal" class="kp-modal hidden" role="dialog" aria-modal="true">
      <div class="kp-modal-backdrop" data-kp-close></div>
      <div class="kp-modal-card">
        <button class="kp-modal-close" type="button" data-kp-close aria-label="Close">&times;</button>
        <div class="kp-modal-meta" id="kp-modal-meta"></div>
        <iframe id="kp-modal-frame" class="kp-modal-frame" allow="camera"></iframe>
      </div>
    </div>

<?php include "$docroot/footer.php"; ?>

    <!-- Bootstrap core JavaScript (kept for site chrome) -->
    <script src="vendor/jquery/jquery.min.js"></script>
    <script src="vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
    <script src="assets/js/custom.js"></script>

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
  .kp-v1link  { font-size: 12px; color: #999; }

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

  /* modal */
  .kp-modal {
    position: fixed;
    inset: 0;
    z-index: 100000;
    display: flex;
  }
  .kp-modal.hidden { display: none; }
  .kp-modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.55);
  }
  .kp-modal-card {
    position: relative;
    margin: auto;
    width: min(1100px, 96vw);
    height: 92vh;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 12px 48px rgba(0,0,0,0.35);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .kp-modal-close {
    position: absolute;
    top: 8px;
    right: 12px;
    z-index: 2;
    border: none;
    background: transparent;
    font-size: 26px;
    line-height: 1;
    color: #666;
    cursor: pointer;
  }
  .kp-modal-close:hover { color: #000; }
  .kp-modal-meta {
    padding: 10px 44px 8px 16px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    color: #888;
    border-bottom: 1px solid #eee;
    word-break: break-all;
  }
  .kp-modal-frame {
    flex: 1 1 auto;
    width: 100%;
    border: 0;
  }

  @media (max-width: 768px) {
    .kp-row {
      grid-template-columns: 1fr;
      gap: 4px;
      row-gap: 2px;
    }
    .kp-head { display: none; }
    .kp-modal-card { width: 100vw; height: 100vh; border-radius: 0; }
  }
</style>

<script>
// ┬┌─┌─┐  ┬  ┬┌─┐┌┬┐  ┌─┐  ┌┬┐┌─┐┌┬┐┌─┐┬
// ├┴┐├─┘  │  │└─┐ │   ┌─┘  ││││ │ ││├─┤│
// ┴ ┴┴    ┴─┘┴└─┘ ┴   └─┘  ┴ ┴└─┘─┴┘┴ ┴┴─┘
// v2 list + modal. Reuses existing ?action=txList endpoint and the existing
// detail page (tx_approval.php) inside the modal iframe.

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
    list:        document.getElementById('kp-list'),
    modal:       document.getElementById('kp-modal'),
    frame:       document.getElementById('kp-modal-frame'),
    modalMeta:   document.getElementById('kp-modal-meta')
  }

  els.network.value = DEEP.network || 'mainnet'

  let lastTxs = []
  let autoTimer = null

  // ── formatting ────────────────────────────────────────────────────────────

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

      renderList()
    } catch (err) {
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

      // legacy full-page detail link (v1, opens in new tab) for side-by-side compare
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

  // ── modal ─────────────────────────────────────────────────────────────────

  const openModal = ({ txid, network, pch }) => {
    // iframe loads the EXISTING detail page. Force v unset so it renders
    // tx_approval (not the v2 index) — avoids index-inside-iframe recursion.
    const u = new URL(location.pathname, location.origin)
    u.searchParams.set('network', network)
    u.searchParams.set('txid', txid)
    if (pch) u.searchParams.set('pch', pch)

    els.frame.src = u.toString()
    els.modalMeta.textContent = `${network}  ·  ${txid}${pch ? '  ·  #' + pch : ''}`
    els.modal.classList.remove('hidden')
    document.body.style.overflow = 'hidden'

    // reflect in the address bar so the modal is itself deep-linkable / shareable
    const addr = new URL(location)
    addr.searchParams.set('v', 'v2')
    addr.searchParams.set('network', network)
    addr.searchParams.set('txid', txid)
    if (pch) addr.searchParams.set('pch', pch)
    history.replaceState(null, '', addr)
  }

  const closeModal = () => {
    els.modal.classList.add('hidden')
    els.frame.src = 'about:blank'
    document.body.style.overflow = ''

    const addr = new URL(location)
    addr.searchParams.delete('txid')
    addr.searchParams.delete('pch')
    history.replaceState(null, '', addr)
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

  els.modal.addEventListener('click', e => {
    if (e.target.hasAttribute('data-kp-close')) closeModal()
  })

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !els.modal.classList.contains('hidden')) closeModal()
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

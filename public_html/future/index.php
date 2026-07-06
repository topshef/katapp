<?php 

//list of scheduled transactions in queue for execution or approval

//direct to api if action parameter is supplied
if (isset($_GET['action'])) {  // js async calls hit here
	require_once('kpool.php');   // 
	exit;
}

$docroot = $_SERVER['DOCUMENT_ROOT'];

require_once "$docroot/readenv.php";
require_once "$docroot/auth.php";
require_once "$docroot/config.php";
require_once "$docroot/assets/php/elog.php";


session_start(); // not needed with configLoad

require_once "$docroot/vendor/hashconnect/configLoad.php";
// $config = getConfig();
// elog([$config, $_SESSION], "hashconnect config and session");
$network = getNetwork() ?? $_GET['network'];


// $network = $_GET['network'];
$txid = $_GET['txid'] ?? null;
$pch  = $_GET['pch'] ?? null;

// ┬  ┬┌─┐  ┌┬┐┌─┐┌─┐┌─┐┬  ┌─┐
// └┐┌┘┌─┘   │ │ ││ ┬│ ┬│  ├┤
//  └┘ └─┘   ┴ └─┘└─┘└─┘┴─┘└─┘
// New modal-based index. Opt-in via ?v=v2 only, so v1 below is unchanged.
// In v2 we do NOT short-circuit to tx_approval on ?txid= — the v2 page renders
// the list and auto-opens the txid in a modal instead (the modal iframes the
// detail page, which is still served by the v1 path below when v is unset).
$v = $_GET['v'] ?? 'v2';
if ($v === 'v2') {
    require_once __DIR__ . '/index_v2.php';
    exit;
}

// ── legacy v1 (unchanged) ──────────────────────────────────────────────────

$useKpool = $_GET['kpool'] ?? 1;
if (!$useKpool)
    require_once('zindex_deprecating.php');

$custom_style = '<link rel="stylesheet" type="text/css" href="future/future.css">';


if ($txid) exit(include('tx_approval.php'));

$path_base = "https://{$_SERVER['SERVER_NAME']}";

//require_once "{$_SERVER['DOCUMENT_ROOT']}/config.php";	


	$html_viewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
//'<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">';


$docroot = $_SERVER['DOCUMENT_ROOT'];
require_once "$docroot/elog.php";


require_once "$docroot/headheader.php";	



?>
    <!-- Page Content -->
    <div class="page-heading header-text"  style="background-image: url('<?php echo $content['checkout'][1]['imgsrc']; ?>'); padding-top: 120px;padding-bottom: 60px;">
      <div class="container">
        <div class="row">
          <div class="col-md-12">
            <h1>OPEN OFFERS</h1>
            <span>Sign to approve</span>
          </div>
        </div>
      </div>
    </div>


    <div class="callback-form contact-us" style="padding-top: 10px; margin-top: 0px;">
      <div class="container">

            <div class="contact-form">

                <div class="row">
                  <div class="col-lg-12">
<p>Select a queued transaction to review/sign</p>

 									
								</div>
<BR>
<div id="kpool-banner" class="mb-4"></div>

<div id="kpool-container"></div>
<div  class='bidtable'>
<?php echo $html_list; ?>
</div>


								
                  </div>
                </div>

            </div>

    
      </div>
    </div>




<?php  include "{$_SERVER['DOCUMENT_ROOT']}/footer.php";	?>

    <!-- Bootstrap core JavaScript -->
    <script src="vendor/jquery/jquery.min.js"></script>
    <script src="vendor/bootstrap/js/bootstrap.bundle.min.js"></script>

    <!-- Additional Scripts -->
    <script src="assets/js/custom.js"></script>
    <script src="assets/js/owl.js"></script>
    <script src="assets/js/slick.js"></script>
    <script src="assets/js/accordions.js"></script>

  <?php require_once("$docroot/vendor/walletconnect/kwcScriptTag.php"); ?>


    <script>
		
		//legacy pre-kpool ... to remove once kpool established

        function getQueryParam(key) {
          const urlParams = new URLSearchParams(window.location.search)
          return urlParams.get(key)
        }

        function filterBids() {
          const accountId = getQueryParam('accountId')
          const tokenId = getQueryParam('tokenId')

          document.querySelectorAll('.bidgroup').forEach(group => {
            const accounts = JSON.parse(group.dataset.accounts || '[]')
            const tokens = JSON.parse(group.dataset.tokens || '[]')

            const matchesAccount = !accountId || accounts.includes(accountId)
            const matchesToken = !tokenId || tokens.includes(tokenId)

            group.style.display = (matchesAccount && matchesToken) ? '' : 'none'
          })
        }

        window.addEventListener('DOMContentLoaded', filterBids)
    </script>

	<script>
	
// ┬  ┌─┐┌─┐┌─┐┌─┐┬ ┬  ┌┬┐┌─┐┌─┐┌─┐┬  ┌─┐
// │  ├┤ │ ┬├─┤│  └┬┘   │ │ ││ ┬│ ┬│  ├┤ 
// ┴─┘└─┘└─┘┴ ┴└─┘ ┴    ┴ └─┘└─┘└─┘┴─┘└─┘
// legacy toggle
	
	;(function() {
		const c = document.getElementById('kpool-banner')
		if (!c) return

		if (!c.style.position) c.style.position = 'relative'

		const label = document.createElement('label')
		label.innerHTML = `<input type="checkbox"> kpool`

		Object.assign(label.style, {
			position: 'absolute',
			top: '-25px',
			left: '-10px',
			display: 'inline-flex',
			alignItems: 'center',
			gap: '6px',
			fontSize: '13px',
			background: '#fff',
			padding: '2px 6px',
			borderRadius: '4px',
			zIndex: 9999
		})

		const input = label.querySelector('input')

		// reset any insane global CSS
		input.style.all = 'revert'

		const params = new URLSearchParams(location.search)
		input.checked = params.get('kpool') !== '0'

		input.onchange = () => {
			const p = new URLSearchParams(location.search)
			p.set('kpool', input.checked ? '1' : '0')
			location.search = p.toString()
		}

		c.appendChild(label)
	})()
	</script>


<script>
// ┬┌─┌─┐┌─┐┌─┐┬    ┌┬┐─┐ ┬  ╦  ┬┌─┐┌┬┐
// ├┴┐├─┘│ ││ ││     │ ┌┴┬┘  ║  │└─┐ │ 
// ┴ ┴┴  └─┘└─┘┴─┘   ┴ ┴ └─  ╩═╝┴└─┘ ┴ 
// kpool tx List

function formatRemaining(ts) {
  const now = Math.floor(Date.now() / 1000)
  const diff = ts - now

  const abs = Math.abs(diff)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60).toString().padStart(2,'0')
  const s = Math.floor(abs % 60).toString().padStart(2,'0')

  const sign = diff >= 0 ? '+' : '-'
  return `${sign} ${h}:${m}:${s}`
}


async function loadTxList() {

  if (new URLSearchParams(location.search).get('kpool') === '0')
    return

  const el = document.getElementById('kpool-container')
  if (!el) return

  el.style.textAlign = 'left'
  el.style.fontFamily = 'monospace'

	const parms = new URLSearchParams(location.search)
  const network = parms.get('network') || '<?php echo $network ?>'
	const since = parms.get('since') || 600
	const until = parms.get('until') || 600

  const res = await fetch(`/future/?action=txList&network=${network}&since=${since}&until=${until}`)
  const txs = (await res.json())?.result?.tx || []

  txs.sort((a, b) => a.txid.split('@')[1] - b.txid.split('@')[1])

  // IMPORTANT: clear before re-rendering
  el.innerHTML = ''

  el.insertAdjacentHTML('beforeend',
    txs.filter(t => t.type === 'tx').map(t => {

      const u = new URL(location)
      u.searchParams.set('network', t.network)
      u.searchParams.set('txid', t.txid)

      const ts = Number(t.txid.split('@')[1])
      const remaining = formatRemaining(ts)
      const utc = new Date(ts * 1000)
        .toISOString().slice(0,19).replace('T',' ') + ' UTC'

      return `
        <div>
          <span>${remaining}</span>
          <b>${t.network}</b>
          <a href="${u}" target="_blank" rel="noopener">${t.txid}</a>
          ${t.pch}
          ${utc}
        </div>
      `
    }).join('')
  )
}


document.addEventListener('DOMContentLoaded', () => {
  loadTxList()
  // setInterval(loadTxList, 5000)
})


</script>

<style>
  #kpool-banner {
    width: 100%;
    display: block;
    margin-bottom: 20px;
  }

  #kpool-banner > div {
    padding: 15px;
    background: #f8f9fa;
    border-radius: 6px;
  }

	#kpool-banner > div > * {
		margin: 8px 0;
	}
</style>
<script>

	// ┌┬┐┌─┐┌┬┐┌─┐  ┌┬┐┌─┐┌─┐┬    ┌─┐┌─┐  ┌┬┐┌─┐┬ ┬
	//  ││├┤ ││││ │   ││├┤ ├─┤│    │ │├┤    ││├─┤└┬┘
	// ─┴┘└─┘┴ ┴└─┘  ─┴┘└─┘┴ ┴┴─┘  └─┘└    ─┴┘┴ ┴ ┴ 
	// demo deal of day



	async function getDealOfDay() {
		try {
      
			const parms = new URLSearchParams(location.search)
      const network = parms.get('network') || '<?php echo $network ?>'

			const starttime = parms.get('starttime') || '40seconds'

      const userAccountId = await window.WC?.getAccount?.()
      
      // if (!userAccountId) userAccountId = 

      if (!userAccountId)
        return window.alert('Please connect your wallet first\n wip ref KJ93843')

			console.log(userAccountId)
		
			const query = new URLSearchParams({ userAccountId, starttime })
			const url = `/m/bid/kmm/demo1?${query}`
			const response = await fetch(url)

			if (!response.ok)
				throw new Error('Network response was not ok')

			const data = await response.json()
			console.log(data, `result of ${url}`)
			if (!data.txid || !data.network)
				throw new Error('txid or network missing in response')

			const txid = String(data.txid).toLowerCase()
      if (network != data.network) {
        const msg = `EW38984 network mismatch url (${network}) vs api (${data.network})`
        console.warn(msg, data)
        return
			}
      // const network = data.network

			const u = new URL(location)
			u.searchParams.set('network', data.network)
			u.searchParams.set('txid', txid)

			const linkEl = document.getElementById('linkDealOfDay')
			if (linkEl)
				linkEl.innerHTML = `<a href="${u}" target="_blank" rel="noopener">${txid}</a>`

			return txid

		} catch (err) {
			console.error('Error fetching TXID:', err)
		}
	}

	document.addEventListener('DOMContentLoaded', () => {

		const container = document.getElementById('kpool-banner')
		if (!container) return

		const wrapper = document.createElement('div')
		wrapper.style.marginTop = '20px'

		const btn = document.createElement('button')
		btn.id = 'btnDealOfDay'
		btn.textContent = 'Deal of the day!'
		btn.style.marginRight = '10px'

		const div = document.createElement('div')
		div.id = 'linkDealOfDay'

		btn.addEventListener('click', getDealOfDay)

		wrapper.appendChild(btn)
		wrapper.appendChild(div)
		container.appendChild(wrapper)

	})
</script>

  </body>
</html>

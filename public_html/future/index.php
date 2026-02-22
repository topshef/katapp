<?php 

//list of scheduled transactions in queue for execution or approval

//direct to api if action parameter is supplied
if (isset($_GET['action'])) {
	require_once('kpool.php');
	exit;
}


require_once "{$_SERVER['DOCUMENT_ROOT']}/readenv.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/auth.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/config.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/assets/php/elog.php";


session_start(); // not needed with configLoad

require_once "{$_SERVER['DOCUMENT_ROOT']}/vendor/hashconnect/configLoad.php";
// $config = getConfig();
// elog([$config, $_SESSION], "hashconnect config and session");
$network = getNetwork() ?? $_GET['network'];


// $network = $_GET['network'];
$txid = $_GET['txid'] ?? null;

$useKpool = $_GET['kpool'] ?? 1;
if (!$useKpool)
    require_once('zindex_deprecating.php');

$custom_style = '<link rel="stylesheet" type="text/css" href="future/future.css">';


if ($txid) exit(include('tx_approval.php'));

$path_base = "https://{$_SERVER['SERVER_NAME']}";

//require_once "{$_SERVER['DOCUMENT_ROOT']}/config.php";	


	$html_viewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
//'<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">';


require_once "{$_SERVER['DOCUMENT_ROOT']}/headheader.php";	



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

    <script>
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
	;(function() {
		const c = document.getElementById('kpool-container')
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
document.addEventListener('DOMContentLoaded', async () => {

  if (new URLSearchParams(location.search).get('kpool') === '0') return

  const el = document.getElementById('kpool-container')
  if (!el) return

  const network =
    new URLSearchParams(location.search).get('network')
    || '<?php echo $network ?>'

  const res = await fetch(`/future/?action=txList&network=${network}&since=600&until=600`)
  const txs = (await res.json())?.result?.tx || []

  el.insertAdjacentHTML('beforeend',
    txs.filter(t => t.type === 'tx').map(t => {
      const u = new URL(location)
      u.searchParams.set('network', t.network)
      u.searchParams.set('txid', t.txid)

      const utc = new Date(t.txid.split('@')[1] * 1000)
        .toISOString().slice(0,19).replace('T',' ') + ' UTC'

      return `
        <div>
          <b>${t.network}</b>
          <a href="${u}">${t.txid}</a>
          ${t.pch}
          ${utc}
        </div>
      `
    }).join('')
  )

})
</script>
  </body>
</html>



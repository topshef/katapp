<?php 

//list of scheduled transactions in queue for execution or approval

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

$subfolder = $_GET['subfolder'] ?? 'current';
if ($txid) $subfolder = '*';

$format = $_GET['format'] ?? 'html_simpleNFT';

$saas_domain = $_GET['saas_domain'] ?? $_SESSION['last_saas_domain'] ?? false; 

if ($_SESSION['network_override'] && !$saas_domain) // default saas_domain if network switched
    $saas_domain = ($network == 'testnet') ? 'dev.gomint.me' : 'gmws2.gomint.me';

if ($saas_domain) $urlTxAppnet = "https://$saas_domain/api/hashconnect";
else $urlTxAppnet = $env['url_api_tx_appnet'] ?? $env['url_api_gomint_hashconnect']; // tbc how to refactor this shite .. 1. create a wrapper to fetch data, 2. migrate to kpos

$urlTxAppnet = rtrim($urlTxAppnet, '/');

// $mempool = 'kpool';
$mempool = 'kfund';
$querystring = http_build_query(compact('network', 'format', 'mempool', 'subfolder'));

$url .= "$urlTxAppnet/txList.php?base=future&$querystring";
//network=$network&format=$format&base=future&subfolder=$subfolder
// review... migrate to kpos and render json client side

if ($txid) $url .= "&txid=$txid";
if ($isDev) $url .= "&dev";
if ($_GET['ksig']) $url .= "&ksig=1";

elog("calling $url");
$html_list = file_get_contents($url);
if ($txid && $isAdmin) $html_list_v2 = file_get_contents("$url&v=v2");


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
<BR><BR>

<div class='bidtable'>
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



  </body>
</html>



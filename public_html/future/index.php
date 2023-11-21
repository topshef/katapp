<?php 

//list of scheduled transactions in queue for execution or approval

require_once "{$_SERVER['DOCUMENT_ROOT']}/readenv.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/auth.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/config.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/assets/php/elog.php";


session_start();

$network = $_GET['network'];
$txid = $_GET['txid'] ?? null;

$subfolder = $_GET['subfolder'] ?? 'current';
if ($txid) $subfolder = '*';

$format = $_GET['format'] ?? 'html_simpleNFT';

$urlTxAppnet = $env['url_api_tx_appnet'] ?? $env['url_api_gomint_hashconnect'];
$urlTxAppnet = rtrim($urlTxAppnet, '/');

$url = "$urlTxAppnet/txList.php?network=$network&format=$format&base=future&subfolder=$subfolder";
if ($txid) $url .= "&txid=$txid";

error_log("calling $url");
$html_list = file_get_contents($url);

$custom_style = '<link rel="stylesheet" type="text/css" href="future/future.css">';

if ($txid != null) {
	include('tx_approval.php');
	exit;
}

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



  </body>
</html>



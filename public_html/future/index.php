<?php 

//list of scheduled transactions in queue for execution or approval

require_once "{$_SERVER['DOCUMENT_ROOT']}/readenv.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/auth.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/config.php";


session_start();

$network = $_GET['network'];
$txid = $_GET['txid'] ?? null;

$subfolder = $_GET['subfolder'] ?? 'current';

if ($txid != null) {
	include('tx_approval.php');
	exit;
}

$url = "{$env['url_api_gomint_hashconnect']}txList.php?base=future&subfolder=$subfolder";
$html_list = file_get_contents($url);


$path_base = "https://{$_SERVER['SERVER_NAME']}";

//require_once "{$_SERVER['DOCUMENT_ROOT']}/config.php";	
require_once "{$_SERVER['DOCUMENT_ROOT']}/headheader.php";	


?>
    <!-- Page Content -->
    <div class="page-heading header-text"  style="background-image: url('<?php echo $content['checkout'][1]['imgsrc']; ?>'); padding-top: 120px;padding-bottom: 60px;">
      <div class="container">
        <div class="row">
          <div class="col-md-12">
            <h1>Scheduled trades</h1>
            <span>Sign to approve</span>
          </div>
        </div>
      </div>
    </div>


    <div class="callback-form contact-us" style="padding-top: 10px; margin-top: 20px;">
      <div class="container">

            <div class="contact-form">

                <div class="row">
                  <div class="col-lg-12">
<p>Select a queued transaction to review/sign</p>

 									
									
								</div>
								<BR><BR>

<div> 
<?php echo $html_list; ?>
</div>


					<script type="text/javascript" src="../vendor/hashconnect/dist/bundle.js"></script>

								<BR><BR>


								
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



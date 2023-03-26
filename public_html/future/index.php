<?php 

//list of scheduled transactions in queue for execution or approval

require_once "{$_SERVER['DOCUMENT_ROOT']}/readenv.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/auth.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/config.php";


session_start();

$network = $_GET['network'];
$txid = $_GET['txid'] ?? null;

$subfolder = $_GET['subfolder'] ?? 'current';
if ($txid) $subfolder = '*';

$format = $_GET['format'] ?? 'html_simpleNFT';

$url = "{$env['url_api_gomint_hashconnect']}txList.php?network=$network&format=$format&base=future&subfolder=$subfolder&query=$txid";
$html_list = file_get_contents($url);

if ($txid != null) {
	include('tx_approval.php');
	exit;
}


$path_base = "https://{$_SERVER['SERVER_NAME']}";

//require_once "{$_SERVER['DOCUMENT_ROOT']}/config.php";	


$custom_style = "
<style>
a { text-decoration: none; }
				
	a:hover {font-weight: 800;}

	.success {color: green;}

	.notsigned {color: orange;}

	.signed {color: green;} 
	
	pre {
    text-align: left;
	}

	


.bidtable {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  grid-gap: 10px;
  /* margin: 0 5px 10px 5px;  */
  margin: 0 auto;  Center the container horizontally */
  max-width: 100%; /* Set a maximum width for the container */


}

.bidrow {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  /* grid-template-columns: repeat(4, 25%);  */
  grid-gap: 10px;
  align-items: center;
  align-items: flex-start;

 
}

.bidcell {
  text-align: left;
  padding: 10px;
}

@media only screen and (max-width: 600px) {

	/*
	.bidtable {
		margin: 0 0px;
	  }
	  
	  */
	  
	  
	.bidrow {
		grid-template-columns: repeat(1, 1fr); /* Set a single column for smaller screens */

		border-bottom: 1px solid #ccc; /* Add a border to the bottom of each row */
		padding-bottom: 10px; /* Add padding to the bottom of each row */
	  }

	.bidcell {
		/* width: 100% !important; */
		/* padding: 5px; */
		grid-column: 1 / -1; /* Set each bidcell to span the full width of the row */
		/* border-bottom: 5px solid red;  test only */
	}

}


</style>	
";


	$html_viewport = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
//'<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">';


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



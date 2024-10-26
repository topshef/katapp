<!--

//tire kickign discovery

// eg 
// https://dev4.shop.gomint.me/m/bid/?network=mainnet&size=10&tokenId=0.0.878200


-->
<head>

    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- Bootstrap CSS -->
    <link href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" rel="stylesheet">

    <!-- Optional Bootstrap JavaScript and dependencies -->
    <script src="https://code.jquery.com/jquery-3.5.1.slim.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@4.5.2/dist/js/bootstrap.bundle.min.js"></script>
    
    <link href="ubid.css" rel="stylesheet">

</head>
<body>

<div class="sticky-header">
    <div class="container">
        <h4>UBID</h4>
        <!-- Placeholder for future elements like login, filters, etc. -->

        <!-- todo add in search filters etc. to update url. see also modal -->

        <!-- wallet stuff copied from OG 
        may replace with walletconnect but for tire kicking this will be ok
        plus hashpack is the leader anyway
        -->
            <!-- Wallet Connection Buttons -->
            <link rel="stylesheet" type="text/css" href="/assets/css/wallet.css">

            <br>
            <div class="show" id='before-pair'>
                <!-- Connect Hashpack -->
                <button class='wallet-button' id='pair-btn'>
                    <img src='/assets/images/hashpack-icon-blue-trans.png' width=30> Connect your Hashpack wallet &nbsp
                </button>&nbsp;

                <!-- Connect Blade .. prpbably not working.. use walletconnect
                <button class='wallet-button' id='pair-blade-btn'>
                    <img src='/assets/images/bladelogoblackpadded.png' width=30> Connect your Blade wallet &nbsp
                </button>&nbsp;
                 -->
            </div>

            <span class='hide' id='pairing'>
                <p>Check your Hashpack wallet..</p>
            <!-- for QR need to fix path to qr process
                <span>Scan with <a href='https://www.hashpack.app/download' target='hashpack'>Hashpack app</a></span>
                <span id="pairing-png"></span>
                <span style='color:grey; font-size: 70%;'>
                    <br>Or copy-paste this "pairing string"
                    <div id="pairing-string"></div>
                </span><br><br>
                -->
            </span>

            <div class="hide" id="paired">
                <div style="display: block;">
                    <span style="padding: 5px;">
                        Choose account
                    </span>
                    <span style="white-space: nowrap;">
                        <select class='wallet-button' id="account-id"></select>&nbsp;
                        <button id="pair-btn" class='wallet-button tooltip-p'> &plus;
                            <span class="tooltiptext-p">Connect another account</span>
                        </button>&nbsp;
                        <button class="wallet-button tooltip-p" id="disconnect"> ✕
                            <span class="tooltiptext-p">Disconnect</span>
                        </button>
                    </span>
                </div>
                <!-- this bid button widget is hidden parked here
                so that bundle.js event listener works and persists
                when this widget is used across different modals
                -->
                <span id="bid-widget-parked" style="display: none;">
                    <span id="bid-widget">
                        <button id="create-tx" class="wallet-button"></button>
                        <div id="last_tx"></div>
                    </span>
                </span>
            </div>

      

    </div>
</div>


<div id="modal" class="modal">
  <div class="modal-content">
    <span class="close-button">&times;</span>
    <div id="modal-body">
      <!-- Modal content will be injected here -->
    </div>
  </div>
</div>



    <script src="ubid2.js"></script>
    <!-- <script src="https://unpkg.com/localbase/dist/localbase.min.js"></script> -->
    <script src="localbase.min.js"></script> <!-- beware spelling of Localbase -->
    <script src="localCacheDB.js"></script>
    <script src="localCacheIFPS.js"></script> 
    

<script>

    
    
    let network = 'mainnet'
    
    document.addEventListener('DOMContentLoaded', async () => {
        // Requires ubid2.js
        await initUbid()
    })

</script>

<?php // OG fudge for config flexibility while testing
$pathConfig = "{$_SERVER['DOCUMENT_ROOT']}/vendor/hashconnect/config.json";
if (file_exists($pathConfig)) {
    $jsonConfig = file_get_contents($pathConfig);
    $config = json_decode($jsonConfig);    
    // $config = json_decode(file_get_contents($pathConfig));
    $network = $config->network ?? null;
    if (!$network) elog($config, "UH73664 failed to read network from $pathConfig");
} else elog("warning: WJ73764 failed to find config file $pathConfig");

?>
<script>
let jsonConfig = `<?=$jsonConfig?>`
</script>
<script src="/vendor/hashconnect/dist/bundle.js"></script> 



</body>

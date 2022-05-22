<?php

if ($token_name == null)
$token_name = $token_instance_name; if ($token_name == null) $token_name = $token_class['name']; // todo fix on gm api
 
$link_withdraw = ($status == 'fulfil-private') ? '' : "<a href='./withdraw.php?productId=$productId&recipientId={$default_recipient_id}'>withdraw it now</a>";
//exit($link_withdraw ;


$balance = getTokenBalanceForAccount($tokenId, $default_recipient_id, $network);
//$_SESSION['log'][time()]= "token $tokenId balance for ac $default_recipient_id is $balance";

if ($balance == null && $wallet == 'custodial (escrow)') $link_withdraw = "<a href=''https://medium.com/@tayloa17/how-to-associate-tokens-on-hedera-fd17ef65285a'>token associate</a> to withdraw";

if ($network == 'mainnet') $network = 'Hedera';
//if ($network == 'mainnet') $network = "<img src='./assets/images/hedera-hbar-logo.svg' width=25>";

//<BR>balance in $default_recipient_id is $balance


echo <<<EOLIST
          <li class="list-group-item">
               <div class="row">
                    <div class="col-6">
                         <a href='./product-details.php?productId=$productId'><img  
						 style="object-fit: cover; width:50px; height:50px;"
						 src='$token_asset_image_URL' alt='' height='50'></a>
						 &nbsp <strong>$token_name</strong> $network $tokenId
						 
                    </div>
                    <div class="col-6 text-right">
                         <strong>$wallet</strong><BR>$link_withdraw
                    </div>
               </div>
          </li>
EOLIST;

$token_name = null;

//https://stackoverflow.com/questions/15167545/how-to-crop-a-rectangular-image-into-a-square-with-css
// above is glitchy, maybe try
// aspect-ratio: 1/1;	  
		  
?>
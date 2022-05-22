<?php

if ($token_name == null)
$token_name = $token_instance_name; if ($token_name == null) $token_name = $token_class['name']; // todo fix on gm api

//$item = "$network $tokenId $seller $remove";
$remove = "<a href='./removeFromCart.php?product_id=$productId'>remove</a>";
		
$amount = ($volume == 1) ? '' : "$volume x ";
$amount .= "$price $unit";

                    // <div class="col-6">
                         // $item
                    // </div>
					
echo <<<EOLIST
          <li class="list-group-item">
               <div class="row">

					<div class="col-8">
                         <a href='./product-details.php?productId=$productId'><img  
						 style="object-fit: cover; width:50px; height:50px;"
						 src='$token_asset_image_URL' alt='' height='50'></a>
						 &nbsp <strong>$token_name</strong> $network $tokenId $remove
                    </div>					

                    <div class="col-4 text-right">
                          <strong>$amount</strong>
                    </div>
               </div>
          </li>
EOLIST;
	  
		  
?>
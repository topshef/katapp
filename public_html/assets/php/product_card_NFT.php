<?php

$token_name = $token_instance_name;
if ($token_name == null) $token_name = $token_class['name'];

//market info
if (isset($market_info)) {	
	$price = $market_info['price'];
	$unit = $market_info['unit'];
	$symbol = $unit;
	if ($unit == 'hbar') $symbol = 'ℏ';
	if ($unit == 'USD') $symbol = '$';

	if ($price == null) $banner_price = null;
		else $banner_price = "$symbol $price";
		//else $banner_price = "<del><sup>$unit</sup>$oldPrice </del> &nbsp; <sup>$unit</sup>$price";
} else $banner_price = '';

require_once('functions.php');
$token_instance_description = shortenText($token_instance_description);

//https://shop.music.gomint.me/product-details.php?productId=mainnet;0.0.571591;H488152

//$tokenName = urldecode($tokenName);
echo <<<EOCARD
          <div class="col-md-4">
            <div class="service-item">
              <a href="m?$productId">
			  <img class="dropshadow" src="$token_asset_image_URL" alt=""></a>
              <div class="down-content">
                <h4>$token_name</h4>
                <div style="margin-bottom:10px;">
                  <span>
                      $banner_price
                  </span>
                </div>

                <p> $token_instance_description </p>
                <a href="m?$productId" class="filled-button">View More</a>
              </div>
            </div>

            <br>
          </div>
EOCARD;
?>

<?php

$btnLabelViewDeal = $content['theme'][1]['btnLabelViewDeal'] ?? 'View deal';

// first para only
$shortDealDescription = explode("<BR>", $dealDescription)[0];

echo <<<EOCARD
          <div class="col-md-4">
            <div class="service-item">
              <img src="$dealThumbnail" alt="">
              <div class="down-content">
                <h4>$dealTitle</h4>
                <p> $shortDealDescription </p>
                <a href="m?dealonly&dealId=$dealId&network=$dealNetwork" class="filled-button">$btnLabelViewDeal</a>
              </div>
            </div>

            <br>
          </div>
EOCARD;
?>

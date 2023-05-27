<?php

echo <<<EOCARD
          <div class="col-md-4">
            <div class="service-item">
              <img src="$dealThumbnail" alt="">
              <div class="down-content">
                <h4>$dealTitle</h4>
                <p> $dealDescription </p>
                <a href="m?dealonly&dealId=$dealId&network=$dealNetwork" class="filled-button">View More</a>
              </div>
            </div>

            <br>
          </div>
EOCARD;
?>

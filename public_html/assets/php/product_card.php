<?php
$tokenName = urldecode($tokenName);
echo <<<EOCARD
          <div class="col-md-4">
            <div class="service-item">
              <img src="$tokenAssetURL" alt="">
              <div class="down-content">
                <h4>$tokenName</h4>
                <div style="margin-bottom:10px;">
                  <span>
                      <del><sup>$</sup>1999 </del> &nbsp; <sup>$</sup>1779
                  </span>
                </div>

                <p> $tokenDescription </p>
                <a href="product-details.php?productId=$productId" class="filled-button">View More</a>
              </div>
            </div>

            <br>
          </div>
EOCARD;
?>

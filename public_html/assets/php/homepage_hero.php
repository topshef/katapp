<?php

//products.php

// $slider[1]['key'] = '3';
// $slider[1]['imgsrc'] = 'https://dev.shop.gomint.me/aimeos/1./preview/3/5/35b45e6e_55ed24e9-iggy-banner-1.jpg';
// $slider[1]['title'] = 'title3';
// $slider[1]['subtitle'] = 'subtitle3';
// $slider[1]['text'] = 'text3';
// $slider[1]['href'] = 'https://dev.shop.gomint.me/';
// $slider[1]['button_text'] = 'Go!';

//extract($slider[1]);

//<del><sup>$</sup>2000.00</del>  <sup>$</sup>1700.00

echo <<<EOHERO
          <div class="col-md-4">
            <div class="service-item">
              <img src="$imgsrc" alt="">
              <div class="down-content">
                <h4>$title</h4>
                <div style="margin-bottom:10px;">
                  <span>$subtitle</span>
                </div>

                <p>$text</p>
                <a href="$href" class="filled-button">$button_text</a>
              </div>
            </div>
            
            <br>
          </div>
EOHERO;
  
?>
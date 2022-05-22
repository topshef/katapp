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
$html_button = ($button_text == null) ? '' : "<a href='$href' class='filled-button'>$button_text</a>";

echo <<<EOSLIDER
          <div class="item item-$key">
            <div class="img-fill"  style="background-image: url('$imgsrc'); $imgstyle">
                <div class="text-content">
                  <h6>$title</h6>
                  <h4>$subtitle</h4>
                  <p>$text</p>
                  $html_button
                </div>
            </div>
          </div>
EOSLIDER;

unset($imgsrc, $imgstyle);
//foreach ($tokenInfo as $k => $v) unset($$k); // not working due to include mechanism somehow

/*

.Modern-Slider .item-2 .img-fill {
	background-image: url(../images/slider-image-2-1920x900.jpg);
}

*/		  
?>
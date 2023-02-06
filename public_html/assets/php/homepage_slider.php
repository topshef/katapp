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

if (isset($youtube)) // wip https://chat.openai.com/chat/0eebfaa1-0625-41f0-b57c-c5a837fae458
	echo <<<EOSLIDER_YOUTUBE
          <div class="item item-$key">
		  <script src="https://www.youtube.com/iframe_api"></script>
			<div class="img-fill">

			  <style> 
			  :root {
  --video-width: 100vw;
  --video-height: 100vh;
}
			  #video-container {
  // width: 100vw;
  // height: 100vh;
  
  width: var(--video-width);
  height: var(--video-height);

  // transform: translate(0%, -50%);
// top: 50%;
  // left: 50%;
  object-fit: cover;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
}


@media (min-aspect-ratio: 16/9) {
  .video-container {
    /* height = 100 * (9 / 16) = 56.25 */
    //height: 56.25vw;
	--video-height: 56.25vw;
  }
}
@media (max-aspect-ratio: 16/9) {
  .video-container {
    /* width = 100 / (9 / 16) = 177.777777 */
    //width: 177.78vh;
	 --video-width: 177.78vh;
  }
}

//i don't think this does anything
//https://chat.openai.com/chat/0eebfaa1-0625-41f0-b57c-c5a837fae458

.ytp-title-text {
  display: none;
}

.ytp-chrome-top {
  display: none;
}

</style>
			  <div id="video-container"></div>
			  <script>
			  
			  var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

var player;
function onYouTubeIframeAPIReady() {
  player = new YT.Player('video-container', {
    height: '100%',
    width: '100%',
	
	//$youtube
	videoId: '$youtube',
    //videoId: 'kSrdnp6FXgo',
	//videoId: 'RjEdmrxjIHQ',
	//
    playerVars: {
      autoplay: 1,
      controls: 0,
      rel: 0,
      showinfo: 0,
      enablejsapi: 1,
      mute: 1
    },
    events: {
      'onReady': onPlayerReady,
	  'onStateChange': onPlayerStateChange
    },
	origin: 'https://{$_SERVER['SERVER_NAME']}'
  });
}

function onPlayerReady(event) {
  event.target.mute();
  //event.target.seekTo(8);
  event.target.playVideo();
}

function onPlayerStateChange(event) {
  
  if (event.data === YT.PlayerState.ENDED) {
	//event.target.seekTo(2);
	event.target.seekTo(0);
	event.target.playVideo();
  }
  

	//console.log('Current time: ' + player.getCurrentTime());


  // if (player.getCurrentTime() >= 5) {
    // event.target.seekTo(3);
  // }
}

</script>

			</div>
          </div>
EOSLIDER_YOUTUBE;

else echo <<<EOSLIDER
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
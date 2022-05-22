<?php

// various snippets used around the site, and kinda env

// for testing
$isAdmin = ($_SERVER['REMOTE_ADDR'] == '130.185.251.53');
$isDirect = (__FILE__ == $_SERVER["SCRIPT_FILENAME"]);

if ($isAdmin && $isDirect) echo "<PRE>" . print_r(get_defined_vars(),true);


// export
// foreach (range(1,4,1) as $k)
	// foreach ($slider[$k] as $field => $value) $out .= "$field\t$value\r\n";

// file_put_contents(__DIR__ . '/tmp.txt', $out);



	// ┬─┐┌─┐┌─┐┌┬┐  ┌─┐┌─┐┌─┐┬ ┬┌─┐┌┬┐  ┌─┐┌─┐┌┐┌┌┬┐┌─┐┌┐┌┌┬┐
	// ├┬┘├┤ ├─┤ ││  │  ├─┤│  ├─┤├┤  ││  │  │ ││││ │ ├┤ │││ │ 
	// ┴└─└─┘┴ ┴─┴┘  └─┘┴ ┴└─┘┴ ┴└─┘─┴┘  └─┘└─┘┘└┘ ┴ └─┘┘└┘ ┴ 
	
	// $files = glob('.content*.json');
	// array_multisort(array_map('filemtime', $files), SORT_DESC, $files);  // latest first
	// $path_content = $files[0];
	
	//$content = json_decode(file_get_contents(__DIR__ . "/$path_content"), true);
	$content = json_decode(file_get_contents(__DIR__ . '/content.json'), true);
	
	
	if ($isAdmin && isset($_GET['showcontent'])) {echo "<PRE>" . print_r($content, true); exit; }



// replace logo

//if ($html_logo == null) $html_logo = "<img src='{$content['logo'][1]['url']}' height='40'>";
$html_logo = $content['logo'][1]['html_logo'];



//$default_sellers = 'H613242,H323385,H603884,H488152,H342353';
$default_sellers = $content['product'][0]['default_sellers'];


$title = $content['general'][1]['title'];
//$title = "GoMusic"; 

//$html_logo = "<img src='./assets/images/gomusic_logo.png' height='40'>";


$html_meta = $content['general'][1]['html_meta'];
//$html_meta = '<meta property="og:image" content="./assets/images/gm_icon.png">';


$html_meta = $content['general'][1]['html_link_rel'];
//$html_link_rel = '<link rel="icon" href="./assets/images/gm_icon.png"/>';

$company_website = $content['general'][1]['company_website'];
//$company_website = "https://gomint.co";

$company_name = $content['general'][1]['company_name'];
//$company_name = "GoMusic";

$html_copyright = "Copyright © 2022 <a href='$company_website'>$company_name</a>";

$twitter_handle = $content['general'][1]['twitter_handle'];
//$twitter_handle = 'gomintme';


?>

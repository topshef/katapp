<?php 

// echo basename($_SERVER['REQUEST_URI']);
// exit;

session_start();
//require_once(__DIR__ . '/config.php'); //redundant but hey. is it?
require_once "{$_SERVER['DOCUMENT_ROOT']}/readenv.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/auth.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/config.php";


$twitter_image = $token_asset_image_URL;

// messing about still, ref getting ipfs images to preview
// still hit & miss https://cards-dev.twitter.com/validator
if (substr($twitter_image,-1,1) == '/') $twitter_image = substr($twitter_image,0,-1);
if (strpos($twitter_image, 'ipfs') !== false) // possible ipfs link - use cache instead
	$twitter_image = "https://{$_SERVER['SERVER_NAME']}/cache/getCacheURL.php?url=$twitter_image";


if ($twitter_image == null) $twitter_image = $content['twitter'][1]['fallback_image'];
if ($twitter_image == null) $twitter_image = 'https://shop.gomint.me/assets/images/gmlogo4.png';

if (!isset($html_viewport)) 
	$html_viewport = '<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">';

//'<meta name="viewport" content="width=device-width, initial-scale=1.0">';

$url_icon = $content['general'][1]['url_ico'] ?? './assets/images/GM.ico';

$og_title = $content['og'][1]['title'] ?? 'GoMint - tokenize the future';
$og_url = $content['og'][1]['url'] ?? 'https://gomint.me';
$og_desc = $content['og'][1]['description'] ?? 'Tokenize your content with GoMint, engage and incentivise your fans to sponsor or promote your work. Hello Future!';
$og_image = $content['og'][1]['image'] ?? $url_icon;


$menu = $content['general'][1]['menu'] ?? 'm=Gallery';

?>
<!DOCTYPE html>
<html lang="en">

  <head>

    <meta charset="utf-8">
    <?=$html_viewport?>
    <meta name="description" content="">
    <meta name="author" content="">
 <!--   <link href="https://fonts.googleapis.com/css?family=Poppins:100,200,300,400,500,600,700,800,900&display=swap" rel="stylesheet">

-->

    <title><?php echo $title; ?></title>

	<meta property="og:title" content="<?=$og_title?>">
	<meta property="og:url" content="<?=$og_url?>">
	<meta property="og:description" content="<?=$og_desc?>">
	<meta property="og:image" content="<?=$url_icon?>">

	<meta name="twitter:card" content="summary_large_image">
	<meta name="twitter:site" content="@<?php echo $content['general'][1]['twitter_handle'];?>">
	<meta name="twitter:creator" content="@<?php echo $content['general'][1]['twitter_handle'];?>">
	<meta name="twitter:title" content="<?php echo $content['twitter'][1]['title'];?>">
	<meta name="twitter:description" content="<?php echo $content['twitter'][1]['description'];?>">
	<meta name="twitter:image" content="<?php echo $twitter_image; ?>">
	
	
	<base href="<?php echo $path_base; ?>">  


    <!-- Bootstrap core CSS -->
    <link href="vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">

    <!-- Additional CSS Files -->
    <!-- <link rel="stylesheet" href="assets/css/fontawesome.css"> -->
		<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">

<?php
		$path_style_css = 'assets/css/style.css.php';
		
		$cachebust = filemtime("{$_SERVER['DOCUMENT_ROOT']}/$path_style_css");
		//error_log("$path_style_css has date $cachebust");
?>
	
    <link rel="stylesheet" href="assets/css/style.css.php?<?= $cachebust ?>">
    <link rel="stylesheet" href="assets/css/owl.css">
	
	<link rel="shortcut icon" href="<?=$url_icon?>">
	<?php echo $custom_style; ?>
</head>

  <body>

    <!-- ***** Preloader Start ***** -->
    <div id="preloader">
        <div class="jumper">
            <div></div>
            <div></div>
            <div></div>
        </div>
    </div>  
    <!-- ***** Preloader End ***** -->

    <!-- Header -->


    <header class="">
      <nav class="navbar navbar-expand-lg">
        <div class="container">
          <a class="navbar-brand" href="./"><h2>
		  <?php echo $html_logo; ?>
		  </h2></a>
          <button class="navbar-toggler" type="button" data-toggle="collapse" data-target="#navbarResponsive" aria-controls="navbarResponsive" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="navbarResponsive">
            <ul class="navbar-nav ml-auto">
              <li class="nav-item <?php if (basename($_SERVER['REQUEST_URI']) == '') echo 'active'; ?>">
                <a class="nav-link" href="./">Home
                  <span class="sr-only">(current)</span>
                </a>
              </li>
			  
			  <?php


$temp = $menu;
$menu = [];
foreach (explode(',', $temp) as $pair) {
    list($key, $value) = explode('=', $pair);
    $menu[$key] = $value;
}

// if ($isPocMode) 
// $menu = array('products.php' => 'Gallery', 'checkout.php' => 'Checkout', 'account.php' => 'Your account'); 
// else  $menu = array('m' => 'Gallery'); 


if ($shopstatus == 'closed') unset($menu['checkout.php']);
if ($_SESSION['isShoppingAllowed'] == 0) unset($menu['checkout.php']);

foreach ($menu as $filename => $label) {
$active = (basename($_SERVER['REQUEST_URI']) == $filename) ? 'active' : '';

echo <<<EOMENU
              <li class="nav-item $active">
                <a class="nav-link" href="$filename">$label</a>
              </li>
EOMENU;
}

?>

<?php if (!empty($gm_profile_enabled)) { // GM-AUTH1: pages that include gm-profile-modal.php set this before requiring headheader; katomia-profile.js wires [data-menu-profile] clicks to open the modal ?>
              <li class="nav-item">
                <a class="nav-link" href="javascript:void(0)" data-menu-profile>Profile</a>
              </li>
<?php } ?>

<?php if (isset($content['about'])) {  ?>
              <li class="nav-item dropdown">
                <a class="dropdown-toggle nav-link" data-toggle="dropdown" href="#" role="button" aria-haspopup="true" aria-expanded="false">About</a>
              
                <div class="dropdown-menu">
                    <a class="dropdown-item" href="about.php">About Us</a>
                    <a class="dropdown-item" href="blog.php">Blog</a>
                    <a class="dropdown-item" href="testimonials.php">Testimonials</a>
                    <a class="dropdown-item" href="terms.php">Terms</a>
                </div>
              </li>
			  
<?php } ?>

<?php if (isset($content['contact'])) {  ?>			  
              <li class="nav-item <?php if (basename($_SERVER['REQUEST_URI']) == 'contact.php') echo 'active'; ?>">
                <a class="nav-link" href="contact.php">Contact Us</a>
              </li>
<?php } ?>
<?php if (false) {  //disabled for now  ?>
			   <li class="nav-item">
				<button id='pair-btn-icon' class='header-icon'><img src='./assets/images/hashpack-icon-white-trans.svg' width=30>
				</button>
              </li>
<?php } ?>			  
<?php if ($twitter_handle != null) {  ?>
			   <li class="nav-item">
				<a class="nav-link" href="https://x.com/<?php echo $twitter_handle; ?>" target='twitter_gomintme'><i class="fa-brands fa-x-twitter"></i></a>
              </li>
<?php } ?>	
			  
            </ul>
          </div>
        </div>
      </nav>
    </header>
      </nav>

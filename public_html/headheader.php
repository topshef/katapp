<?php 

// echo basename($_SERVER['REQUEST_URI']);
// exit;

session_start();
require_once(__DIR__ . '/config.php'); //redundant but hey


?>
<!DOCTYPE html>
<html lang="en">

  <head>

    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <meta name="description" content="">
    <meta name="author" content="">
    <link href="https://fonts.googleapis.com/css?family=Poppins:100,200,300,400,500,600,700,800,900&display=swap" rel="stylesheet">

    <title><?php echo $title; ?></title>
	
	
	<base href="<?php echo $path_base; ?>">


    <!-- Bootstrap core CSS -->
    <link href="vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">

    <!-- Additional CSS Files -->
    <link rel="stylesheet" href="assets/css/fontawesome.css">
    <link rel="stylesheet" href="assets/css/style.css">
    <link rel="stylesheet" href="assets/css/owl.css">
	
	<link rel="shortcut icon" href="assets/images/GM.ico">
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
	<!--
    <div class="sub-header">
      <div class="container">
        <div class="row">
          <div class="col-md-8 col-xs-12">
            <ul class="left-info">
              <li><a href="#"><i class="fa fa-envelope"></i>contact@company.com</a></li>
              <li><a href="#"><i class="fa fa-phone"></i>123-456-7890</a></li>
            </ul>
          </div>
          <div class="col-md-4">
            <ul class="right-icons">
              <li><a href="#"><i class="fa fa-facebook"></i></a></li>
              <li><a href="#"><i class="fa fa-twitter"></i></a></li>
              <li><a href="#"><i class="fa fa-linkedin"></i></a></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
	-->

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
if ($isPocMode) 
$menu = array('products.php' => 'Gallery', 'checkout.php' => 'Checkout', 'account.php' => 'Your account'); 
else  $menu = array('m' => 'Gallery'); 


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
				<a class="nav-link" href="https://twitter.com/<?php echo $twitter_handle; ?>" target='twitter_gomintme'><i class="fa fa-twitter"></i></a>
              </li>
<?php } ?>	
			  
            </ul>
          </div>
        </div>
      </nav>
    </header>

<?php 
// insert an iframe or banner image

if ($iframe) {  
?>
    <!-- Page Content -->
   <div class="page-heading header-text">
	<iframe src="<?=$iframe?>" style="border: none; position: absolute; width: 200%; height: 200%; z-index: -1; top: -100%; left: -50%;"></iframe>
      <div class="container">
        <div class="row">
          <div class="col-md-12">
            <h1><?php echo $heading; ?></h1>
            <span><?php echo $subheading; ?></span>
          </div>
        </div>
      </div>
    </div>
	
<?php } else { // almost the same but no iframe and adding background image only ?>  
    <!-- Page Content -->
    <div class="page-heading header-text" style="background-image: url('<?php echo $imgsrc ?>');">
      <div class="container">
        <div class="row">
          <div class="col-md-12">
            <h1><?php echo $heading; ?></h1>
            <span><?php echo $subheading; ?></span>
          </div>
        </div>
      </div>
    </div>
<?php } //maybe see also homepage_slider.php ?>
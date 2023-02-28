<?php


function sendPost($url, $json, $debug = false) {

	$options = array(
	  'http' => array(
		'method'  => 'POST',
		'content' => $json,
		'header'=>  "Content-Type: application/json\r\n" .
					"Accept: application/json\r\n"
		)
	);

	$context  = stream_context_create( $options );
	if ($debug) error_log("calling POST url=$url with json = $json");
	$result = file_get_contents( $url, false, $context );
	return $result;
}	




?>

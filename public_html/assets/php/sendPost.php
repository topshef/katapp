<?php


function sendPost($url, $json, $debug = false) {
		// v0.1 kfund
    $isString = is_string($json);
    if (!$isString) {
        $json = json_encode($json);
        if (json_last_error() !== JSON_ERROR_NONE)
            return elog("error WY82773 failed to convert to json\n" . print_r($json, true)) && false;
    }
    
	$options = array(
	  'http' => array(
		'method'  => 'POST',
		'content' => $json,
		'header'=>  "Content-Type: application/json\r\n" .
					"Accept: application/json\r\n"
		)
	);

	$context  = stream_context_create( $options );
	if ($debug) error_log("JH77879 calling POST url=$url with json = $json");
	$result = file_get_contents( $url, false, $context );
	
    if ($isString) return $result; // string in, string out, for backward compatibility
    
    //output object if possible 
    $obj = json_decode($result);
    $isJsonOk = json_last_error() === JSON_ERROR_NONE;
    if ($isJsonOk) return $obj;
    elog("\nwarning: WQ92773 could not parse json, returning string:\n$result");
    return $result;

}	

//raw post eg for hashpool
function sendRawPost($url, $data) {

	$options = array(
	  'http' => array(
		'method'  => 'POST',
		'content' => $data,
		'header'=>  "Content-Type: text/plain"
		)
	);

	$context  = stream_context_create( $options );
	$result = file_get_contents( $url, false, $context );
	return $result;
}	



function zzsendPost($url, $json, $debug = false) { // brownout legacy on phpjabbers
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

<?php

	function shortenText($text, $maxlength = 300) {
		if (strlen($text) > $maxlength) {
			$newtext = substr($text, 0, $maxlength);
			return "$newtext ...";
		} else return $text;
		
	}

	// and/or para
	//if (strpos($text, "\n")) 
	//	$newtext = substr($text, strpos($text, "\n")-1);


	function splitProductId($productId) { // experimental
		$v = explode(';', $productId);
		$out['network'] = $v[0];
		$out['token_id'] = $v[1];
		$out['seller'] = $v[2];
		return $out;
	}


?>

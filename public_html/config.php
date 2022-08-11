<?php


error_reporting(E_ERROR | E_WARNING | E_PARSE);

include __DIR__ . '/../pagevisit.php';
include __DIR__ . '/../logEvent.php';



//grab details for the site content
require_once __DIR__ . '/gatekeep.php';

require_once __DIR__ . '/constants.php';

logEvent('begin loadcontent.php');

require_once __DIR__ . '/content/loadcontent.php';
logEvent('end loadcontent.php');

// logEvent('test1');
// sleep(2);
// logEvent('test2');


// common functions - tbc where to put these
	function getUserProfile($user_id, $type) {
		global $api_endpoint;
		$url = "$api_endpoint/getUserProfile.php?userId=$user_id&type=$type";
		$json = file_get_contents($url);
		$user = json_decode($json, true);	
		return $user;
	}



?>

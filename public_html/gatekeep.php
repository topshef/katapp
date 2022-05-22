<?php

// basic gatekeeping, if not using .htaccess or firewall etc

require_once 'readenv.php';

$ip_allowed = $env['ip_allowed'];
if ($ip_allowed == null) exit('code YF723'); // require ip_allowed

$ip = $_SERVER['REMOTE_ADDR'];

$is_allowed = strpos($ip_allowed, $ip) !== false;

if ($ip_allowed != 'any')
	if (!$is_allowed) exit('code YF724');


//later $ip_denied = $env['ip_denied'];






?>

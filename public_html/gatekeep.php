<?php

// basic gatekeeping, if not using .htaccess or firewall etc

require_once __DIR__ . '/readenv.php';

$ip_allowed = $env['ip_allowed'];
if ($ip_allowed == null) exit('code YF723'); // require ip_allowed

$ip = $_SERVER['REMOTE_ADDR'];

// SECURITY (audit F6): exact match, fail closed on an empty IP. strpos(list,$ip)
// matched any IP that is a SUBSTRING of the allowlist, and an empty REMOTE_ADDR
// made strpos return 0 (i.e. "allowed"). See SECURITY_AUDIT.md.
$is_allowed = ($ip !== '' && in_array($ip, preg_split('/[\s,]+/', trim((string)$ip_allowed), -1, PREG_SPLIT_NO_EMPTY), true));

if ($ip_allowed != 'any')
	if (!$is_allowed) exit('code YF724');


//later $ip_denied = $env['ip_denied'];






?>

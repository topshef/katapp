<?php

require_once "{$_SERVER['DOCUMENT_ROOT']}/elog.php";

// elog($_GET);
// elog($_SERVER);


$action = $_GET['action'] ?? false;
if ($action == 'create') {
	require_once("create-game.html");
	exit;
}


$gameId = $_GET['game'] ?? false;
if ($gameId) {
	require_once("game.html");
	exit;
}

require_once("contents.html");
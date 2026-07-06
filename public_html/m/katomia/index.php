<?php

require_once "{$_SERVER['DOCUMENT_ROOT']}/elog.php";

// elog($_GET);
// elog($_SERVER);


$page = $_GET['page'] ?? false;
if ($page == 'create') {
	require_once("create-game.php");
	exit;
}


$gameId = $_GET['game'] ?? false;
if ($gameId) {
	require_once("game.php");
	exit;
}

// games-list index — .php since HEADER-UNIFY (shared header/profile partials inside)
require_once("contents.php");
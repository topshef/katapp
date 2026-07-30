<?php

require_once "{$_SERVER['DOCUMENT_ROOT']}/elog.php";

// elog($_GET);
// elog($_SERVER);


$page = $_GET['page'] ?? false;
if ($page == 'create') {
	require_once("create-game.php");
	exit;
}

// ENTRY-DEFAULTROOT1 (user 2026-07-29): the markets list moved off the root to
// /markets — the root now belongs to the welcome page below.
if ($page == 'markets') {
	require_once("contents.php");
	exit;
}

// ENTRY-CIRCLES1 (user 2026-07-30): the normal-mode index — proposal-mode only, card
// view. contents.php above is untouched and stays the nerd-only full grid.
if ($page == 'circles') {
	require_once("circles.php");
	exit;
}

// ENTRY-LEARN1 (user 2026-07-30): explainer + FAQ — "what is a circle?" points here.
if ($page == 'learn') {
	require_once("learn.php");
	exit;
}


$gameId = $_GET['game'] ?? false;
if ($gameId) {
	require_once("game.php");
	exit;
}

// ENTRY-DEFAULTROOT1: bare /m/katomia/ now serves the WELCOME page (user ruling
// 2026-07-29, closing the question KATOMIA-CONFIG1 left open). /welcome stays as an
// alias route; the games list lives at /markets (menu 🏛️ + "See all markets" link).
require_once("landing.php");
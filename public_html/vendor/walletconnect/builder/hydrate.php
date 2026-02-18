<?php
/**
 * hydrate.php
 *
 * Generic pull-through cache hydrator.
 *
 * When a requested file does not exist locally, Apache rewrites
 * the request to this script. This script:
 *
 * 1. Validates the requested path.
 * 2. Attempts to fetch the same relative path from one of the
 *    configured origin servers.
 * 3. If successful, writes the file locally (atomic write).
 * 4. Redirects the client back to the original URL.
 *
 * This enables lazy hydration of public artifacts without cron,
 * SSH, or push-based deployment.
 *
 * IMPORTANT:
 * - This script only works for publicly accessible origin files.
 * - Ensure this directory is writable by PHP.
 * - Adjust path validation rules carefully.
 */

// -------------------------------
// Configuration
// -------------------------------

// List of origin base URLs (no trailing slash)
$origins = [
    'https://swap.kpay.live/public_html/vendor/walletconnect/builder',
    // 'https://backup.example.com/builder'
];

// Restrict allowed path pattern (EDIT THIS TO YOUR NEEDS)
$allowedPattern = '#^(releases|snapshots)/[a-zA-Z0-9._\-\/]+$#';

// Base local directory (where this script lives)
$baseDir = __DIR__;

// -------------------------------
// Input
// -------------------------------

$relativePath = $_GET['path'] ?? '';

if (!$relativePath) {
    http_response_code(400);
    exit('Missing path.');
}

// Block traversal attempts
if (strpos($relativePath, '..') !== false) {
    http_response_code(400);
    exit('Invalid path.');
}

// Restrict to allowed patterns
if (!preg_match($allowedPattern, $relativePath)) {
    http_response_code(403);
    exit('Path not permitted.');
}

$localPath = $baseDir . '/' . $relativePath;

// If file somehow appeared during execution, redirect immediately
if (is_file($localPath)) {
    header("Location: /{$relativePath}", true, 302);
    exit;
}

// Ensure directory exists
$targetDir = dirname($localPath);

if (!is_dir($targetDir)) {
    // You said you'd prefer manual creation — so we error.
    http_response_code(500);
    exit('Target directory does not exist.');
}

// -------------------------------
// Attempt hydration
// -------------------------------

$success = false;
$error = '';

foreach ($origins as $origin) {

    $originUrl = $origin . '/' . $relativePath;

    $tmpPath = $localPath . '.tmp.' . uniqid('', true);

    $ch = curl_init($originUrl);
    $fp = fopen($tmpPath, 'w');

    if (!$fp) {
        $error = 'Failed to open temp file.';
        break;
    }

    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FAILONERROR => true,
    ]);

    $result = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($ch);

    fclose($fp);
    curl_close($ch);

    if ($result && $httpCode >= 200 && $httpCode < 300) {

        // Atomic write
        if (rename($tmpPath, $localPath)) {
            chmod($localPath, 0644);
            $success = true;
            break;
        }

        $error = 'Failed to move temp file.';
        @unlink($tmpPath);
    } else {
        @unlink($tmpPath);
        $error = "Origin failed: {$originUrl} ({$curlError})";
    }
}

// -------------------------------
// Response
// -------------------------------

if ($success) {
    // Redirect to original request
    header("Location: /{$relativePath}", true, 302);
    exit;
}

http_response_code(502);
echo "Hydration failed.\n";
echo $error;

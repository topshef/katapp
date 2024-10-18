<?php

// Check if we are inside a git repository
$inside_work_tree = trim(shell_exec('git rev-parse --is-inside-work-tree 2> /dev/null'));

if ($inside_work_tree !== 'true')
    die('Not inside a git repository.');


// Get the origin remote URL
$origin_url = trim(shell_exec('git config --get remote.origin.url'));

// Convert SSH origin to HTTPS URL, fixing custom domains for GitHub
if (preg_match('/git@[^:]+:([^\/]+\/[^\.]+)\.git/', $origin_url, $matches)) {
    $repo_path = $matches[1];
    $base_url = "https://github.com/$repo_path";
} elseif (preg_match('/https?:\/\/[^\/]+\/([^\.]+\/[^\.]+)\.git/', $origin_url, $matches)) {
    $repo_path = $matches[1];
    $base_url = "https://github.com/$repo_path";
} else {
    $base_url = 'Invalid origin URL format';
}

$files = glob('*.php');

// Get server name and document root
$server_name = $_SERVER['SERVER_NAME'] ?? 'localhost';
$document_root = rtrim($_SERVER['DOCUMENT_ROOT'], '/');
$script_dir = str_replace($document_root, '', __DIR__);
$script_dir = ltrim($script_dir, '/');


echo "<title>$repo_path</title><PRE>$origin_url\n$base_url\n\n";

foreach ($files as $file) {
    $mtime = filemtime($file);
    $formatted_mtime = date('Y-m-d H:i:s', $mtime);

    // Get last commit hash for the file
    $cmd = 'git log -n 1 --pretty=format:"%H" -- ' . escapeshellarg($file) . ' 2> /dev/null';
    $commit_hash = trim(shell_exec($cmd));

    if (empty($commit_hash)) {
        $commit_hash = 'Untracked or no commits';
        $commit_url = 'N/A';
    } else {
        $commit_url = "$base_url/commit/$commit_hash";
    }

    $file_url = "http://$server_name/$script_dir/$file";
    
    echo "$formatted_mtime <a href='$commit_url' target='$commit_hash'>$commit_hash</a> <a href='$file_url' target='_blank'>$file</a>\n\n";
}

?>

<?php
// KWC / WalletConnect config — domain-aware. `metadata.url` is rendered from the
// serving origin so WalletConnect's domain check matches wherever this is dropped
// (swap.kpay.live, lab1.katlab.kpay.live, any future seat) with no per-environment
// hardcoding. Served at the /vendor/walletconnect/config.json path via the .htaccess
// rewrite `^config\.json$ config.php`, so consumers (data-config=".../config.json")
// are unchanged. This is the single-source-of-truth replacement for the per-env
// static config.json.
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host   = $_SERVER['HTTP_HOST'] ?? 'swap.kpay.live';
$origin = "$scheme://$host";

echo json_encode([
    'projectId' => '53db41bfb52ee26d9a304025f741ee18',
    'relayUrl'  => 'wss://relay.walletconnect.com',
    'metadata'  => [
        'name'        => 'KPAY',
        'description' => 'Hello future payments',
        'url'         => $origin,   // ← auto: matches the domain being served
        'icons'       => [],
    ],
    'requiredNamespaces' => [
        'hedera' => [
            'chains'  => ['hedera:mainnet', 'hedera:testnet'],
            'methods' => [
                'hedera_signMessage',
                'hedera_signTransaction',
                'hedera_executeTransaction',
            ],
            'events'  => [],
        ],
    ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

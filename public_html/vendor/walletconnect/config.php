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

// GM-SSEAUTO1 side-fix (2026-07-24): metadata.name was hardcoded 'KPAY' for every
// domain, so HashPack pairings made on shop.gomint.me were branded KPAY (the static
// config.json was already GoMint-branded but is DEAD — this rewrite serves every
// config.json request). Brand now follows the serving domain, same spirit as $origin.
// NB wallets stamp metadata at PAIR time — an existing pairing keeps its old name
// until the user disconnects and re-pairs.
$brand = ['name' => 'KPAY', 'description' => 'Hello future payments'];
// Katomia (user 2026-08-05): pairings from any katomia domain brand as Katomia —
// the kpay.live test hosts keep KPAY for now ("we'll probably move the test ones
// to Katomia as well, but can't be bothered right now"). Wallets stamp metadata
// at PAIR time (note above), so existing pairings rename only on re-pair.
$brandMap = [
    'gomint.me'   => ['name' => 'GoMint',  'description' => 'Tokenizing the future'],
    'katomia.com' => ['name' => 'Katomia', 'description' => 'Multi-party value exchange on Hedera'],
    'katomic.org' => ['name' => 'Katomia', 'description' => 'Multi-party value exchange on Hedera'],
];
foreach ($brandMap as $suffix => $b) {
    if (substr($host, -strlen($suffix)) === $suffix) { $brand = $b; break; }
}

echo json_encode([
    'projectId' => '53db41bfb52ee26d9a304025f741ee18',
    'relayUrl'  => 'wss://relay.walletconnect.com',
    'metadata'  => [
        'name'        => $brand['name'],
        'description' => $brand['description'],
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

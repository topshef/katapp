<?php

require_once("{$_SERVER['DOCUMENT_ROOT']}/elog.php");
require_once("{$_SERVER['DOCUMENT_ROOT']}/readenv.php");

header('Content-Type: application/json');

$parms = $_GET;
$network = $parms['network'] ?? 'mainnet';

// --------------------
// bucket / time logic
// --------------------

$bucketSeconds = 60 * 5; // 5 minutes
$days = intval($parms['days'] ?? 7);

$now = time();

$transferAfter =
    $parms['transferAfter']
    ?? bucketEpochNs($now - 86400 * $days, $bucketSeconds);

$transferBefore =
    $parms['transferBefore']
    ?? bucketEpochNs($now, $bucketSeconds);

// if request is old, allow infinite cache
$ageRequestSeconds = ($now * 1_000_000_000) - $transferBefore;
if ($ageRequestSeconds > ($bucketSeconds * 1_000_000_000))
    $bucketSeconds = null;

// --------------------
// build GraphQL WHERE
// --------------------

$where = [];

// consensus_timestamp is BIGINT (nanoseconds)
$where[] = "consensus_timestamp: { _gte: $transferAfter, _lte: $transferBefore }";
// $where[] = "consensus_timestamp: { _gte: \"$transferAfter\", _lte: \"$transferBefore\" }";


if (isset($parms['tokenId']))
    $where[] = "token_id: { _eq: " . hederaIdToEntityInt($parms['tokenId'], 'tokenId') . " }";

if (isset($parms['sender']))
    $where[] = "sender_account_id: { _eq: " . hederaIdToEntityInt($parms['sender'], 'sender') . " }";

if (isset($parms['receiver']))
    $where[] = "receiver_account_id: { _eq: " . hederaIdToEntityInt($parms['receiver'], 'receiver') . " }";

$limit = intval($parms['size'] ?? 25);

// --------------------
// GraphQL query
// --------------------

$whereClause = implode(",\n", $where);

$query = <<<GQL
query {
  nft_transfer(
    where: { $whereClause }
    order_by: { consensus_timestamp: desc }
    limit: $limit
  ) {
    consensus_timestamp
    token_id
    serial_number
    sender_account_id
    receiver_account_id
  }
}
GQL;


// exit($query);

// --------------------
// endpoint
// --------------------

$endpoint =
    $network === 'testnet'
    ? 'https://testnet.hedera.api.hgraph.io/v1/graphql'
    : 'https://mainnet.hedera.api.hgraph.io/v1/graphql';

// --------------------
// caching (query hash)
// --------------------

$cacheKey = hash('SHA1', $endpoint . $query);
$cachePath = __DIR__ . "/cache/autocache.$cacheKey.json";

if (file_exists($cachePath)) {
    if ($bucketSeconds === null)
        exit(file_get_contents($cachePath));

    if (time() - filemtime($cachePath) < $bucketSeconds)
        exit(file_get_contents($cachePath));
}

// --------------------
// fetch
// --------------------

$ch = curl_init($endpoint);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
		// CURLOPT_CONNECTTIMEOUT => 2,
		// CURLOPT_TIMEOUT        => 10,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Accept: application/json',
        'User-Agent: Mozilla/5.0 (UBID hgraph wrapper)'
    ],
    CURLOPT_POSTFIELDS => json_encode(['query' => $query])
]);

$response = curl_exec($ch);
curl_close($ch);

$obj = json_decode($response);
$isJsonOk = json_last_error() === JSON_ERROR_NONE;
if (!$isJsonOk || !isset($obj->data->nft_transfer)) {
    
		$out = (object)[];
		$out->endpoint = $endpoint;
		$out->query = $query;
		$out->response = $obj;
		if (!$isJsonOk) {
			$out->response = $response;
			$out->json_error = json_last_error_msg();
		}
		elog($out, "errors from $endpoint\n$response");
		ljexit($out, 502);
}

// --------------------
// NORMALISE TO APP FORMAT
// --------------------

$out = [];

foreach ($obj->data->nft_transfer as $r) {

    $secs = intdiv($r->consensus_timestamp, 1_000_000_000);
    $nanos = $r->consensus_timestamp % 1_000_000_000;

    $out[] = [
        'tokenId'       => "0.0.{$r->token_id}",
        'serialNumber'  => $r->serial_number,
        'consensusTime' =>
            gmdate('Y-m-d\TH:i:s', $secs)
            . '.' . str_pad($nanos, 9, '0', STR_PAD_LEFT)
            . 'Z',
        'sender'        => "0.0.{$r->sender_account_id}",
        'receiver'      => "0.0.{$r->receiver_account_id}"
    ];
}

$final = json_encode(['data' => $out], JSON_PRETTY_PRINT);

// cache ONLY the normalised, valid response
file_put_contents($cachePath, $final);
elog("cached normalised nft_transfer");

echo $final;
exit;

// --------------------
// helpers
// --------------------

// function bucketEpochNs($epochSeconds, $bucketSeconds) {
    // return floor($epochSeconds / $bucketSeconds) * $bucketSeconds * 1_000_000_000;
// }
function bucketEpochNs($epochSeconds, $bucketSeconds) {
    $bucketedSeconds = intdiv((int)$epochSeconds, (int)$bucketSeconds) * (int)$bucketSeconds;
    return $bucketedSeconds * 1_000_000_000;
}


function hederaIdToEntityInt($raw, $label = 'id') {
    $parts = explode('.', trim($raw));
    $entity = end($parts);

    if (!ctype_digit($entity))
        ljexit("invalid $label", 400, "invalid $label: $raw");

    if (array_filter($parts, fn($p) => $p !== $entity && $p !== '0'))
        ljexit("unsupported $label shard/realm", 400, "$label must be 0.0.x for now, got $raw");

    return (int)$entity;
}

<?php

//skeleton signing test

require_once "{$_SERVER['DOCUMENT_ROOT']}/auth.php";
require_once "{$_SERVER['DOCUMENT_ROOT']}/config.php";


$path_base = "https://{$_SERVER['SERVER_NAME']}";

// require_once "{$_SERVER['DOCUMENT_ROOT']}/headheader.php";	
//<base href= $path_base


echo "<PRE>";


$network = $_GET['network'] ?? 'testnet';
$txid = $_GET['txid'] ?? null;

if ($txid == null) exit('missing txid');
echo "$txid\n\n";

$url = "{$env['url_api_gomint_hashconnect']}txRecall.php?network=$network&txid=$txid";
$bytes = json_decode(file_get_contents($url), true);


if (isset($bytes['error'])) exit($bytes['error']);

error_log("result of $url is $bytes\n\n");


$button_text = 'Sign with Hashpack';

//exit;

?>
<html>
<body>

<head>
<base href="<?php echo $path_base; ?>">
</head>

<p><?=$network?> <?=$txid?></p>
<pre><?=$bytes?></pre>

<button id='txSign' class='hashpack-button'><img src='../assets/images/hashpack-icon-blue-trans.png' width=30> <?= $button_text?>&nbsp&nbsp</button>


<script type="text/javascript" src="../vendor/hashconnect/dist/bundle.js">


</script>



</body>

</html>
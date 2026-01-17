<?php


    require_once("{$_SERVER['DOCUMENT_ROOT']}/elog.php");
    require_once("{$_SERVER['DOCUMENT_ROOT']}/readenv.php");
    require_once("api_dragonglass.php");
    
   
    $parms = $_GET;
    
    $parms['endpoint'] = 'nfts/transfers';  //https://app.dragonglass.me/hedera/apiview
    
    // $bucketSeconds = 60 * 60; // 60 mins for testing 
    $bucketSeconds = 60 * 5; // 5 mins - to help with caching. increase this to reduce api call frequency
    $days = $parms['days'] ?? 7; // number of days to search
    
    $parms['transferAfter'] ??= bucketTime(time() - 60*60*24 * $days, $bucketSeconds);
    $parms['transferBefore'] ??= bucketTime(time(), $bucketSeconds);
    
    $ageRequestSeconds = time() -strtotime($parms['transferBefore']);
    if ($ageRequestSeconds > $bucketSeconds) $bucketSeconds = null; // null forces cache if available
    
    $result = dragonglass_v4c($parms, $bucketSeconds);
    //elog($result);
    elog(json_decode($result), "result from DG");
    
    header('Content-Type: application/json');
    echo $result;
    
    
    function bucketTime($time, $intervalSeconds) {
        $roundedTimestamp = floor($time / $intervalSeconds) * $intervalSeconds;
        return gmdate('Y-m-d\TH:i:s.00\Z', $roundedTimestamp);
    }
?>
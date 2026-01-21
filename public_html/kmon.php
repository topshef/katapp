<?php

    // require_once "{$_SERVER['DOCUMENT_ROOT']}/assets/php/helpers/sendPost.php"; //kfund
    require_once "{$_SERVER['DOCUMENT_ROOT']}/assets/php/sendPost.php"; //phpjabbers

    function kmon($test_id, $status, $notesOrDetails) {
        //v0.11 copied from pistmanAlert v0.11 wa papi
        $url = "https://kpay.uk/devtools/monitor/api.php";
        
        $details = $notesOrDetails; // fudging for upstream.. wip
        $notes = '';
        
        if (is_string($details)) {$notes = $details; $details = [];}
        else if (!is_array($details))
            $details = ['legacy details GY87764' => $details];  //remove this upstream
        
        // reqref to link multiple alerts from same request
        $reqref = $GLOBALS['reqref'] ?? false;
        $rr = preg_match('/RR\d{7}/', $reqref, $m) ? $m[0] : '';
                    
        $details['reqref'] = $reqref;
        $details['rr'] = $rr;
        $domain = $_SERVER['SERVER_NAME'];
        $details['log'] = "https://$domain/log.php?query=$rr";
        
        //$test_id, $result, $detail)
        $data = compact('test_id', 'status', 'notes', 'details');
                // $test_id,
                // $status,
                // $response_time,
                // $details
      
                
        $res = sendPost($url, json_encode($data));
        elog($data, "result $res of $url");
        return $res;
    }
    
?>
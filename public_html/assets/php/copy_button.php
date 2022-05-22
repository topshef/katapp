<?php

// does not work here...

$html_copy_button = <<<EO_HTML_COPY_BUTTON
    <style>
        .copy_icon_container {
            position: relative;
            float:right;
            padding-left: 1px;
        }
        .copy_icon_container button{
            display: flex;
            align-items: center;
            cursor: pointer;
            border: 0px solid lightgray;
        }
        .copy_icon_container button:hover{
            opacity: 0.8;
        }
        .copy_icon {
            width: 15px;
            cursor: pointer;
            padding-left: 1px;
        }
        #notification_box {
            display: block;
            padding: 5px 7px;
            background-color: #62b3f4;
            color: white;
            font-weight: bold;
            opacity: 0;
            border-radius: 10px;
            position: absolute;
            top: -1px;
            right: -50px;
            transition: all 0.3s;
        }
        #notification_box.show {
            opacity: 1;
            transition: all 0.3s;
        }
		
		#copy_button {
			background-color: #FFF;
			position: relative;
			top: -5px; left: -22px;
		}
		
    </style>
<div class="copy_icon_container">
                    <div id="notification_box">Copied!</div>
                    <button id="copy_button" onclick="copyMemo()">
					<span class="copy_icon" src="" title="copy memo" onclick="copyMemo()" >
						<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-copy">
    <path fill-rule="evenodd" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"></path><path fill-rule="evenodd" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"></path>
</svg></span>
                        
                    </button>
                    
                </div>
				
    <script>
        function copyMemo(){
            var notif_box = document.getElementById("notification_box");
            var text_to_copy = document.querySelector("body > pre > div > table > tbody > tr > td:nth-child(3) > b > span") ? document.querySelector("body > pre > div > table > tbody > tr > td:nth-child(3) > b > span").innerHTML : document.querySelector("body > table > tbody > tr > td:nth-child(3) > b > span").innerHTML;
            var textarea = document.createElement('textarea');

            document.body.appendChild(textarea);
            textarea.value = text_to_copy;
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            notif_box.classList.add('show');
            window.setTimeout(() => {
                notif_box.classList.remove('show');
            }, 2000);
        }
    </script>				
EO_HTML_COPY_BUTTON;


?>

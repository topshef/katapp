<style>
    #cookieNotice.display-right {
        right: 30px;
        bottom: 30px;
        max-width: 395px;
    }
    #cookieNotice.light {
        background-color: #fff;
        color: #393d4d;
    }
    #cookieNotice {
        box-sizing: border-box;
        position: fixed;
        padding: 20px;
        border-radius: 10px;
        box-shadow: 0 6px 6px rgb(0 0 0 / 25%);
        font-family: inherit;
        z-index: 999997;
    }
    #cookieNotice #closeIcon {
        width: 20px;
        height: 20px;
        cursor: pointer;
        color: #bfb9b9;
        overflow: hidden;
        opacity: .85;
        z-index: 999999;
        position: absolute;
        top: 0;
        right: 0;
        background: url(https://img.icons8.com/ios-glyphs/30/000000/delete-sign.png) 0 0 / 20px 20px no-repeat;
    }
    #cookieNotice * {
        margin: 0;
        padding: 0;
        text-decoration: none;
        list-style: none;
        box-sizing: border-box;
    }
    #cookieNotice .title-wrap {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
        background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAABmJLR0QA/wD/AP+gvaeTAAANYElEQVR4nO2aeZDV1ZXHP+f+Xu88mn1HaA2yKQ4ILRoiiyJTDZSjIopJzCQTZWK0ZspoBUarJE5UUiZqRTHOGGoYR9FBNAoNo2AGdVyAblxQtoDsYrNDd0P36/d+9zt/vIYg9Hv9esFKVfhWverq3+/c7z3n/O52zj1wDudwDudwDn+9sLPeg2QDq58Z7JwbLTRExoUmzgM6AO0MQkEl2EGT/1JmGwTlQWBvf547/Yuzrd5Zc8BFlf9+hQ80DTEF6NYMCiEeWR+dfl9r63YqWtcBmuUGVfeYItm9GMNPPobdJt6W2SozbSIMt4dmh300VgWQX51VGPdW6ILIBd77SzAbClwHZEv69sa2t3/QqnqegkhrEfU/PHesVfpfe2wYAGK/SfMgeGljux991EjzffW/zcAbAAOP/v5pwU8wLgf+ch3Qf//cKFn2KHC7FBiwy+CXtYX23Hb7YW1zOC/Vv2VVH3VjAJB2tVTHdGiRA/odeG4ggX8Nz4VADPjXY8fyH9vde2pNS3irDmf/zLCBwMZI+/zXWsLVGJq9Bnzr4LxrnNxCIIrZJ57we1s6/v26lirUf//cqCzrKyDfycZt7Pz9t1vKmQ6uOY2+deCFa80HiyQXldz86tjxb7eG8QChcm6UXIHk/vdsGw/NmALnV7x4FaEWiCAbeGxLl2n3YKbWUsjkJklgpudbizMdmjQCLqh46SKTvSrvsuXdb7Z0veVnrWk8gPdusLxDYdbq1uRNhYwdMKTiuQLz7mXk2prshS+63XTvWdFIrjdy1CbYdlb4T0PGU+BYmPe4xABgbUzc1tpf/gTkLQbkFeRmt9oZJR0y6qRo58vf8d79GKj1od28u+/1J7e5vtv+0NcifiZQAnQF9ppY4kM3e3vRddubqpBwRxDt4rGwO1DV1PZNReNTQDIReVLembw9sqPv9RtOvCra+YdrcKyVd7fLu17yLkve9fJy03GsLdrx6vimKiTvPpJ3+JDLm9q2OWjUAUXbXr+B0F2Cdzsjdbm/OvG8z/ZFRQrdQryLSq7UJYLimpz8Ni4RFFvoluBdVD5YWLR1SZ8maRS65XiHhe77zbCnyWh0CngFMwHM9PCWfiWxE8/NM0O4KFC6o2jy5FOalAGT+mxdXApM9PIzgJ9krFAia348CB8VjCvauuTKbedPfDdja5qBtCOg19bFxZIbhnf7I4nIvFPfeR+UyDu83C8AnoqVPzynrrz66VjZQwAhPCjvkFxJUxTa0q+k0ofBI/LOvOfZ83aUtm+qUU1BWgeYD34oOYSbd+rXB5BcF8lRE09sAjDjLqBAZncB1Nb5DZIDua5NVaptXfWvJfeRl7tQsWBRU5wweN2C7N5/+p9pvbcsvafPljevaEw+tQMkUxhMlnckFHnxjNfe7ZV35JHXH8Ck3wLVyH4LkGs5A+Ud8kFFpsqfwLrBU+sIg8kK3U7JjfKxrFW9Ni8b3Vi7nhvfHHc0UrhWcvMVBo+GIe/33vTGQ+napAyGem564xLz7hOMXbv7j+9z+r7fe8OyZwTTwUp3Dxw/+fT2vTYuW4IokfS7LwdNuOP090/VfNTHgnAu2EiwDyOh/mF63vCdX+tj47IeEouASwEBKwz+y+M+COK1+xN1ikXysooUBMWSbgVG19u0HlgB3AZkWSTot6vfVQ2m11IvgonISBkg3mno0BMna3ag8BZgUs/1b5Wa7MEYbn0OfpDMPyBvJQaVkmY3RF9v/FXJ/3R1IuD3wDWnyuwacM2ewesWXHHUtb9bsn8BxgnGAYSRXCwCIYCn3m6qBL/sfrzd42uGD4/3XP9WJ+AmH9cYoGkOEG4EHjA1eCavGDh2e4/P3roBcwuBiYKJWQiPgQKASslP2XPx+J0NtQe77LQHIxuSWjd4ah0wu9PG9+ZkJWI3O2yCYAQQxXBAhYnPwRbXGa/sHzy2es9JI4IySTdhXArMbZoDvLsAwIV+fSqZPRdfvbz7+j8OIYzMAJWQTH5WGCzBRWbvuWhUCuMBbCXo6lMerEwtCwcGjKoCnq3/ZQR5WysMSx7hG0TqKeBdHwCLaEe6Tr4adNUOmrDPn1QutB9boGeByxEfRDy3NZWj8U60CwUIeqUSSekA7117AyJ14YFWVwy4M2/YDk6b862NmrroVzlBLSRjlAaRegTI5Qio89G61let+ej28Yd9hWZKlBh0Few1WGJmsyuGXv614KuwqipWU5gDkJ2KL+U5oD6wYQ/EW0/9lqFL+cprfGhrFbrbqQ++6v9O96Gt7VK28mvB1/ZoNEyeRVzKD53aAbIqeaMHFLamEc1F11WriuRtobxF5a009K7YsvLahN4VS7ZE3qKSLez+0fsng6+eYdhW3sBbZSre1FMgdHsx2sfi1hk4K+tAUyBzMxBRUOn+y4rPCL46ryorBSbG49kng694ELQjFIIjqXjTjICgQt4hU+/WMqIl8KGVyDtEpMHgy4fJ4Av/5+ArkeCC+imQcidLdw74DNMYg78BljVLa8l1+vCTmwXTSB5nOwIHQeUm5h+4YugCzHxmVEEXAIvnNRR83Wc+ukGuBk5Z8S10A2QGYmMq3tQjAPdxMjvrhmWi4Oko/L+153d8f2259+4FeTdJ3nWvzyZ3lw8mewUvtv9gbVnhO58WZcJ3IviCeIPBl1xtffDlTgZfIhiZDNnt01S8KR1gCVuJd5h341iwIMjUcEgaH5GtlHdD8cF2ZNOJ0/tQbjybOL0V2j/ig+0WumGBuZUZOUFuKd4hzwMAd+SMuO+n2cOjP8259H4AJYIH6vVdmpSXEdpovMPF3Tsp7UzXZ4d31v1J0A/Pdw6PHfxeRtZLrv2768uBoWDLgsBNOTBqwBnJzU7vbYwmwvAVg/GGlR+6cuBl6aZDuxUb+prza4EosMQZD7qQ9T5gkBcPkEzKVhJw8eFRg3d2fHddsRergN2Hrxx0XqosdtqEiLx7vT6rMzUj44H2KzbeLO+GyrttJ4x/KrFm0py6Navn1JVXz6lbs/rpRPnEA6MGVLlj2VPk3Q7vbXjh2xtuTMd7ZOzA7V52g+Qq5d3EMHSr4riqMHSr5F2J5Cq9bMrhUYN3AoRhMK1+Cr+cLoWfPinqeE4yhP2gw9LNbTNxgOSmSYbE7BPGm9di0AigADRCntKnY+V/d6ikX6W8zU7Ku1sa4z46ZtByQg0R9oxkOyWrq//7O4v7i4+OGbQcoMfi8nyJWyVDZvPTcaZNih4ePfCz6FubVhg2NpHDj4AnGlPSyy5FRiSwpQDm/QMNzTRvzARecz5raWgh8OeKknQ4ctWgRoOvY7mFP5BXB+DDyqsvLE8n2/i9QOgexzsIbWb75V80fir0riPecWh/3b7kA+vfkJjBQIDDcb+X5P7dsVHuDND1zU8LJLsf7zAFv2lMvlEHVE3ot1hy70quS8JbowVLkjsoOfIKc+r3Y21qUA42ALRT0E1ySO5gY9yZoEbRn0uuh+RWH736/Fcbk8/ocjQkuFveeXn3z23f2FqcTtZ7K5d3BD4oATBnsxruWb8ASFj9Cc8HZZnokg4Fb2y9xMv9XN55wuDuTO4vM3LA8Ql91si7J+RdViIReaHzin1tUslaGMyvN2hGp9f3R++IDF9ijkmC1UC1YLWcJt4ZGbG0w9LNbaVgRvIIS9rFqjF0XrGvDWHkeXmX7WVzqkr6vJ9Ju8xLZJZuzikI8z7EGGqwqLqg5w2MtcQZcrPkCoZ/WQYMA5bnuLwph0o6nhGNdVh6sG3M1ywExmOUHSvrOZJZmR2Lz4Bk+Uu+XGAwBbT+WFZWMRO6HcukaZNqhHIW7+oXKPgA6IR49vi1PW5vSC53UUWRw68EugA7MGYLltbUHK7Iy2vfzbxNxDQDOA/Y6wMuq53YI23qLR3yF3/1JNKdwJHQwuLY5N6bM23b5CKpvEUVI5H+COQLe7a2bdc7GhoJuYsqikxaQPrtrUyeqbXXdW/yNToAs+Tyhn71GNg/AbWCktpru69oCkWzqsRyXt33t2Z6Bcg3bHGNs+9ybecz7/JnyeUN2TsVbJqSlaOdgAMGZWDzaz7tvLDZw/7NioKcYzbPjClATNKU2PXdSptK0+wyubxXD14u+VIli563eGffjV/X6Rup68leuHeImXuJ5FniiHmuq72xc7MqylpUK5yzcF8/cP8NNpRk7vCJmLeHmNrhaEt4U2Lxnvzc2tz7ZboHyAI+F7qxbkqnlPF+Y2h5sfRS5WRVH/mVwZ1AYLAf8Ugs7ufyvTNX/2bhP7bl5rRpd5vETKA74E32TCz/+L1M7nG8JdStVi2e9dKRYTh7EnHiSroK8Z8y93LC2rzP1OSBP2NIlvVy5QjENOBWklMNjHI8d8VvLkx7k5QpWrlcXhZ58dgE0EyMK095cwB4G9MavPvEOe2u87afSMFh4kcLAHIC1zn0ro/BYEzFgjEkv/YJVVfL/MPhTdFFrVqY2VpEpyP7+eqLPe4WmW4yyCjtdToMdgi9bs7mxacVfNzaOtb38Q3ghdrzA6/ROA1DutDM+kp0BApILmaViEM4duBtC47VQZhYVXdr9PNvRL9zOIdzOIdz+CvF/wNRyitZgSaDggAAAABJRU5ErkJggg==) 0 0 / 40px 40px no-repeat;
        padding-left: 45px;
        height: 40px;
    }
    #cookieNotice .title-wrap svg {
        margin-right: 10px;
    }
    #cookieNotice h4 {
        font-family: inherit;
        font-weight: 700;
        font-size: 18px;
    }
    #cookieNotice.light p, #cookieNotice.light ul {
        color: #393d4d;
    }
    #cookieNotice p {
        line-height: 25px;
    }
    #cookieNotice p, #cookieNotice ul {
        font-size: 14px;
        margin-bottom: 20px;
    }
    #cookieNotice .btn-wrap {
        display: flex;
        flex-direction: row;
        font-weight: 700;
        justify-content: center;
        margin: 0 -5px 0 -5px;
        flex-wrap: wrap;
    }
    #cookieNotice .btn-wrap button {
        flex-grow: 1;
        padding: 0 7px;
        margin: 0 5px 10px 5px;
        border-radius: 20px;
        cursor: pointer;
        white-space: nowrap;
        min-width: 130px;
        line-height: 36px;
        border: none;
        font-family: inherit;
        font-size: 16px;
        transition: box-shadow .3s;
    }
    #cookieNotice button {
        outline: 0;
        border: none;
        appearance: none;
        -webkit-appearance: none;
        appearance: none;
    }
    #cookieNotice .btn-wrap button:hover {
        transition: box-shadow .4s cubic-bezier(.25,.8,.25,1),transform .4s cubic-bezier(.25,.8,.25,1);
        box-shadow: 0 2px 5px 0 rgb(0 0 0 / 30%);
        transform: translate3d(0,-1px,0);
    }
    #cookieNotice .btn-primary{
        color:#ffffff;
        background:#115cfa;
        border: 1px solid #115cfa;
    }
</style>

<?php

//require_once './content/loadcontent.php';

$url_privacy_policy = $content['terms'][1]['url_privacy_policy'];
if ($url_privacy_policy == null) $url_privacy_policy = 'content/assets/privacy.html';


?>

<div id="cookieNotice" class="light display-right" style="display: none;">
    <div id="closeIcon" style="display: none;">
    </div>
    <div class="title-wrap">
        <h4>Cookie Consent</h4>
    </div>
    <div class="content-wrap">
        <div class="msg-wrap">
            <p>This website uses cookies or similar technologies. By continuing to use our website, you agree to our  <a style="color:#115cfa;" href="<?php echo $url_privacy_policy; ?>" target='privacy'>Privacy Policy</a></p>
            <div class="btn-wrap">
                <button class="btn-primary" onclick="acceptCookieConsent();">Accept</button>
            </div>
        </div>
    </div>
</div>

<script>
    /* Using the cookie method to check for the cookie consent popup

    // Create cookie
    function setCookie(cname, cvalue, exdays) {
        const d = new Date();
        d.setTime(d.getTime() + (exdays*24*60*60*1000));
        let expires = "expires="+ d.toUTCString();
        document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
    }

    // Delete cookie
    function deleteCookie(cname) {
        const d = new Date();
        d.setTime(d.getTime() + (24*60*60*1000));
        let expires = "expires="+ d.toUTCString();
        document.cookie = cname + "=;" + expires + ";path=/";
    }

    // Read cookie
    function getCookie(cname) {
        let name = cname + "=";
        let decodedCookie = decodeURIComponent(document.cookie);
        let ca = decodedCookie.split(';');
        for(let i = 0; i <ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) == ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(name) == 0) {
                return c.substring(name.length, c.length);
            }
        }
        return "";
    }

    // Set cookie consent
    function acceptCookieConsent(){
        deleteCookie('user_cookie_consent');
        setCookie('user_cookie_consent', 1, 30);
        document.getElementById("cookieNotice").style.display = "none";
    }

    // The following code will check the cookie acceptance flag in JavaScript Cookies when the web page is loaded.
    let cookie_consent = getCookie("user_cookie_consent");
    if(cookie_consent != ""){
        document.getElementById("cookieNotice").style.display = "none";
    }else{
        document.getElementById("cookieNotice").style.display = "block";
    }

    */

    /**
    * Checks if localStorage or sessionStorage is available in the browser.
    * @type - storage type
    * @return - boolean
    */
    function storageAvailable(type) {
        let storage;
        try {
            storage = window[type];
            const x = '__storage_test__';
            storage.setItem(x, x);
            storage.removeItem(x);
            return true;
        }
        catch (e) {
            return e instanceof DOMException && (
                // everything except Firefox
                e.code === 22 ||
                // Firefox
                e.code === 1014 ||
                // test name field too, because code might not be present
                // everything except Firefox
                e.name === 'QuotaExceededError' ||
                // Firefox
                e.name === 'NS_ERROR_DOM_QUOTA_REACHED') &&
                // acknowledge QuotaExceededError only if there's something already stored
                (storage && storage.length !== 0);
        }
    }


    // Set cookie consent
    function acceptCookieConsent(){
        localStorage.removeItem('user_cookie_consent');
        localStorage.setItem('user_cookie_consent', 1);
        document.getElementById("cookieNotice").style.display = "none";
    }

    // Check if LocalStorage is available
    if (storageAvailable('localStorage')) {
        // LocalStorage is available

        // The following code will check the localStorage acceptance flag in JavaScript WebStorage when the web page is loaded.
        let cookie_consent = localStorage.getItem("user_cookie_consent");
        if(cookie_consent != "" && cookie_consent != null){
            document.getElementById("cookieNotice").style.display = "none";
        }else{
            document.getElementById("cookieNotice").style.display = "block";
        }
    }
    else {
        // No localStorage for us
        console.log('LocalStorage not supported');
    }
    
</script>
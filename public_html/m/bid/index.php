<!--

//tire kickign discovery

// eg 
// https://dev4.shop.gomint.me/m/bid/?network=mainnet&size=10&tokenId=0.0.878200


-->
<head>
    <!-- Bootstrap CSS -->
    <link href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" rel="stylesheet">

    <!-- Optional Bootstrap JavaScript and dependencies -->
    <script src="https://code.jquery.com/jquery-3.5.1.slim.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@4.5.2/dist/js/bootstrap.bundle.min.js"></script>

<style>

/* Modal Background */
.modal {
  display: none; /* Hidden by default */
  position: fixed; /* Stay in place */
  z-index: 1000; /* On top */
  left: 0;
  top: 0;
  width: 100%; /* Full width */
  height: 100%; /* Full height */
  overflow: auto; /* Enable scroll */
  background-color: rgba(0,0,0,0.5); /* Black with opacity */
}

/* Modal Content */
.modal-content {
  background-color: #fefefe;
  margin: 10% auto; /* Centered */
  padding: 20px;
  border: 1px solid #888;
  width: 80%; /* Adjust as needed */
  position: relative;
  opacity: 95%;
}

/* Close Button */
.close-button {
  color: #aaa;
  position: absolute;
  top: 10px;
  right: 25px;
  font-size: 28px;
  font-weight: bold;
  cursor: pointer;
}

.close-button:hover,
.close-button:focus {
  color: black;
  text-decoration: none;
}


</style>

</head>
<body>

<div id="modal" class="modal">
  <div class="modal-content">
    <span class="close-button">&times;</span>
    <div id="modal-body">
      <!-- Modal content will be injected here -->
    </div>
  </div>
</div>



    <script src="ubid2.js"></script>
    <!-- <script src="https://unpkg.com/localbase/dist/localbase.min.js"></script> -->
    <script src="localbase.min.js"></script> <!-- beware spelling of Localbase -->
    <script src="localCacheDB.js"></script>

<script>

    
    
    let network
    
    document.addEventListener('DOMContentLoaded', async () => {
        // Requires ubid2.js
        await initUbid()
    })


</script>

</body>

<!--

//tire kickign discovery

// todo demo links to eg 
//https://dev4.shop.gomint.me/m/?dealonly=&dealId=087e095b465c65d91c58cd224b71d94dad8ea260d06f74597fd5433b9be7e812&v=labs&detail=&serial=26&seller=0.0.1532&bid_amount=0.1&tokenId=0.0.3626892&starttime=40secs&node=3&operatorId=0.0.1819

reported on DG NFT transfers 005823833172962711969325840
missing leading zero for nanoseconds
correct txid 0.0.5823833-1729627119-069325840

this is retarded. there is no way to reliably decode the txid
as a fudge for now we could look for the 17 as start of seconds, which must be 10 digits



-->
<head>
<!-- Bootstrap CSS -->
<link href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" rel="stylesheet">

<!-- Optional Bootstrap JavaScript and dependencies -->
<script src="https://code.jquery.com/jquery-3.5.1.slim.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@4.5.2/dist/js/bootstrap.bundle.min.js"></script>

<script src="https://cdn.jsdelivr.net/npm/localbase/dist/localbase.min.js"></script>
<script src="ubid2.js"></script>

</head>
<script>

// requires ubid2.js
const network = getParm('network') ?? 'testnet'
const tokenId = getParm('tokenId') ?? ''
const sender = getParm('sender') ?? ''
const receiver = getParm('receiver') ?? ''
const serialNumber = getParm('serialNumber') ?? ''

document.addEventListener('DOMContentLoaded', async () => {
  await fetchNftTransfers({ tokenId, sender, receiver, serialNumber })
})


</script>
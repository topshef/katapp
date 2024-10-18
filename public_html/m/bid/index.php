<?php

//tire kickign discovery

// todo demo links to eg 
//https://dev4.shop.gomint.me/m/?dealonly=&dealId=087e095b465c65d91c58cd224b71d94dad8ea260d06f74597fd5433b9be7e812&v=labs&detail=&serial=26&seller=0.0.1532&bid_amount=0.1&tokenId=0.0.3626892&starttime=40secs&node=3&operatorId=0.0.1819
?>
<head>
<!-- Bootstrap CSS -->
<link href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css" rel="stylesheet">

<!-- Optional Bootstrap JavaScript and dependencies -->
<script src="https://code.jquery.com/jquery-3.5.1.slim.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@4.5.2/dist/js/bootstrap.bundle.min.js"></script>

</head>
<script>


function hasParm(name) {
  const params = new URLSearchParams(window.location.search)
  return params.has(name)
}


function getParm(name) {
  const params = new URLSearchParams(window.location.search)
  return params.get(name)
}


function setParm(name, value) {
  const url = new URL(window.location)
  url.searchParams.set(name, value)
  window.history.replaceState({}, '', url)
}


const network = getParm('network') ?? 'testnet'
const tokenId = getParm('tokenId') ?? ''
const sender = getParm('sender') ?? ''
const receiver = getParm('receiver') ?? ''
const serialNumber = getParm('serialNumber') ?? ''

fetchNftTransfers({ tokenId, sender, receiver, serialNumber })

async function fetchNftTransfers({ tokenId, sender, receiver, serialNumber }) {
  const params = new URLSearchParams()
  params.append('network', network)
  
  if (tokenId) params.append('tokenId', tokenId)
  if (sender) params.append('sender', sender)
  if (receiver) params.append('receiver', receiver)
  if (serialNumber) params.append('serialNumber', serialNumber)

  const response = await fetch(`./api/nft/transfers?${params.toString()}`)
  const data = await response.json()
  console.log(data)
  
    const container = document.createElement('div')
    container.className = 'container mt-4'
    data.data.forEach(item => {
      const card = document.createElement('div')
      card.className = 'card mb-3'
      const cardBody = document.createElement('div')
      cardBody.className = 'card-body'
      cardBody.innerHTML = `
        <h5 class="card-title">Transaction ID: ${item.transactionId}</h5>
        <p class="card-text"><strong>Sender:</strong> ${item.sender}</p>
        <p class="card-text"><strong>Receiver:</strong> ${item.receiver}</p>
        <p class="card-text"><strong>Token ID:</strong> ${item.tokenId}</p>
        <p class="card-text"><strong>Serial Number:</strong> ${item.serialNumber}</p>
        <p class="card-text"><strong>Consensus Time:</strong> ${item.consensusTime}</p>
        <p class="card-text"><strong>Nonce:</strong> ${item.nonce}</p>
      `
      card.appendChild(cardBody)
      container.appendChild(card)
    })
    document.body.appendChild(container)

}

/* https://testnet.dragonglass.me/hedera/apiview

query			Free text search
tokenId
* multiple values allowed
Fetch NFT transfersfor given token Id
serialNumber
* multiple values allowed
Fetch NFT tranfers for given serial Number
sender
* multiple values allowed
Fetch NFT tranfers from account
receiver
* multiple values allowed
Fetch NFT tranfers to account
*/




</script>
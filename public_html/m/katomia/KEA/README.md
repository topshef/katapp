KEA client says:
"Watch for txs containing orders signed by this intent pubkey."

KPool sees a matching tx:
"Ping: requestId=abc123"

KEA client fetches:
"Give me the full signing request for abc123."

KPool returns:
"Here is the tx, source/order/fill info, and a normalised execution object."

KEA decides:
"Does this match a valid signed order and my policy?"

KEA signs:
"Here are signed bytes / signature result."



That is a sensible stepping stone: build the KEA “app brain” in a browser first, with localStorage keys and a WebSocket doorbell, then later swap localStorage for Android secure storage and WebSocket for FCM.

The only part I’d deliberately leave as a swappable adapter is “how to inject the local signature back into a Hedera transaction”. The rest of the prototype can be concrete: doorbell, fetch request, JWS verify, intent verify, policy check, local sign, POST result.

Browser KEA
    localStorage key
    WebSocket doorbell
    fetch request
    verify request
    sign tx bytes
    POST result

KPool KEA module
    watch txs
    normalise request
    store request
    send WebSocket doorbell
    serve request
    receive signed result







TBC later

~~~~

~~You said:~~

> ~~I don't think the watcher needs to do any signing on top of anything.~~

~~I mostly agree for v1.~~

~~The **order intent signature** is the important one. That proves the trader authorised the order.~~

~~But I would still include an optional server-side request signature later for audit/replay protection:~~

```
Order signature = trader authorised the trade.
Watcher signature = KPool issued this exact request at this time.
```

~~request??? do we even need the idea of a request. Kea is processing tx that contain order refs.~~



### jan 2026 placeholder

kpool-widget/
│
├── index.js        ← entry point / orchestration
├── model.js        ← data fetching + normalization
├── view.js         ← rendering (DOM creation)
├── controller.js   ← interactions (buttons, modals, QR, timers)
└── utils.js        ← shared helpers

### 



much later.. Sometimes... “Get everything in one shot” 

Yes, systems *do* sometimes allow:

- list + embedded records

- batched reads

- expanded responses

But the key is this:

> **That is an optimization of the model, not a change to the view contract**

The rule that keeps things sane is:

- The **shape** of `rawTx` never changes

- `rawTxns` may *optionally* carry embedded `rawTx[]`

So worst case later you get:

```js
rawTxns = {
  filter,
  results: [
    { txid, pch },
    { txid, pch }
  ],
  embedded: {
    [txid]: rawTx
  }
}
```

But the view code still thinks in terms of:

- “I render txs”

- “Sometimes they’re already here, sometimes I fetch”

That’s exactly the separation you want.

#### Incremental build roadmap

1. **Wire-up the API proxy (done)**
   - Static `index.html` + lightweight `kpool.php` proxy that returns `/kpool/txList` JSON.
   - Manual smoke-test: visit the page and confirm raw JSON appears.
2. **Bootstrap LocalBase**
   - Add LocalBase script, open `db('kpool').collection('transactions')`.
   - On page load, write each `TXID-PCH` from the `txList` response as a *stub* record:
      `{ id, txid, pch, status:'pending', lastUpdated:Date.now() }`.
   - Log to console → verify records persist across reloads.
3. **Render skeleton cards from LocalBase**
   - Read the collection, loop through entries, inject a simple `<div class="card">` per item showing `TXID-PCH` and “⏳ pending…”.
   - Use a lightweight `render()` function that can be called repeatedly.
4. **Periodic refresh loop**
   - `setInterval` every N seconds:
     1. Call `kpool.php` again → add any *new* keys to LocalBase.
     2. Re-run `render()`.
   - Keep the interval short (e.g. 15 s) for testing.
5. **Enrich phase 1 – `TXREAD` details**
   - For any record lacking `deal`, call `kpool/txRead?id=TXID-PCH`.
   - Store `deal`, `transfers`, `sigs`.
   - Update `lastUpdated`.
   - Extend card template to show number of signatures.
6. **Token metadata helper**
   - Extract unique `tokenId`s from `transfers`.
   - Build a `tokens` collection in LocalBase.
   - For each unknown token, call mirror-node `/tokens/{id}` once, cache `{name,symbol,decimals}`.
   - Show token symbol(s) on the card.
7. **Card imagery**
   - Decide an image source (e.g. token logo or generated avatar).
   - Download as Blob, store `image` in the transaction record **or** in a `blobs` store keyed by URL.
   - Update card template to display the image.
8. **Mirror-node status checker**
   - For any transaction with `status==='pending'`, poll `/transactions/{txid}` until a receipt arrives or 1 h has elapsed.
   - Write `{mirror,status:'completed'}` **or** `{status:'expired'}` to LocalBase.
   - Card auto-updates via `render()` to show ✅ completed or ⚠️ expired.
9. **Offline/PWA layer**
   - Add a Service Worker that caches static assets and falls back to LocalBase only when offline.
   - Optionally queue failed `fetch` requests and replay when connectivity returns.
10. **Polish & controls**
    - Add “Refresh now” button, expiry purge, sorting by newest/oldest, coloured status badges, etc.
    - Trim polling intervals and error handling for production.

Follow these steps one at a time, committing after each green test, and you’ll evolve from a static JSON dump to a fully offline-capable transaction explorer.

------



## 🧱 DATA STRUCTURE OVERVIEW (LocalBase per `TXID-PCH`)

Each **LocalBase entry** in collection `transactions`:

```js
{
  id: "TXID-PCH",        // full unique key
  txid: "TXID",          // base Hedera TXID
  pch: "PCH",            // pre-consensus hash
  startTime: UNIX,       // from TXID timestamp
  image: Blob,           // optional, local preview
  deal: {},              // from TXREAD: template of transaction (sync)
  transfers: [],         // from deal: token/account structure
  sigs: [],              // from TXREAD: pubkeys that have signed (may grow)
  mirror: {},            // from mirror node: status, receipts etc
  status: "pending" | "completed" | "expired",
  lastUpdated: UNIX      // used to trigger refreshes or expire logic
}
```

------

## 🔌 EXTERNAL APIs (Data Sources)

### ✅ **KPOOL APIs**

- `TXLIST`
  - 🔁 Call periodically
  - Returns array of `TXID-PCH` (keys only)
  - Adds entries to LocalBase if missing
- `TXREAD`
  - 🔁 One-time per TXID
  - Returns:
    - `deal`: full transaction skeleton
    - `transfers`: embedded in deal
    - `sigs`: list of pubkeys that have signed

### ✅ **Mirror Node API**

- 🔁 Polled until a receipt is found or transaction expires
- Adds:
  - `status`, `consensusTimestamp`, etc.

------

## 🔄 UPDATE LOGIC (Asynchronous Flows)

### 🌀 On Load / Periodic Check

1. **Fetch TXID-PCH list** from `TXLIST`
2. For each unknown key:
   - Create minimal LocalBase entry
   - Mark as `pending`, `startTime` = from TXID
3. For each entry without `deal`:
   - Call `TXREAD` and store:
     - `deal`, `transfers`, `sigs`
4. For each entry without `mirror`:
   - Call Mirror Node
   - If found: store `mirror`, update `status`
   - If expired (e.g. >1hr): mark `expired`

------

## 🎨 CARD UI Renders

Each card reads from LocalBase and shows:

- **Image Blob** (if present)
- **TXID-PCH**
- **Countdown**: `completionTime - now`
- **Status**:
  - `pending`: show countdown
  - `completed`: show `mirror.status`
  - `expired`: grayed out, optional retry

------

## 📦 STORAGE RULES

- `deal` + `transfers` = **sync** (don't update)
- `sigs` = **append-only**, can skip refresh unless needed
- `mirror` = **poll until found or expired**
- `image` = optional enhancement (can be lazy-loaded)

------

## ⚙️ ARCHITECTURE SUMMARY

```text
             ┌─────────────┐
             │  TXLIST API │  → [txid-pch list]
             └────┬────────┘
                  ↓
     [Add to LocalBase if new]
                  ↓
         ┌────────────┐
         │  TXREAD    │ → deal, transfers, sigs (once)
         └────────────┘

         ┌──────────────┐
         │ Mirror Node  │ → status (until resolved/expired)
         └──────────────┘

         ↓             ↓
     ┌───────────── Render UI ──────────────┐
     │   All data from LocalBase only       │
     └──────────────────────────────────────┘
```

------

## ✅ PWA READINESS

- Works fully offline from LocalBase
- Uses polling (`setInterval`) or triggered fetches
- Optionally add Service Workers for:
  - Static asset caching
  - Offline queueing of fetch attempts (e.g. `TXREAD` retry)
- Consider adding expiration logic to avoid retrying old TXs

------

Let me know when you're ready to scaffold the first bits—e.g. LocalBase init, TXLIST fetch, or card renderer—and I’ll walk through that next.
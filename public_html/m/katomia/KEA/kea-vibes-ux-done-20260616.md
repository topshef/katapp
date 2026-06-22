## Brainstorm summary

The core direction is: **KEA should feel tiny and simple on the surface, even if the underlying model supports multiple watches, modes, checks, signatures, timing rules, and debug detail.** The MVP should be: **one watched trader intent key, one switch, one transaction feed**. Scan QR, start watching, optionally sign. That’s the product shape.

The current prototype already has the right bones: a **Watches** section, an **Events** section, QR scanning, debug/manual watch entry, local watch storage, WebSocket doorbells, fetch/check verification, and watch modes for `doorbell`, `fetch`, and `sign`.

## Main design decisions I’d make

### 1. Rename **Events** to **Transactions**

Yes. Do it now.

“Event” is too developer-ish. In the brainstorm, the point is that each item represents a Hedera-shaped transaction package, even if it never reaches Hedera consensus. So user-facing language should be:

```text
Events → Transactions
Summary → Notes
Fetch / Check → Status
```

Internally, keeping `events` as the array name is fine for now. Don’t refactor the model just for wording.

---

### 2. Default UI should be **Basic Mode**

Basic mode should show:

```text
KEA
[Scan QR]

Watching:
🟢 Tim / mainnet / m-order / …ab12cd
[Watch only] [Watch + sign]

Transactions:
◯ 🟢 12:40:03  #40793  Ready
◯ 🟠 12:40:15  #40794  Waiting for signature
◼ 🟢 12:40:20  #40795  Consensus OK
```

Hide all this by default:

```text
baseUrl
wsUrl
full pubkey
raw pch
raw JSON
debug fields
fetch/check split
```

Those belong behind **Tools / Pro / Detail**.

---

### 3. Keep the word **Watch**, but explain it as a connection

I would not rename Watches to Connections yet.

“Watch” works with KEA/birdwatching, and it also leaves room for future conditional watching. But the UI copy should make the meaning more active:

```text
Watch a trader key
When this trader signs, KEA checks the package and can sign for you.
```

So the mental model becomes:

```text
Watch = watched signing relationship
Mode = what KEA does when something appears
```

Not just passive observation.

---

### 4. Use one combined transaction feed

Don’t split transactions by watch. The brainstorm points toward interlaced transactions from multiple watches, with a compact watch marker. That’s right.

For one watch, hide the watch column entirely.  
For multiple watches, show a tiny identity chip:

```text
🦜7F
🐦A2
🌿9C
```

or just:

```text
T1
T2
T3
```

Emoji fingerprints are fun, but I’d treat that as visual sugar after the transaction layout is stable.

---

### 5. Collapse `Fetch` and `Check` into one user-facing status

The code currently has separate `status` and `check`, and that is useful internally. Keep that in the data/debug model.

But the visible table should have one status column:

```text
Doorbell received
Checking…
Ready
Waiting for signature
Signed
Rejected
Expired
Consensus OK
Consensus failed
Check failed
```

Then the detail modal can show the internal stages:

```text
Doorbell → Fetching → Fetched → Verification pass/fail → Signed/submitted
```

This matches the brainstorm: the fetch phase is probably too fast to deserve its own normal UI state, but it is still useful for debugging.

---

### 6. Show **strike time**, not received time

This is an important design decision.

Current prototype displays `createdAt`, meaning the time KEA received/created the event. But the brainstorm says the more meaningful time is the transaction start/valid time, especially the timestamp inside the tx id after the `@`.

So:

```text
Current: received time
Better: strike time / valid-start time
```

Then sort by strike time, not arrival time. If a transaction inserts into the middle of the list, briefly flash it.

---

### 7. Do not build fancy auto-sign countdown yet

The grace-period idea is useful, but I would not make it MVP.

For now, use three modes:

```text
Watch only
Check only
Check + sign
```

Later add:

```text
Check + ask
Check + sign after delay
Check + sign just before expiry
```

Countdowns sound attractive, but they will complicate the UX before the core trust model is clear.

---

### 8. Adopt the circle/square status convention

This is a strong cross-product convention:

```text
◯ = not through Hedera consensus yet
◼ = has been through Hedera consensus
```

Then colour means outcome/readiness:

```text
green = good / ready / successful
orange = waiting / incomplete / needs action
red = failed / rejected / unsafe
grey = inactive / expired / ignored
```

This gives you a compact transaction list without explaining too much text.

---

## Practical action list

### Do now

1. **Rename visible heading**: `Events` → `Transactions`.

2. **Rename visible columns**:
   
   ```text
   Time → Strike
   Watch → Watch
   Fetch + Check → Status
   Summary → Notes
   ```

3. **Keep debug fields in detail modal**, not the main list.

4. **Make mobile cards much more compact**: fewer labels, more chip-like values.

5. **Hide debug watch fields behind Tools**, which the current prototype is already mostly doing.

6. **Make one-watch mode visually dominant**: if there is only one watch, don’t waste space repeating watch details in every transaction row.

### Do next

1. Add a `proMode` toggle.

2. Add a computed transaction display status, separate from internal `status` / `check`.

3. Parse transaction `txid` into strike time.

4. Sort transactions by strike time.

5. Add manual action buttons when relevant:
   
   ```text
   Approve
   Reject
   Details
   ```

6. Add the circle/square status glyph.

7. Add watch identity chips only when there is more than one watch.

### Defer

1. Swipe navigation between watches.

2. Card flip / postcard metaphor.

3. Emoji encoded watch fingerprints.

4. Countdown-based auto-sign.

5. Advanced conditional signing rules: balance, reputation, weather, etc.

6. Full module split, unless the prototype starts getting painful.

## Recommended MVP shape

The cleanest next target is:

```text
🦜 KEA

Watching
[🟢 mainnet · m-order · …ab12cd]        [Sign: ON/OFF]
[Scan QR] [Tools]

Transactions
◯ 🟢 12:40:02 · #40793 · Ready
◯ 🟠 12:40:10 · #40794 · Waiting for signature
◼ 🟢 12:40:15 · #40795 · Consensus OK
```

Tap a transaction for full detail/debug.

That keeps the app playful and tiny, while still leaving your current deeper model intact.

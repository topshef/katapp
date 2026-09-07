# KEA web app — smoke test (KEA-WEB1, testnet klotto)

The web app at **https://labs.katomia.com/m/katomia/KEA/** is the browser body of the same
signer that runs on the pilot box (`katdemo-kea-pilot`). Same core, same decision, same
signature over the body bytes. This walk-through watches it judge the lottery's claims and
unlocks, then signs one.

## 0. Before you start

- The box signer (`katdemo-kea-pilot`) signs every claim and unlock the moment it is raised.
  To see the browser sign one *instead*, stop it first (gcp-ops):
  `sudo pm2 stop katdemo-kea-pilot` — and start it again afterwards with
  `sudo pm2 start katdemo-kea-pilot`. Left running, the browser will still show every
  verdict; it just finds the transaction already signed when it approves.
- Tickets buy every 10 minutes; a win is one in ten. Expect a claim every hour or two. The
  raiser log tells you when one is waiting (`⏸ winner … waits` / `📤 raised claim …`).

## 1. Open the app, add the rule

1. https://labs.katomia.com/m/katomia/KEA/ → **Rules** → new rule.
2. KPool base URL: `https://kpay-api-alias.tayloa17.workers.dev/hapi`
   Doorbell socket: `wss://kpay-api-alias.tayloa17.workers.dev/hapi/ws`
3. Query: `network` = `testnet`, leave `orderPubkey` and `gameId` empty (blank = every
   transaction pooled on testnet rings; the core decides which are the lottery's).
4. Auto-approval key: *Manual approval* for the first pass.
5. Save. The rule shows **connected**.

## 2. Watch it decide

Every pooled testnet transaction now appears as an event. Circle traffic (the stall, the FX
bots) shows the old intent checks. A lottery claim or unlock shows **KEA core** in the
summary:

- `KEA core: claim US reproduced from the template — sign as 0.0.10406132 + 0.0.10406133`
  with green rows for policy, authority, inputs, reads, replay, cap, signers; or
- `KEA core refused: …` naming the step — "claim US: fail — pool does not cover", "unlock
  US: refuse — timelock", "deal … is not one this signer signs".

Open the event: **Verification result** lists the checks. A refusal never offers Approve.

## 3. Sign one from the browser

1. **Keys** → *Import* → name `klotto pool`, network `testnet`, paste the pool key; again for
   `klotto lock`. The app accepts the SDK's DER form (`302e0201…` + 64 hex) or the 64-hex
   seed. Read them from the box: gcp-ops
   `sudo grep -E '^KLOTTO_(POOL|LOCK)_KEY=' /opt/katomia-backend/.env` (testnet, disposable;
   the Actions log is private to the repo — clear it after, or rotate the pot if you would
   rather not).
2. With the box signer stopped, wait for the next `KEA core: claim …` event, open it,
   **Approve** with `klotto pool`, then the same event again with `klotto lock` (a claim needs
   both; the second approval adds the second signature).
3. The pool worker submits once both are there. Watch
   https://hashscan.io/testnet/account/0.0.10406132 — the claim lands with memo
   `klotto claim US <ticket>`. The unlock, 180 s later, the same way with `klotto lock` then
   `klotto pool`.
4. Set the rule's auto-approval key to `klotto pool` and it signs its half without asking;
   a second rule with `klotto lock` covers the other half — that is the PWA as a signer.

## What to look at

- The verdict text and check rows read the same as the box's log lines. Same core.
- A refused event has no Approve. Try it: nothing you click signs a refused transaction.
- After a signed claim, Keys shows the key "last used"; the browser's own cap ledger
  (localStorage) counts what it signed for the hour.

## Not yet

- The events list is every pooled testnet transaction (noisy); a "deals only" filter on the
  rule is a small follow-up.
- Caps in the browser are the ledger only; per-deal caps from a config are node-only today.

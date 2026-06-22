# Deal verification: portable engine + KEA integration notes

This pass refactors the Node deal-verification work into a **portable engine** that
runs unchanged on Node.js (the escrow signer / hapi) and in the **KEA browser app**,
and enriches it toward the full trustless check set from the 2026-06-14 brainstorm.
No KEA files are changed yet — this is the Node side plus the architecture for KEA.

## Files

| File | Runs on | Role |
| --- | --- | --- |
| `dealEngine.js` | **Node + browser** | The portable core. No environment imports. `createDealEngine(ports)` → `{ runChecks, verifyDeal, fillDeal, … }`, plus pure statics. UMD: `require()` in Node, `window.DealEngine` in the browser. **This is the file that drops into KEA.** |
| `dealPorts.node.js` | Node | Node adapters: sha256 + Ed25519 (`crypto`), `fetch`, `elog`, clock. |
| `dealPorts.browser.js` | browser (KEA) | Browser adapters: `@noble` Ed25519 + sha256, `kea-utils` canonicalJson, `window.fetch`, trusted-key store. |
| `dealVerify.js` | Node | Thin wrapper binding the Node ports. **Same public API as pass-1**, so the `deal.js` dry-run wiring is unchanged. Adds `verifyDealFull` (rich verdict). |
| `dealConditions.js` | Node | Backward-compat shim, re-exports the engine's pure condition registry (single source of truth). |

## The ports seam (why it's portable)

The engine never imports `crypto`, `fs`, `@hashgraph/sdk`, `fetch`, or `@noble`.
Everything environmental is injected:

```
ports = {
  log,            // (obj,label) => void
  now,            // () => ms
  canonicalJson,  // (obj) => string   — MUST match the dealId producer
  hashJson,       // (obj) => hex | Promise<hex>          (sha256 of canonicalJson)
  verifyEd25519,  // (sigBytes,msgBytes,pubBytes) => bool | Promise<bool>
  fetchJson,      // (url,opts) => Promise<any>            (optional, oracle replay)
  trustedKeys,    // { providerId: pubkeyHex }             (oracle promise verify)
  conditionRegistry // extra pure conditions
}
```

This is the same idea KEA already uses for its **SIGNER BOUNDARY** in `kea-sign.js`
(`signApprovalPackage` is the one swappable seam) — here it's applied to the
*verification* side: Node signs via the escrow service, KEA signs via device
secure storage, but **both verify with the identical engine**.

## The check pipeline (what changed functionally)

`runChecks(input, policy)` returns a **complete results array** — never a bare pass.
Each check is `{ id, label, type, status, detail, required, data }` with
`status ∈ pass | fail | skip | onhold`. This mirrors KEA's own `verifyKeaDetail`
pipeline, but non-throwing and inspectable.

| Check | What it does | Brainstorm point |
| --- | --- | --- |
| `claimedDeal` | package claims the dealId this watch approved | "watching for deal hash AB123" |
| `dealIdHash` | `sha256(canonicalJson(template)) === dealId` | "the template hashes to that hash" |
| `replay` | `fillDeal(template, bindings)` resolved cleanly | "replay using the bindings" |
| `transfers` | replayed transfers == tx transfers (`exact` default, or `netting`) | "match byte-for-byte … a subset … PCH" |
| `conditions` | pure conditions (range/sum/…); network ones → skip | "boils down to a condition check" |
| `oracles` | signed provider promise verified, or replay, else **onhold** | "have the provider sign the data … a promise" |
| `scope` | operator / validDuration / startTime if the deal declares them | "scope of this deal includes the valid duration" |

**Verdict derivation (the key rule you asked for):**
`fail` if any check failed · `incomplete` if no fails but a *required* check is
skip/onhold · `pass` only when every required check passed. The engine **does not
silently pass** a deal it could not fully verify. Across all 924 sample deals:
164 pass, 561 incomplete (oracle/condition gaps correctly held), 199 fail
(serial-wildcard test artifact), 0 crashes.

## Transfer comparison: exact vs netting

- **`exact`** (default for deals) — precision parity, element by element, with NFT
  serial wildcards (`any`, `15to50`) matched against a concrete in-range serial.
  This is the brainstorm's "absolute precision match" default.
- **`netting`** — residual subtraction (`actual − expected`), reject any account
  worse off; with `precision:true` (default) also rejects leftover. This is the
  same model as KEA's `verifyFillAgainstTransfers`. `toCanonicalTransfers()` maps
  **both** the deal shape (`addHbarTransfer/addTokenTransfer/addNftTransfer`) and
  KEA's `pchBasis.transfers` shape into one `accountId:asset → amount` map, so a
  deal can be netted exactly the way an order's signed bundle already is.

## Oracle / API trust (the brainstorm's open question)

Client-supplied oracle values can't be trusted. Two trustless routes, both in the
`oracles` check:

1. **Signed promise** — the provider signs `{ request, value, asOf }`; the customer
   packages `{ var, provider, payload, signature }` into the approval package; the
   engine verifies it via `ports.verifyEd25519` against `ports.trustedKeys`. Tamper
   the payload or use an unlisted provider → `fail`. This gives the audit trail and
   the reputational hook you mentioned.
2. **Deterministic replay** — only when `policy.allowApiReplay` and the binding
   carries an as-of/timestamp so the call is reproducible (e.g. FX). Until we wire
   recorded request context, these report `onhold`, not `pass`.

Anything else is `onhold` — explicitly *not* a pass. This is the "flag the gaps"
behaviour: deals with unresolvable oracles surface as `incomplete`.

## Where this slots into KEA (no changes yet)

KEA's `verifyKeaDetail` already runs the **Tim-the-trader intent** check
(intent-sig → bundle-hash → scope → PCH → fill/transfer netting). The deal check is
a **sibling** in the same pipeline. The brainstorm's "rules = watch filter +
checks[]" model maps directly:

```
rule = {
  watch:  { network, filter… , dealId? , orderPubkey? },   // what to listen for
  checks: [ { type:'intent' }, { type:'deal', policy:{ mode:'exact', watchDealId } } ]
}
```

A watch carrying a `dealId` runs the deal engine; a watch carrying an `orderPubkey`
runs the existing intent check. Same alert UI, an extra section under "Checks":

1. Add `dealEngine.js` + `dealPorts.browser.js` to the KEA bundle.
2. New `kea-deal.js`: `createDealEngine(browserPorts)`, expose `verifyDealForWatch(pkg, watch)`.
3. In the alert/review view, render `result.checks[]` (KEA already lists check rows;
   reuse that — each `{label, status}` becomes a ✅/⚠️/⏸️/❌ line).
4. Gate **Approve** on `verdict === 'pass'`, exactly as it gates on the intent check
   today (`kea-app.js`: "Cannot approve — checks have not passed").
5. The signer is untouched — `signApprovalPackage` stays the one signing seam.

## Tim-the-trader as a special case of a deal

The brainstorm's instinct is right: the intent check and the deal check are the same
shape (verify a signature over an intent, then net the intent against the
transaction's transfers). Both already share `toCanonicalTransfers` + the netting
comparator here. We keep them as two check types for now (the intent flow works and
shouldn't be disturbed), but they can later collapse into one generic
"verify-intent-then-net" check where the "intent" is either a signed order or a
hashed deal template. No need to force that yet.

## What's deliberately left for next passes

- **API replay with recorded context** — needs the package to carry request/as-of
  context; engine already routes it (`onhold`), just not executed.
- **More condition handlers** — JWT, password-hash variants, timelock; the registry
  is open (`ports.conditionRegistry`).
- **Byte-level body comparison** — current `transfers` check compares transfer
  elements (the PCH intent scope). A protobuf body-bytes diff can be added as a
  stricter `transfers` mode when needed.
- **Deal instantiation module** — the "create a deal instance" counterpart to
  verification (the PHP fill flow), which becomes largely `fillDeal` + tx build.

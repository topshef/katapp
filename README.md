# katapp — the Katomia front end

Katomia is a multi-party atomic-swap trading game on Hedera: accounts put things in each
other's baskets, and a circle settles as one transaction. This repo is its web front end.
The backend (game server, signing pool, MCP / agent connections) is a separate repo,
`topshef/hbarlive_hts`; nothing here holds a key or talks to Hedera except through the
player's own wallet.

katapp was split out of `topshef/phpjabbers` on 2026-10-19 with its history. See
[`SPLIT.md`](SPLIT.md) for exactly what came across and how to check it.

## Where it runs

| Host | Worker | Built from | Backend |
| --- | --- | --- | --- |
| `lab1.katomia.com` | `katui-lab1` | this repo, branch `lab1`, root `build/dist` | `api.katomia.com` → hapi8 |
| `labs.katomia.com` | `katui` | **still phpjabbers** `pilot` — the benchmark, deliberately untouched | same |

Both hosts reach the same backend through the same API alias Worker (`kpay-api-alias`,
service binding `HAPI`), so lab1 and labs can be compared like for like. `app.katomia.com`
(the stable site for users) comes later, from this repo.

The Worker name is never left to chance: `build/variant.env` names it (`katui-lab1` today) and
the build refuses to run without that file, so nothing built here can deploy over `katui`.

## Layout

The tree keeps phpjabbers' `public_html/` docroot for now, because the PHP render resolves its
includes from `DOCUMENT_ROOT`. Moving to a cleaner layout is a later step, checked the same way
the split was (the built `dist` must not change).

| Path | What it is | Origin |
| --- | --- | --- |
| `public_html/m/katomia/` | **Katomia**: pages, board, carousel, chat, KEA web app, QA dashboard | Katomia |
| `public_html/m/sign/`, `future/index*.php`, `future/future.css` | the external signing page (`/m/sign/`) and its page | shared, copied |
| `public_html/vendor/kpay/kpool_widget/` | the signing widget / modal and pool client | shared, copied |
| `public_html/vendor/walletconnect/` | WalletConnect config + the snapshot builder | shared, copied |
| `public_html/m/bid/`, `m/feedback/`, `m/tools/glog/` | local cache libs, feedback fallback page, glog | shared, copied |
| `public_html/assets/`, `vendor/bootstrap/`, `vendor/jquery/`, root `*.php` | site chrome the signing page renders with | shared, copied |
| `build/` | static build (`build-static.sh`), router Worker, tests, the committed `dist/` | Katomia |
| `qa/board/`, `qa/sign/` | headless-Chromium suites for the board and the signing modal | Katomia |

"Shared, copied" means the same code still lives in phpjabbers for the pages that stayed there.
They are copies, not links. Either side can change without the other; if one is ever split out
as its own package, both would pull it in.

Not here, by design: Keaton (`/keaton`), the deal pages (`/deal`), the V1 archive (`/legacy`)
and the GoMint shop. The router hands `/keaton`, `/deal`, `/legacy` and `/future/v3` to the
`PAGES` service binding (the `katui` Worker), so lab1 answers them exactly as labs does.

## Build and test

```
bash build/build-static.sh        # renders build/dist (php >= 8, no network)
node build/router.test.mjs        # route map + hand-through
node build/router.e2e.mjs         # Worker contract over build/dist
bash build/dist-fresh.sh          # committed dist == rebuild (the CI "fresh" gate)
cd qa/board && npm ci && node run.mjs   # board suite
cd qa/sign  && npm ci && node run.mjs   # signing-modal suite
```

`build/dist` is committed: the git-connected Cloudflare build ships it as-is. Edit a page,
rebuild, commit both. The site footer's build stamp is the commit *before* the deployed one
(the dist is built, then committed).

## Branches

- `main`: the trunk.
- `lab1`: what `lab1.katomia.com` serves. Move it forward from `main` when lab1 should update.

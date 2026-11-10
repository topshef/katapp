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
| `lab1.katomia.com` (Katomia at `/`) | `katui-lab1` | this repo, branch `lab1`, root `build/dist` (git connection moved here from phpjabbers by the owner, 2026-10-20) | `api.katomia.com` → hapi8 |
| `labs.katomia.com` and `app.katomia.com` (Katomia at `/`) | `katui-labs` | this repo, branch `labs` (LABS-PROMOTE1, 2026-11-10): the same build as lab1, at the commit last PROMOTED. app.katomia.com is a second custom domain on the same Worker (APP-DOMAIN1, owner 2026-11-10: "point it to labs … we can split it later") — the domain HashPack is asked to approve | same |
| (no public host; `katui.tayloa17.workers.dev`) | `katui` | phpjabbers `pilot` — serves only what katapp hands it: `/keaton`, `/deal`, `/deals`, `/legacy`, `/future/v3`, `/assets/js/page-feedback.js` (service binding `PAGES`) | same |

**lab1 is live development; labs is the pseudo-production pointer (owner 2026-11-10).** Both
serve the SAME bundle (`build/dist`); only the Worker config differs (`wrangler.toml` for lab1,
`wrangler.labs.toml` for labs, both written by `build-static.sh` from `build/variant.env`).
lab1 follows `main`; labs stays at whatever commit was last promoted, so lab1 can move ahead.
**Promote** a commit that is already live and checked on lab1: `git push origin <commit>:labs`
(a fast-forward; never force-push), then deploy the labs Worker from that commit (below) and
poll `https://labs.katomia.com/build-info.json`. **Roll back** = deploy an older commit.
Deploying labs: **the push does it.** `katui-labs` is git-connected (Workers Builds trigger
`labs (LABS-PROMOTE1)`, created 2026-11-10: repo topshef/katapp, branch `labs`, root `build/dist`,
deploy command `npx wrangler deploy -c wrangler.labs.toml`; first build succeeded). Poll
`https://labs.katomia.com/build-info.json` after pushing. By hand, if ever needed:
`cd build/dist && npx wrangler deploy -c wrangler.labs.toml` from a checkout of that commit.
The labs Worker's custom domains come from `LABS_DOMAINS` in `build/variant.env` (labs AND app):
a deploy replaces the Worker's whole set of custom domains with that list, so a domain added only
in the dashboard would be detached by the next promotion. To split app.katomia.com off later, give
it its own Worker and branch and take it out of `LABS_DOMAINS`.

**Katomia is served at the hostname root (ROOT-MOVE1, 2026-10-31):** `/board/t-trio`. Every old
`/m/katomia/…` page address redirects to the root form, and the old API and file addresses keep
answering, so links shared before the move still open. See `build/router.js` for the map.

Both hosts reach the same backend through the same API alias Worker (`kpay-api-alias`,
service binding `HAPI`). `app.katomia.com` (the stable site for users) comes later.

The Worker names are never left to chance: `build/variant.env` names them (`katui-lab1`,
`katui-labs`) and the build refuses to run without that file or with a name that would loop the
hand-through, so nothing built here can deploy over `katui`.

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
and the GoMint shop (`/deals`). The router hands `/keaton`, `/deal`, `/deals`, `/legacy`,
`/future/v3` and `/assets/js/page-feedback.js` to the `PAGES` service binding (the `katui`
Worker), so lab1 answers them exactly as labs does.

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

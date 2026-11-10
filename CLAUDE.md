# katapp — working notes for a Claude session

Read `README.md` (what runs where, layout) and `SPLIT.md` (where this came from). The estate's
register is `topshef/kmigrate` (record `katomia-labs`); log changes there as other sessions do.

- **`build/dist` is committed and is what deploys.** After any edit under `public_html/` or
  `build/`, run `bash build/build-static.sh` and commit source and dist together.
  `bash build/dist-fresh.sh` is the gate. It rebuilds dist, so never run it at the same time
  as the QA suites.
- **Katomia is served at the hostname root (ROOT-MOVE1, 2026-10-31).** lab1.katomia.com/ is
  Home, `/board/<id>`, `/circles`, `/KEA/`, `/qa/`. The files still live under `m/katomia/` in
  the bundle; `build/router.js` maps the root URLs onto them, falls back to `m/katomia/` for any
  file a root page asks for relatively, and redirects every old `/m/katomia/<page>` address to
  the root (302 while lab1 is on trial: `OLDPAGE_CODE`, flip to 301 once the owner keeps it).
  Old `/m/katomia/hapi*` API paths and old file paths keep SERVING, never redirect. The render
  runs with `KATOMIA_AT_ROOT=1`, so PHP's `$katomiaBase` is `''`; Katomia's API calls use
  `$katomiaApi` / `window.KAPI` (`/hapi/katomia`), because at the root `/hapi/<x>` is the
  backend's whole namespace. Never write `/m/katomia` into a link again. labs.katomia.com
  serves this repo's build too since LABS-PROMOTE1 (below). Status and history: kmigrate
  `modules/katomia-labs.json`; plan https://claude.ai/artifact/5e63151e-bbfd-4d32-b9e5-752c8a8eb13e.
- **labs.katomia.com is built from this repo too (LABS-PROMOTE1, owner 2026-11-10)**, and so is
  **app.katomia.com** (APP-DOMAIN1: a second custom domain on the same Worker, listed in
  `LABS_DOMAINS` — never attach it in the dashboard alone, a deploy would detach it). Worker
  `katui-labs`, branch `labs`, the same bundle with `build/dist/wrangler.labs.toml`. lab1 is live
  development; labs is the pseudo-production pointer: **promote only a commit already live and
  checked on lab1** (`git push origin <commit>:labs`, fast-forward, never force), then deploy it
  (README: "Promote"). Never make this repo deploy as `katui`: that is phpjabbers' Worker, now
  serving only the pages katapp hands it (`PAGES_SERVICE`).
- **Deploying lab1:** push `main`, then move `lab1` to the same commit. The Cloudflare Worker
  `katui-lab1` builds branch `lab1`. Poll `https://lab1.katomia.com/build-info.json` (the old `/m/katomia/build-info.json` is the same file)
  until `built` changes, and only then say it is live.
- **Report the footer build stamp** the owner will see (`build <parent sha> · <built UTC>`), and
  never claim a fix is live before it is pushed and the build-info shows it.
- Tests: `node build/router.test.mjs`, `node build/router.e2e.mjs`, `qa/board` (`node run.mjs`),
  `qa/sign` (`node run.mjs`).
- **Other sessions share the live testnet** (lab1, the backend, the demo bots). Read kmigrate
  `SESSIONS.md` before changing anything live: checks and tests observe and record, claim a
  todo before changing what it covers, rebase rather than overwrite, and never trade as the demo
  cast to test something.
- Facts nobody has confirmed carry the prefix `UNCERTAIN:`. Small, safe changes, with comments
  that say why.

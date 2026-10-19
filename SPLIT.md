# KATAPP-SPLIT1 — how katapp was split from phpjabbers

Owner, 2026-10-19: *"we're pulling everything out of PHP Jabbers that we need for Katomia to
work in its entirety … everything that's left behind is basically stuff that is not at all
used by Katomia."* Keep the history; leave labs.katomia.com on phpjabbers as a working
benchmark; deploy katapp to lab1.katomia.com first.

## Source

- `topshef/phpjabbers` branch `pilot` at `3738bbed61abc2cd3c22a3b630d75119df81a1b1`
  (2,735 commits, a full clone).
- `git filter-repo --paths-from-file` with the list below, and `pilot` renamed to `main`.
- Result: 2,049 commits. phpjabbers `3738bbe` is katapp `8a2f4bf0d844b0e8e35fa9255b1965b7a71b25db`.
  Every commit hash changed (that is what a filter does). The original hashes the register
  and older commit messages cite are still valid in phpjabbers.
- History follows each kept path only. A file that reached a kept path by a rename keeps
  its history from the rename onwards.

## What came across, and why

The list is what the katui build actually reads, found with a traced build. The PHP render
logged every included file, and the copy steps were read from `build/build-static.sh`. The
list was then proved by building from a tree holding only these paths.

```
.gitignore  logEvent.php  pagevisit.php
build/build-static.sh  build/router.js  build/router.test.mjs  build/router.e2e.mjs
build/dist-fresh.sh  build/smoke.sh  build/txflow.test.mjs  build/dist/
qa/board/  qa/sign/  .github/workflows/katui.yml
public_html/{elog,auth,config,constants,cookieConsent,footer,gatekeep,hapi_base,headheader,kmon,readenv}.php
public_html/content/loadcontent.php
public_html/assets/php/  public_html/assets/css/  public_html/assets/js/  public_html/assets/images/GM.ico
public_html/future/index.php  public_html/future/index_v2.php  public_html/future/future.css
public_html/m/katomia/  public_html/m/sign/  public_html/m/feedback/  public_html/m/bid/  public_html/m/tools/glog/
public_html/vendor/walletconnect/{config.php,kwcScriptTag.php,builder/}
public_html/vendor/kpay/kpool_widget/  public_html/vendor/bootstrap/  public_html/vendor/jquery/
public_html/vendor/hashconnect/configLoad.php  public_html/vendor/kbuild-monitor.js
```

Left in phpjabbers: Keaton (`keaton/`), the deal pages (`deal/`), the V1 archive (`legacy/`),
the GoMint shop, `api-alias/` (the API alias Worker, shared by every host), the never-deployed
`build/dist-gcp` comparison rig, and the `kwallet` / `signers` QA suites.

## The proof

Built from katapp and compared with phpjabbers' committed `build/dist` at `3738bbe`, using
dist-fresh's normalisation (cache-bust stamps and commit hashes blanked, build-info skipped):

- every Katomia page, script and asset is identical, including the signing page, the pool
  widget, the WalletConnect bundle and the chrome;
- `deal/`, `keaton/`, `legacy/` are absent (handed through instead);
- `router.js` differs by the hand-through;
- `wrangler.toml` differs in name (`katui-lab1`), its custom domain and the `PAGES` binding.

Nothing else differs. Then: router 103 route cases + 25 hand-through cases, router e2e (now
also proving the hand-through passes method, URL and body untouched), txflow geometry, the
board suite 219/219, the signing-modal suite 71/71, dist-fresh clean.

## Before this repo goes public

The owner intends to open-source the front end. The history now carries every past version of
these files, so scan it properly first (GitHub secret scanning, or gitleaks over all commits).
A first pass on 2026-10-19 searched every commit for DER-encoded ED25519 and ECDSA private keys,
PEM private keys, GitHub and AWS tokens, and 64-hex values labelled as keys. It found nothing
real (one AWS-shaped match is base64 image data in a design doc). That is a first pass, not a
clearance.

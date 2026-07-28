# Deploying Katomia standalone to its own domain (KAT-DOMAIN1)

*2026-07-28, MASON. How to serve the Katomia app at the root of its own domain
from a self-contained bundle — no checkout of the swap repo, no code changes.
Working reference installs: **pat.katomia.com** (Lincoln, bundle) and
**katlab.katomia.com** (Lincoln, live-mirror variant — see end).*

## 1. Build the bundle (on the dev box, Lincoln)

```bash
bash /var/www/swap.kpay.live/public_html/m/katomia/ops/build-standalone.sh
```

Output: `m/katomia/build/` (~9.3M, gitignored) — a complete docroot. It contains
the app plus everything it needs that normally lives elsewhere in the swap
webroot: docroot PHP shims (`elog`/`readenv`/`hapi_base`/`kmon`/`kflow`/`diag` +
`assets/php/`), the `/m/bid/` local-cache stack (Localbase + localCache* —
**without these the signer/wallet flow dies silently**, test 1 finding), the
`/m/bid/explore/kpool` tx-mirror proxy, a trimmed `vendor/` (pinned KWC snapshot
+ `lazy-hydrate.php` + kpool_widget — not the 1.5G walletconnect tree), glog,
and a generated `.htaccess` (dev-host deny gate, legacy `/m/katomia/*` rewrite,
`/kflow` + `/diag` routes, app routes verbatim). The gate is **domain-agnostic**
(denies swap.kpay.live rather than allow-listing a domain), so one artifact
deploys to any domain unmodified.

Pack it: `cd build && tar czf ../katomia-standalone-<sha>.tar.gz .`

## 2. Install on the target server (root)

Using app.katomia.com on GMPOC (130.185.249.180, hostname hapi-london) as the
example. The vhost + LE cert already exist there; the docroot currently holds a
root-owned `index.php` redirect to katomia.com.

```bash
# 0) get the tarball over (from Lincoln; GMPOC's claude user can receive to ~)
scp -i /root/.ssh/id_gmpoc katomia-standalone-<sha>.tar.gz claude@130.185.249.180:~/

# then AS ROOT on the target:
SITE=/var/www/app.katomia.com

# 1) unpack into the docroot (replacing the redirect index.php)
mkdir -p $SITE/public_html
tar xzf ~claude/katomia-standalone-<sha>.tar.gz -C $SITE/public_html
chown -R www-data:www-data $SITE/public_html

# 2) HAPI env — REQUIRED, sits BESIDE the docroot, not in it.
#    Without it hapi_base falls back to dead hapi4 and every /hapi call hangs.
echo "HAPI_BASE=hapi5.katomia.com" > $SITE/.env_hapi

# 3) writable log dirs beside the docroot (kflow/kdiag/php logs)
mkdir -p $SITE/logs/kflow $SITE/logs/kdiag
chown -R www-data:www-data $SITE/logs

# 4) vhost: ensure AllowOverride All + Options FollowSymLinks on the docroot
#    (app routing is all .htaccess), mod_rewrite + mod_headers enabled, PHP on.
#    Remove any Redirect/RewriteRule that was doing the old placeholder redirect.
#    Optional but recommended (matches Lincoln):
#      php_value error_log /var/www/app.katomia.com/logs/phplog.txt
apache2ctl configtest && systemctl reload apache2
```

## 3. Verify (curl matrix — all should behave as shown)

```bash
B=https://app.katomia.com
curl -s -o /dev/null -w '%{http_code}\n' $B/                  # 200 (markets page)
curl -s -o /dev/null -w '%{http_code}\n' $B/board/t-prop      # 200
curl -s -o /dev/null -w '%{http_code}\n' $B/m/bid/localbase.min.js            # 200
curl -s -o /dev/null -w '%{http_code}\n' $B/vendor/walletconnect/config.json  # 200, metadata.url = $B
curl -s -m 15 -X POST $B/hapi/games -d '{}'                   # backend JSON (NOT a hang)
curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/kflow -H 'Content-Type: application/json' -d '{"events":[]}'  # 204
curl -s -o /dev/null -w '%{http_code}\n' $B/.env              # 403
```

Then a real browser test: create/join a testnet proposal game, add a
WalletConnect account, sign. Diagnostics land in `$SITE/logs/kflow/` — if a flow
fails, read the day's jsonl there first.

## Gotchas (each one bit us on 2026-07-28)

- **`.env_hapi` location**: PHP's `DOCUMENT_ROOT` keeps the vhost's literal
  (possibly symlinked) path; `hapi_base.php` reads `dirname(DOCUMENT_ROOT)/.env_hapi`.
  It goes next to `public_html`, wherever the vhost's DocumentRoot points.
- **`/m/bid/` stack**: game/board pages load it with absolute paths; 404s don't
  error visibly — the wallet picker just can't find wallets.
- **PHP version**: app + shims run on 7.3+; only `qa/results.php` needs 7.4
  (arrow fn). GMPOC apache PHP is 7.3-era — fine for the app.
- **CDN deps still remote** (esm.sh / cdnjs / jsdelivr): the bundle is
  file-complete but not network-isolated. Removing those is BUNDLE1.
- **WC `release.json` 404/JS-body**: the KWC bundle probes
  `snapshots/<sha>/release.json`, which doesn't exist anywhere (live 404s it
  too); `lazy-hydrate.php` may answer it with the js artifact. Harmless —
  proven on katlab. Lazy-hydrate can also pull missing snapshot artifacts from
  `swap.kpay.live` (it's in its `$origins`), so a remote install self-heals.
- **WS/CORS**: the frontend talks `wss://hapi5.katomia.com/ws` directly and the
  backend accepted a foreign-origin handshake (verified) — no backend change
  needed per domain. WalletConnect metadata.url is domain-aware via `config.php`.

## Variant: live-mirror on the dev box (katlab.katomia.com)

Not a bundle — a vhost whose docroot symlinks the whole swap webroot, with
vhost-level rewrites serving the app at root: GET/HEAD `/m/katomia/*` 302-collapse
to `/*` (POSTs exempt — a 302 would GET them), everything except
`m/…`, `vendor/…`, `kflow(.php)`, `diag(.php)`, `mdViewer.html`, `go`, `.well-known`
internally mapped into `/m/katomia/`. See
`/etc/apache2/sites-available/katlab.katomia.com-le-ssl.conf` on Lincoln.
Use this to A/B "live files" vs "bundle" on identical UX.

#!/bin/bash
# smoke.sh — is the deployed katui bundle serving every route? Usage: build/smoke.sh <origin>
# Pure curl; runs from GitHub Actions (katui.yml) or any laptop. Exits non-zero on the first
# failing route and prints the whole table either way.
set -u
ORIGIN="${1:?origin, e.g. https://katui.tayloa17.workers.dev}"; ORIGIN="${ORIGIN%/}"
fail=0
check(){ # path  expected-status  [needle in body]
  local path="$1" want="$2" needle="${3:-}" tmp; tmp=$(mktemp)
  local code; code=$(curl -sS -m 20 -o "$tmp" -w '%{http_code}' "$ORIGIN$path" 2>/dev/null || echo 000)
  local ok=1; [ "$code" = "$want" ] || ok=0
  [ -n "$needle" ] && ! grep -qF -- "$needle" "$tmp" && ok=0
  printf '%s  %-40s %s%s\n' "$([ $ok = 1 ] && echo '  ok ' || echo 'FAIL')" "$path" "$code" "${needle:+  ~ $needle}"
  [ $ok = 1 ] || fail=1; rm -f "$tmp"
}
echo "smoke: $ORIGIN"
# the API hop first: a 521/5xx here means the alias cannot reach its backend (not a page problem)
check /hapi/katomia/games                        200 '['        # same-origin API → alias → backend /katomia/games (ROOT-MOVE1: what root pages call)
check /m/katomia/hapi/games                      200 '['        # the old address still SERVES (a cached page's call)
# ROOT-MOVE1: Katomia at the root; the old page addresses redirect (302 while lab1 is on trial)
check /                                          200 'Katomia'
check /m/katomia/                                302
check /m/katomia/board/SMOKE1                    302
check /create                                    200 'Create your own'
check '/create?skin=basic'                       200 'skin-basic'
check /circles                                   200 '/hapi/katomia/games'
check /host                                      200 'Katomia'
check /learn                                     200 'Katomia'
check /markets                                   200 'Katomia'
check /board/SMOKE1                              200 'HAPI_BASE'
check /KEA/                                      200
check /assets/katomia-ring.svg                   200 '<svg'
check /assets/fonts/felt-digits.woff2            200            # FELT-NUMBER1 digit face
check '/m/sign/?network=testnet&txid=0.0.1@2.3&pch=x' 200 '<base href="/">'   # SIGNPAGE-STATIC1 external signing page
check '/m/sign/?action=txList&network=testnet&since=60&until=60' 200 'tx'     # its own ?action= proxy → backend /kpool/txList
check '/binding.php?network=testnet&accountId=0.0.1879' 200 'bindings'
check /future/future.css                         200
check /keaton/                                   200 'Keaton signers'   # SIGNER-VIEW1 the dashboard
check /future/v3/                                301                # KEATON-HOME1 the old home, permanently
check /deal/convert/                             200 'Converter'    # DEAL-CONVERT2 the v1 → v2 converter page
check /legacy/deals/                             200 'V1 deal archive'   # LEGACY-DEALS1 the v1 archive lookup
check /deal/convert/kea-convert.browser.js       200 'convertV1'
check /deals/                                    200            # SHOP-KBAR1 (phpjabbers, handed through on lab1)
check /assets/js/page-feedback.js                200 'feedback' # FEEDBACK-TAG1 (phpjabbers, handed through on lab1)
check '/m/feedback/?product=katomia'             200 'feedback-widget'
check /vendor/bootstrap/css/bootstrap.min.css    200
check /game/SMOKE1                               200 'HAPI_BASE'
check /board/kemoji.js                           200
check /katomia-core.js                           200 'getGameId'
check /m/katomia/katomia-core.js                 200 'getGameId'   # old file address, for cached pages
check /footer.html                               200
check /qa                                        302
check /qa/                                       200 'Katomia QA'
check /qa/data/tests.json                        200 'suites'
check /vendor/walletconnect/config.json          200 "\"url\": \"$ORIGIN\""
check /vendor/kpay/kpool_widget/config.js        200 'HAPI_BASE'
check /vendor/walletconnect/snapshots/4a3351b/kwc.iife.js 200
check /diag                                      204   # DIAG-SINK1: forwarded to the backend, which answers 204
check /m/katomia/build-info.json                 200 'source_sha'
check /m/katomia/nope                            404
check /nope                                      404
exit $fail

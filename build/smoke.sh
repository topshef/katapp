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
check /m/katomia/hapi/games                      200 '['        # same-origin API → alias → backend /katomia/games
check /                                          302
check /m/katomia/                                200 'Katomia'
check /m/katomia/create                          200 'Create your own'
check '/m/katomia/create?skin=basic'             200 'skin-basic'
check /m/katomia/circles                         200 'Katomia'
check /m/katomia/host                            200 'Katomia'
check /m/katomia/learn                           200 'Katomia'
check /m/katomia/markets                         200 'Katomia'
check /m/katomia/board/SMOKE1                    200 'HAPI_BASE'
check '/m/sign/?network=testnet&txid=0.0.1@2.3&pch=x' 200 '<base href="/">'   # SIGNPAGE-STATIC1 external signing page
check '/m/sign/?action=txList&network=testnet&since=60&until=60' 200 'tx'     # its own ?action= proxy → backend /kpool/txList
check '/m/katomia/binding.php?network=testnet&accountId=0.0.1879' 200 'bindings'
check /future/future.css                         200
check /vendor/bootstrap/css/bootstrap.min.css    200
check /m/katomia/game/SMOKE1                     200 'HAPI_BASE'
check /m/katomia/board/kemoji.js                 200
check /m/katomia/katomia-core.js                 200 'getGameId'
check /m/katomia/footer.html                     200
check /qa                                        302
check /m/katomia/qa/                             200 'Katomia QA'
check /m/katomia/qa/data/tests.json              200 'suites'
check /vendor/walletconnect/config.json          200 "\"url\": \"$ORIGIN\""
check /vendor/kpay/kpool_widget/config.js        200 'HAPI_BASE'
check /vendor/walletconnect/snapshots/4a3351b/kwc.iife.js 200
check /diag                                      204
check /m/katomia/build-info.json                 200 'source_sha'
check /m/katomia/nope                            404
exit $fail

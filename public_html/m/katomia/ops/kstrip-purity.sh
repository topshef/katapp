#!/bin/bash
# kstrip-purity.sh <build-dir> — T:KSTRIP-02 (BUNDLE-STRIP1): bundle purity gate.
# The finished build tree must carry NO trace of any stripped feature: no
# identifiers, no leftover markers for stripped features, no feature dirs/files.
# Runs inside build-standalone.sh as a hard gate (build aborts on failure) and
# standalone against any unpacked release. Shares the token inventory with
# kstrip-audit.sh — both live in ops/, which never ships in the bundle.
set -uo pipefail

DIR="${1:?usage: kstrip-purity.sh <build-dir>}"
FEATURES="${STRIP_FEATURES:-kea admin-disclose extsign}"

tokens_for(){ case "$1" in
  kea) echo '\bkea\b|kea[-_./]|keakonnect|deal(engine|ports)|execution[ -]agent|profilekeasection|data-menu-kea';;
  admin-disclose) echo 'kadmin[-_]?(chip|disclosed)|katomia_admin_disclosed';;
  # extsign (SIGN-HUBLINKPRUNE1): functional /m/sign/?… jump-offs only — see audit.
  extsign) echo 'm/sign/\?';;
  *) echo '';;
esac }

fail=0
for FEAT in $FEATURES; do
  T="$(tokens_for "$FEAT")"; [ -z "$T" ] && { echo "WARN: no token inventory for feature '$FEAT'"; continue; }
  hits="$(grep -rnIiE "$T|KBUNDLE-STRIP[-A-Z]*:$FEAT" "$DIR" --exclude-dir=node_modules 2>/dev/null)"
  [ -n "$hits" ] && { echo "── feature '$FEAT' traces:"; echo "$hits"; fail=1; }
done
# The marker convention's NAME must not ship either (a comment saying "KBUNDLE-STRIP"
# reveals that the build prunes things — caught live on pat 2026-08-15). Today every
# tagged feature is in the default strip list, so ANY occurrence is a leak; if a
# partially-stripped build ever becomes a real mode, scope this to stripped features.
mhits="$(grep -rnI "KBUNDLE-STRIP" "$DIR" --exclude-dir=node_modules 2>/dev/null)"
[ -n "$mhits" ] && { echo "── marker-name traces:"; echo "$mhits"; fail=1; }
[ -d "$DIR/KEA" ] && { echo "── KEA/ directory present in build"; fail=1; }

if [ "$fail" = 1 ]; then
  echo "KSTRIP-02 FAIL: stripped-feature traces survive in $DIR (above)." >&2
  exit 1
fi
echo "KSTRIP-02 PASS: no stripped-feature traces in $DIR ($FEATURES)."

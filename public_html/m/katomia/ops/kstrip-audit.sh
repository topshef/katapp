#!/bin/bash
# kstrip-audit.sh — T:KSTRIP-01 (BUNDLE-STRIP1): source tag audit.
# Every reference to a launch-excluded feature must be strippable at build time:
# inside a KBUNDLE-STRIP:<feature> block, in a KBUNDLE-STRIP-FILE:<feature> file,
# or under the feature's own directory. Anything else is a reference the bundle
# build cannot remove — fail loudly with file:line.
# Lives in ops/ ON PURPOSE: ops/ is excluded from the bundle, so the token lists
# here never ship. Feature inventory lives in tokens_for(); extend it when a new
# feature joins STRIP_FEATURES (see build-standalone.sh).
set -uo pipefail

APP="$(cd "$(dirname "$0")/.." && pwd)"
FEATURES="${STRIP_FEATURES:-kea admin-disclose}"

tokens_for(){ case "$1" in
  kea) echo '\bkea\b|kea[-_./]|keakonnect|deal(engine|ports)|execution[ -]agent|profilekeasection|data-menu-kea';;
  admin-disclose) echo 'kadmin[-_]?(chip|disclosed)|katomia_admin_disclosed';;
  *) echo '';;
esac }

fail=0
for FEAT in $FEATURES; do
  T="$(tokens_for "$FEAT")"; [ -z "$T" ] && { echo "WARN: no token inventory for feature '$FEAT'"; continue; }
  while IFS= read -r file; do
    case "$file" in
      "$APP"/KEA/*|"$APP"/build/*|"$APP"/ops/*|"$APP"/logs/*|*/node_modules/*|*.bak|*.min.*) continue;;
    esac
    head -3 "$file" | grep -q "KBUNDLE-STRIP-FILE:$FEAT" && continue
    # marker line ranges via awk (fixed-string index — no \b there: mawk/gawk treat
    # \b as backspace, so token matching stays in grep -E where \b works).
    # A block for ANY feature in STRIP_FEATURES covers: if some stripped feature's
    # markers remove the line, it never reaches the bundle (e.g. the admin-disclose
    # block legitimately names the features it discloses).
    ranges=""
    for MF in $FEATURES; do
      ranges="$ranges $(awk -v m="KBUNDLE-STRIP:$MF" '
        index($0, "/" m){ if (s) { print s "-" FNR; s=0 } next }
        index($0, m){ s=FNR }' "$file")"
    done
    while IFS=: read -r ln rest; do
      ok=0
      for r in $ranges; do
        [ "$ln" -ge "${r%-*}" ] && [ "$ln" -le "${r#*-}" ] && { ok=1; break; }
      done
      [ "$ok" = 0 ] && { echo "$file:$ln: $rest"; fail=1; }
    done < <(grep -niE "$T" "$file")
  done < <(grep -rlIiE "$T" "$APP" 2>/dev/null)
done

if [ "$fail" = 1 ]; then
  echo "KSTRIP-01 FAIL: untagged launch-excluded-feature references above — wrap them in KBUNDLE-STRIP markers (or reword)." >&2
  exit 1
fi
echo "KSTRIP-01 PASS: all launch-excluded-feature references are strip-tagged ($FEATURES)."

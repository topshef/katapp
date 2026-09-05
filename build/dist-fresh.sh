#!/bin/bash
# dist-fresh.sh — is the committed build/dist what build-static.sh would produce from the
# current sources? dist is a checked-in artifact (the git-connected Cloudflare deploy ships
# it as-is), so a source edit without a rebuild would silently deploy the old page.
# Used by .github/workflows/katui.yml; run locally before committing:  build/dist-fresh.sh
# Ignores the things that legitimately differ per checkout: kasset() ?v=<mtime> cache stamps
# and the two build stamps (KFLOW_COMMIT, __BUILD_HASH__).
#
# DISTFRESH-HASH1 (2026-09-05): __BUILD_HASH__ was NOT in that list, and it can never match
# by construction — build-static.sh stamps bootstrap.js with the CURRENT HEAD, so a commit
# that carries a rebuilt dist always contains the stamp of its own parent, while CI rebuilds
# at the new HEAD. Every push that touched dist therefore failed this check, which meant the
# one guard against shipping a stale dist had been crying wolf since it was written and
# nobody could tell a real staleness from the noise. Normalised like KFLOW_COMMIT beside it.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
norm(){ # $1 = dist dir, $2 = out dir  (build-info.json carries a timestamp: skipped)
  ( cd "$1" && find . -type f -not -name build-info.json -print0 ) | while IFS= read -r -d '' f; do
    mkdir -p "$2/$(dirname "$f")"
    case "$f" in
      *.html|*.js|*.json|*.toml) sed -E 's/\?v=[0-9]+//g; s/KFLOW_COMMIT = "[0-9a-f]*"/KFLOW_COMMIT = ""/; s/__BUILD_HASH__ = "[0-9a-f]*"/__BUILD_HASH__ = ""/' "$1/$f" > "$2/$f" ;;
      *) cp "$1/$f" "$2/$f" ;;
    esac
  done
}
rc=0
for variant in "" gcp; do
  DIST="$ROOT/build/dist${variant:+-$variant}"
  cp -r "$DIST" "$TMP/committed$variant"
  bash "$ROOT/build/build-static.sh" $variant >"$TMP/build$variant.log" 2>&1 || { cat "$TMP/build$variant.log"; echo "build $variant FAILED"; exit 1; }
  rm -rf "$TMP/a" "$TMP/b"; norm "$TMP/committed$variant" "$TMP/a"; norm "$DIST" "$TMP/b"
  if diff -r "$TMP/a" "$TMP/b" >"$TMP/diff.txt"; then
    echo "fresh: committed ${DIST#$ROOT/} matches a rebuild from source ($(find "$DIST" -type f | wc -l) files)"
  else
    head -40 "$TMP/diff.txt"; echo "${DIST#$ROOT/} is STALE — run build/build-static.sh ${variant} and commit the result"; rc=1
  fi
done
exit $rc

#!/bin/bash
# dist-fresh.sh — is the committed build/dist what build-static.sh would produce from the
# current sources? dist is a checked-in artifact (the git-connected Cloudflare deploy ships
# it as-is), so a source edit without a rebuild would silently deploy the old page.
# Used by .github/workflows/katui.yml; run locally before committing:  build/dist-fresh.sh
# Ignores the two things that legitimately differ per checkout: kasset() ?v=<mtime> cache
# stamps and the KFLOW_COMMIT diagnostic hash.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; DIST="$ROOT/build/dist"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp -r "$DIST" "$TMP/committed"
bash "$ROOT/build/build-static.sh" >"$TMP/build.log" 2>&1 || { cat "$TMP/build.log"; echo "build FAILED"; exit 1; }
norm(){ # $1 = dist dir, $2 = out dir
  ( cd "$1" && find . -type f -print0 ) | while IFS= read -r -d '' f; do
    mkdir -p "$2/$(dirname "$f")"
    case "$f" in
      *.html|*.js|*.json|*.toml) sed -E 's/\?v=[0-9]+//g; s/KFLOW_COMMIT = "[0-9a-f]*"/KFLOW_COMMIT = ""/' "$1/$f" > "$2/$f" ;;
      *) cp "$1/$f" "$2/$f" ;;
    esac
  done
}
norm "$TMP/committed" "$TMP/a"; norm "$DIST" "$TMP/b"
if diff -r "$TMP/a" "$TMP/b" >"$TMP/diff.txt"; then
  echo "dist fresh: committed build/dist matches a rebuild from source ($(find "$DIST" -type f | wc -l) files)"
else
  head -60 "$TMP/diff.txt"
  echo "build/dist is STALE — run build/build-static.sh and commit the result"; exit 1
fi

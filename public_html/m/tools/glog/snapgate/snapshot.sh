#!/usr/bin/env bash

set -e

OUT_DIR="$(pwd)"

DEFAULT_NAME="snapshot"
DEFAULT_VERSION="0.0.0"

NAME="$DEFAULT_NAME"
VERSION="$DEFAULT_VERSION"

# ---- Read package.json if present ----
if [ -f "package.json" ]
then
  echo "Found package.json"

  NAME=$(grep -m1 '"name"' package.json | sed -E 's/.*"name":[[:space:]]*"([^"]+)".*/\1/')
  VERSION=$(grep -m1 '"version"' package.json | sed -E 's/.*"version":[[:space:]]*"([^"]+)".*/\1/')

  NAME="${NAME:-$DEFAULT_NAME}"
  VERSION="${VERSION:-$DEFAULT_VERSION}"
else
  echo "No package.json found. Using defaults."
fi

echo "Package name: $NAME"
echo "Version: v$VERSION"

# ---- Default recursive excludes ----
EXCLUDES=(
  "*.gz"
  ".git"
  "node_modules"
  "dist"
  ".env"
  ".DS_Store"
)

TMP_FILE="/tmp/${NAME}.$$.$RANDOM.tmp.tar.gz"

# ---- Build tar exclude args ----
EXCLUDE_ARGS=()
for pattern in "${EXCLUDES[@]}"
do
  EXCLUDE_ARGS+=(--exclude="$pattern")
done

echo "Excludes:"
printf '  - %s\n' "${EXCLUDES[@]}"

# ---- Create deterministic recursive archive ----
tar -czf "$TMP_FILE" \
  --sort=name \
  --mtime='UTC 1970-01-01' \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  "${EXCLUDE_ARGS[@]}" \
  .

HASH=$(sha1sum "$TMP_FILE" | awk '{print $1}' | cut -c1-8)

FINAL_FILE="${OUT_DIR}/${NAME}-v${VERSION}-${HASH}.tar.gz"

echo "Final archive: $FINAL_FILE"

if [ -f "$FINAL_FILE" ]
then
  echo "Snapshot already exists. Nothing to do."
  rm "$TMP_FILE"
  exit 0
fi

mv "$TMP_FILE" "$FINAL_FILE"

echo "Created $FINAL_FILE"

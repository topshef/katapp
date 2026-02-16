#!/usr/bin/env bash

set -e

BASE_NAME="snapshot"
OUT_DIR="$(pwd)"

EXCLUDES=(
  "*.gz"
)

TMP_FILE="/tmp/${BASE_NAME}.$$.$RANDOM.tmp.tar.gz"

echo "Working directory: $OUT_DIR"
echo "Temporary archive: $TMP_FILE"

# Build exclude args for find
FIND_EXCLUDES=()
for pattern in "${EXCLUDES[@]}"
do
  FIND_EXCLUDES+=(! -name "$pattern")
done

# Generate stable sorted file list (files only, no directories)
FILE_LIST=$(find . -maxdepth 1 -type f "${FIND_EXCLUDES[@]}" | sort)

echo "Files being archived:"
echo "$FILE_LIST"

# Create deterministic archive from file list
tar -czf "$TMP_FILE" \
  --sort=name \
  --mtime='UTC 1970-01-01' \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  $FILE_LIST

HASH=$(sha1sum "$TMP_FILE" | awk '{print $1}' | cut -c1-8)

FINAL_FILE="${OUT_DIR}/${BASE_NAME}-${HASH}.tar.gz"

echo "Final archive: $FINAL_FILE"

if [ -f "$FINAL_FILE" ]
then
  echo "Snapshot already exists. Nothing to do."
  rm "$TMP_FILE"
  exit 0
fi

mv "$TMP_FILE" "$FINAL_FILE"

echo "Created $FINAL_FILE"

#!/bin/sh
set -e

echo "▶ Running build…"
npm run build

DIST_DIR="dist"
ARCHIVE_DIR="archive"
PROD_DIR=".."

mkdir -p "$ARCHIVE_DIR"

for file in "$DIST_DIR"/*; do
  [ -f "$file" ] || continue

  filename=$(basename "$file")
  name="${filename%.*}"
  ext="${filename##*.}"

  hash=$(sha1sum "$file" | cut -c1-6)

  archived="${ARCHIVE_DIR}/${name}_${hash}.${ext}"
  prod="${PROD_DIR}/${filename}"

  echo "▶ Deploying $filename (hash $hash)"

  cp -f "$file" "$prod"
  cp -f "$file" "$archived"
done

echo "✅ Deploy complete"

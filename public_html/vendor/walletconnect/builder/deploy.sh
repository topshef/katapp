#!/bin/sh
set -e

DIST_DIR="dist"
ARCHIVE_DIR="archive"
PROD_DIR=".."

BUILD_LOG="$(mktemp)"

npm run build 2>&1 | tee "$BUILD_LOG"

mkdir -p "$ARCHIVE_DIR"

for file in "$DIST_DIR"/*; do
  [ -f "$file" ] || continue

  filename=$(basename "$file")
  name="${filename%.*}"
  ext="${filename##*.}"

  hash=$(sha1sum "$file" | cut -c1-6)
  ts=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

  archived="${ARCHIVE_DIR}/${name}_${hash}.${ext}"
  prod="${PROD_DIR}/${filename}"
  info="${PROD_DIR}/${name}.md"

  cp -f "$file" "$prod"
  cp -f "$file" "$archived"

  cat > "$info" <<EOF
# ${name}

- **Bundle:** ${filename}
- **SHA-1:** ${hash}
- **Deployed:** ${ts}
- **Source:** npm run build

## Build output

\`\`\`text
$(cat "$BUILD_LOG")
\`\`\`
EOF

done

rm -f "$BUILD_LOG"

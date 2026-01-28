#!/bin/sh
set -e

# Output directories
DIST_DIR="dist"        # Build output from npm
ARCHIVE_DIR="archive"  # Historical copies of deployed bundles
PROD_DIR=".."          # Live deployment target (parent dir)

# Temporary file to capture full build output for later reference
BUILD_LOG="$(mktemp)"

#
# Build ID auto-increment
#
# If the source file contains a BUILDID like:
#   const BUILDID = "2026-01-28 v02"
# this block will increment the version (v02 -> v03) *before* the build.
#
# This guarantees the BUILDID is baked into the bundled output.
# If the file or version tag is missing, this silently does nothing.
#
PATH_BUILD_TAG="src/transactionHandler.js"

if [ -f "$PATH_BUILD_TAG" ]; then
  current=$(grep -oE 'v[0-9]+' "$PATH_BUILD_TAG" | head -1 || true)

  if [ -n "$current" ]; then
	  # Strip leading 'v', normalise to decimal, then increment
    num=${current#v}
		num=$(printf "%d" "$num")
		next=$(printf "v%02d" $((num + 1)))

		# Replace version in-place; failure here should not abort deploy
    sed -i "s/$current/$next/" "$PATH_BUILD_TAG" || true
  fi
fi


# Run build and capture output (both console + log file)
npm run build 2>&1 | tee "$BUILD_LOG"

# Ensure archive directory exists
mkdir -p "$ARCHIVE_DIR"

# Deploy each built artifact
for file in "$DIST_DIR"/*; do
  [ -f "$file" ] || continue

  filename=$(basename "$file")
	
	# Ignore sourcemaps here; handled separately
  case "$filename" in
    *.map)
      continue
      ;;
  esac	
	
	# Split filename into name + extension
  name="${filename%.*}"
  ext="${filename##*.}"

	# Short content hash for traceability
  hash=$(sha1sum "$file" | cut -c1-6)
	
	# Deployment timestamp (UTC)
  ts=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

	 # Target paths
  archived="${ARCHIVE_DIR}/${name}_${hash}.${ext}"
  prod="${PROD_DIR}/${filename}"
  info="${PROD_DIR}/${name}.md"

	# Deploy current build and archive a hashed copy
  cp -f "$file" "$prod"
  cp -f "$file" "$archived"

  # Deploy & archive sourcemap using bundle hash
  if [ -f "$DIST_DIR/$filename.map" ]; then
    cp -f "$DIST_DIR/$filename.map" "$PROD_DIR/$filename.map"
    cp -f "$DIST_DIR/$filename.map" \
      "$ARCHIVE_DIR/${name}_${hash}.${ext}.map"
  fi

	# Write deployment metadata + full build output
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

# Clean up temporary build log
rm -f "$BUILD_LOG"

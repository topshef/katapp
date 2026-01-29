#!/bin/sh
set -e

# Output directories
DIST_DIR="dist"        # Build output from npm
ARCHIVE_DIR="archive"  # Historical copies of deployed bundles
PROD_DIR=".."          # Live deployment target (parent dir)

# Absolute path to the directory containing this script
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# echo "SCRIPT_DIR = $SCRIPT_DIR"


# Temporary file to capture full build output for later reference
BUILD_LOG="$(mktemp)"

# get git info
#[ -f "./git_info.sh" ] && . ./git_info.sh
[ -f "$SCRIPT_DIR/git_info.sh" ] && . "$SCRIPT_DIR/git_info.sh"

# echo "GIT_REPO   = $GIT_REPO"
# echo "GIT_BRANCH = $GIT_BRANCH"
# echo "GIT_HASH   = $GIT_HASH"

#
# Build ID injection (UTC timestamp)
#
# Replaces the BUILDID value with a full UTC timestamp, e.g.:
#   const BUILDID = "2026-01-28T14:37:22Z"
#
# This runs immediately before the build so the value is guaranteed
# to be baked into the bundled output.
# If the BUILDID line is missing, this silently does nothing.
#

PATH_BUILD_TAG="src/buildInfo.js"

if [ -f "$PATH_BUILD_TAG" ]; then
  # Generate UTC timestamp (ISO-like, filesystem- and log-friendly)
  #build_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  build_ts=$(date -u +"%Y-%m-%d %a %H:%M:%S UTC")

	build_id="$build_ts"

  # Append git diagnostics if available
	if [ -n "$GIT_REPO" ] && [ -n "$GIT_BRANCH" ]; then
		build_id="$build_id  $GIT_REPO/tree/$GIT_BRANCH"
		[ -n "$GIT_HASH" ] && build_id="$build_id#$GIT_HASH"
	fi
	
  # Replace existing BUILDID string value, if present
	sed -i \
		"s|\(BUILDID *= *\"\)[^\"]*\(\".*\)|\1$build_id\2|" \
		"$PATH_BUILD_TAG" || true
		
fi

#test build id
echo "BUILDID = $build_id"
# exit 0


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
  ts=$(date -u +"%Y-%m-%d %a %H:%M:%S UTC")

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
- **Build ID:** ${build_id}
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

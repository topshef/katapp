#!/bin/sh
set -e

# --------------------------------------------------
# publish.sh
# Build → snapshot artifact → (optional) release promotion
# --------------------------------------------------

DIST_DIR="dist"
SNAP_DIR="snapshots"
RELEASES_DIR="releases"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
BUILD_LOG="$(mktemp)"

[ -f "$SCRIPT_DIR/git_info.sh" ] && . "$SCRIPT_DIR/git_info.sh"

# --------------------------------------------------
# Detect Git State
# --------------------------------------------------

TREE_CLEAN=false
if git diff --quiet 2>/dev/null; then
  TREE_CLEAN=true
fi

HEAD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

MODE="dirty"
RELEASE_TAG=""
RELEASE_VERSION=""

if [ "$TREE_CLEAN" = true ]; then
  if RELEASE_TAG=$(git describe --tags --exact-match 2>/dev/null); then
    MODE="release"
    RELEASE_VERSION=$(echo "$RELEASE_TAG" | sed -E 's/.*-v([0-9.]+)$/\1/')
  else
    MODE="snapshot"
  fi
fi

echo "----------------------------------------"
echo "MODE            = $MODE"
echo "HEAD_COMMIT     = $HEAD_COMMIT"
echo "RELEASE_TAG     = $RELEASE_TAG"
echo "----------------------------------------"

# see __snapgate__.js for pre-release build info (needs work)

# --------------------------------------------------
# Run Clean Build
# --------------------------------------------------

# Let Vite own dist completely
# rm -rf "$DIST_DIR" 
# delete is set this within vite config..  emptyOutDir: true (and its the default anyway)

npm run build 2>&1 | tee "$BUILD_LOG"

mkdir -p "$SNAP_DIR"
mkdir -p "$RELEASES_DIR"

# --------------------------------------------------
# Process Fresh Build Outputs Only
# --------------------------------------------------

for file in "$DIST_DIR"/*.js; do
  [ -f "$file" ] || continue

  filename=$(basename "$file")
  name="${filename%.*}"
  ext="${filename##*.}"

  hash=$(sha1sum "$file" | cut -c1-6)
  ts=$(date -u +"%Y-%m-%d %a %H:%M:%S UTC")

  # Determine snapshot suffix
  if [ "$MODE" = "dirty" ]; then
    suffix="dirty"
  else
    suffix="$HEAD_COMMIT"
  fi

  SNAP_NAME="${name}.${suffix}.${ext}"
  SNAP_PATH="${SNAP_DIR}/${SNAP_NAME}"

  # Always create snapshot artifact
  cp -f "$file" "$SNAP_PATH"

  # Handle sourcemap if exists
  if [ -f "$DIST_DIR/$filename.map" ]; then
    cp -f "$DIST_DIR/$filename.map" \
      "${SNAP_DIR}/${name}.${suffix}.${ext}.map"
  fi

  # Update snapshot.latest symlink if clean
  if [ "$MODE" != "dirty" ]; then
    LATEST_LINK="${SNAP_DIR}/${name}.snapshot.latest.${ext}"
    rm -f "$LATEST_LINK"
    ln -s "$SNAP_NAME" "$LATEST_LINK"
  fi

	# Always update hottest (bleeding edge)
	HOTTEST_LINK="${SNAP_DIR}/${name}.hottest.${ext}"
	rm -f "$HOTTEST_LINK"
	ln -s "$SNAP_NAME" "$HOTTEST_LINK"

  # Release promotion
  if [ "$MODE" = "release" ] && [ -n "$RELEASE_VERSION" ]; then
    VERSION_DIR="${RELEASES_DIR}/${RELEASE_VERSION}"
    mkdir -p "$VERSION_DIR"
    cp -f "$file" "${VERSION_DIR}/${filename}"

    if [ -f "$DIST_DIR/$filename.map" ]; then
      cp -f "$DIST_DIR/$filename.map" \
        "${VERSION_DIR}/${filename}.map"
    fi
  fi

	# Write metadata to dist (always)
	# DIST_INFO_PATH="${DIST_DIR}/${name}.${suffix}.md"
	DIST_INFO_PATH="${DIST_DIR}/${name}.md"

cat > "$DIST_INFO_PATH" <<EOF
# ${name}

- **Mode:** ${MODE}
- **Release Tag:** ${RELEASE_TAG}
- **Commit:** ${HEAD_COMMIT}
- **Snapshot Artifact:** ${SNAP_NAME}
- **SHA-1:** ${hash}
- **Build ID:** ${build_id}
- **Built:** ${ts}

## Build output

\`\`\`text
$(cat "$BUILD_LOG")
\`\`\`
EOF

	# Copy metadata into snapshots
	cp -f "$DIST_INFO_PATH" "${SNAP_DIR}/${name}.${suffix}.md"

	# If release, copy metadata into release folder
	if [ "$MODE" = "release" ] && [ -n "$RELEASE_VERSION" ]; then
		cp -f "$DIST_INFO_PATH" "${VERSION_DIR}/${name}.md"
	fi


done

rm -f "$BUILD_LOG"

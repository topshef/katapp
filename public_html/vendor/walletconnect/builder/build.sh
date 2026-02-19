#!/bin/sh
set -e

# --------------------------------------------------
# build.sh
# Build → snapshot artifact (per-commit folder)
# --------------------------------------------------

DIST_DIR="dist"
SNAP_DIR="snapshots"

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

if [ "$TREE_CLEAN" = true ]; then
  if RELEASE_TAG=$(git describe --tags --exact-match 2>/dev/null); then
    MODE="release"
  else
    MODE="snapshot"
  fi
fi

echo "----------------------------------------"
echo "MODE        = $MODE"
echo "COMMIT      = $HEAD_COMMIT"
echo "TAG         = $RELEASE_TAG"
echo "----------------------------------------"

# --------------------------------------------------
# Run Clean Build
# --------------------------------------------------

npm run build 2>&1 | tee "$BUILD_LOG"

# --------------------------------------------------
# Create Snapshot Folder (per commit)
# --------------------------------------------------

SNAPSHOT_PATH="${SNAP_DIR}/${HEAD_COMMIT}"

mkdir -p "$SNAPSHOT_PATH"

# --------------------------------------------------
# Copy Build Artifacts
# --------------------------------------------------

for file in "$DIST_DIR"/*.js; do
  [ -f "$file" ] || continue

  filename=$(basename "$file")

  cp -f "$file" "${SNAPSHOT_PATH}/${filename}"

  # Copy sourcemap if exists
  if [ -f "$DIST_DIR/$filename.map" ]; then
    cp -f "$DIST_DIR/$filename.map" \
      "${SNAPSHOT_PATH}/${filename}.map"
  fi
done

# --------------------------------------------------
# Write Metadata
# --------------------------------------------------

ts=$(date -u +"%Y-%m-%d %a %H:%M:%S UTC")

cat > "${SNAPSHOT_PATH}/build.md" <<EOF
# Snapshot ${HEAD_COMMIT}

- **Mode:** ${MODE}
- **Release Tag:** ${RELEASE_TAG}
- **Commit:** ${HEAD_COMMIT}
- **Build ID:** ${build_id}
- **Built:** ${ts}

## Build Output

\`\`\`text
$(cat "$BUILD_LOG")
\`\`\`
EOF

# --------------------------------------------------
# Update snapshot pointers (directory-level)
# --------------------------------------------------

# latest (last clean commit)
if [ "$MODE" != "dirty" ]; then
  rm -f "${SNAP_DIR}/latest"
  ln -s "${HEAD_COMMIT}" "${SNAP_DIR}/latest"
fi

# hottest (always most recent build)
rm -f "${SNAP_DIR}/hottest"
ln -s "${HEAD_COMMIT}" "${SNAP_DIR}/hottest"

rm -f "$BUILD_LOG"

echo "✔ Snapshot created at ${SNAPSHOT_PATH}"

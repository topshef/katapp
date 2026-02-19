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

# --------------------------------------------------
# Detect Git State
# --------------------------------------------------

TREE_CLEAN=false
if git diff --quiet 2>/dev/null; then
  TREE_CLEAN=true
fi

HEAD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

if [ "$TREE_CLEAN" = true ]; then
  MODE="snapshot"
  SNAP_NAME="$HEAD_COMMIT"
else
  MODE="dirty"
  SNAP_NAME="dirty"
fi

echo "----------------------------------------"
echo "MODE   = $MODE"
echo "COMMIT = $HEAD_COMMIT"
echo "----------------------------------------"

# --------------------------------------------------
# Run Clean Build
# --------------------------------------------------

npm run build 2>&1 | tee "$BUILD_LOG"

# --------------------------------------------------
# Create Snapshot Folder
# --------------------------------------------------

SNAPSHOT_PATH="${SNAP_DIR}/${SNAP_NAME}"

# Dirty builds overwrite the dirty folder
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
# Build ${SNAP_NAME}

- **Mode:** ${MODE}
- **Base Commit:** ${HEAD_COMMIT}
- **Built:** ${ts}

## Build Output

\`\`\`text
$(cat "$BUILD_LOG")
\`\`\`
EOF

# --------------------------------------------------
# Update Snapshot Pointers (directory-level symlinks)
# --------------------------------------------------

# latest = most recent clean snapshot
if [ "$MODE" = "snapshot" ]; then
  rm -f "${SNAP_DIR}/latest"
  ln -s "${HEAD_COMMIT}" "${SNAP_DIR}/latest"
fi

# hottest = most recent build (clean or dirty)
rm -f "${SNAP_DIR}/hottest"
ln -s "${SNAP_NAME}" "${SNAP_DIR}/hottest"

rm -f "$BUILD_LOG"

echo "✔ Snapshot created at ${SNAPSHOT_PATH}"

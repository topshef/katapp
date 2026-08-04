#!/bin/sh
set -e

# --------------------------------------------------
# build.sh
# Build → snapshot artifact (per-commit folder)
# --------------------------------------------------


APP_NAME=$(node -p "require('./package.json').name")


DIST_DIR="dist"
SNAP_DIR="snapshots"

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
  GITSTATUS="clean"
  SNAP_NAME="$HEAD_COMMIT"
else
  GITSTATUS="dirty"
  SNAP_NAME="dirty"
fi

echo "----------------------------------------"
echo "APP_NAME   = $APP_NAME"
echo "GIT STATUS = $GITSTATUS"
echo "GIT COMMIT = $HEAD_COMMIT"
echo "SNAP_NAME  = $SNAP_NAME"
echo "DIST_DIR   = $DIST_DIR"
echo "SNAP_DIR   = $SNAP_DIR"
echo "BUILD_LOG  = $BUILD_LOG"
echo "----------------------------------------"

echo "DEBUG: SNAP_DIR=$SNAP_DIR"

# --------------------------------------------------
# Pre-Build Sanity Check (dist should be empty)
# --------------------------------------------------

if [ -d "$DIST_DIR" ] && [ "$(ls -A "$DIST_DIR" 2>/dev/null)" ]; then
  echo "⚠ WARNING: $DIST_DIR is not empty before build."
  echo "⚠ Ensure Vite 'emptyOutDir: true' is working."
fi



# --------------------------------------------------
# Run Clean Build
# --------------------------------------------------

# WC-RELAYHEALTH1 (2026-08-04): KWC_BUILD=build:lite selects the esbuild fallback
# (build-lite.mjs) when the box can't feed vite/rollup ~2GB. Default unchanged.
npm run "${KWC_BUILD:-build}" 2>&1 | tee "$BUILD_LOG"

# --------------------------------------------------
# Create Snapshot Folder
# --------------------------------------------------

SNAPSHOT_PATH="${SNAP_DIR}/${SNAP_NAME}"
mkdir -p "$SNAPSHOT_PATH"

# --------------------------------------------------
# Copy Build Artifacts
# --------------------------------------------------

# for file in "$DIST_DIR"/*; do
  # [ -f "$file" ] || continue

  # filename=$(basename "$file")
  # cp -f "$file" "${SNAPSHOT_PATH}/${filename}"

  # if [ -f "$DIST_DIR/$filename.map" ]; then
    # cp -f "$DIST_DIR/$filename.map" \
      # "${SNAPSHOT_PATH}/${filename}.map"
  # fi
# done


# --------------------------------------------------
# Copy Build Artifacts (assume dist was emptied beforehand)
# --------------------------------------------------

#cp -R "$DIST_DIR"/. "$SNAPSHOT_PATH"/
mv "$DIST_DIR"/* "$SNAPSHOT_PATH"/

#empty dist folder (should be empty anyway)
#rmdir "$DIST_DIR" 2>/dev/null || true


# --------------------------------------------------
# Write Metadata (Markdown)
# --------------------------------------------------

ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > "${SNAPSHOT_PATH}/build.md" <<EOF
# Build ${SNAP_NAME} ${APP_NAME}

- **GITSTATUS:** ${GITSTATUS}
- **Base Commit:** ${HEAD_COMMIT}
- **Built:** ${ts}

## Build Output

\`\`\`text
$(cat "$BUILD_LOG")
\`\`\`
EOF

# --------------------------------------------------
# Write Metadata (JSON)
# --------------------------------------------------

cat > "${SNAPSHOT_PATH}/build.json" <<EOF
{
  "appname": "${APP_NAME}",
  "snapshot": "${SNAP_NAME}",
  "GITSTATUS": "${GITSTATUS}",
  "base_commit": "${HEAD_COMMIT}",
  "built_at": "${ts}"
}
EOF

# --------------------------------------------------
# Create Compressed Artifact (.tar.gz)
# --------------------------------------------------

#keep archive name static to allow htaccess and symlinks to operate
ARCHIVE_NAME="${APP_NAME}.tar.gz"
# ARCHIVE_NAME="${APP_NAME}.${HEAD_COMMIT}.${GITSTATUS}.tar.gz"

ARCHIVE_PATH="${SNAPSHOT_PATH}/${ARCHIVE_NAME}"

# tar -czf "$ARCHIVE_PATH" -C "$SNAPSHOT_PATH" .
tar -czf "$ARCHIVE_PATH" -C "$SNAPSHOT_PATH" . || true


# --------------------------------------------------
# Publish to shared snapshot store (WC-LABPROP1)
# --------------------------------------------------
# Clean-commit snapshots are immutable and content-addressed, so they live in
# ONE box-wide store that every seat/site serves from (via the snapshots-shared
# symlink + .htaccess fallback) — a git pin flip can then never outrun its
# bundle. Dirty builds stay seat-local. First write wins; never overwrite.

KWC_STORE="${KWC_STORE:-/var/www/kwc-snapshots}"
if [ "$GITSTATUS" = "clean" ] && [ -d "$KWC_STORE" ] && [ ! -d "$KWC_STORE/$SNAP_NAME" ]; then
  cp -r "$SNAPSHOT_PATH" "$KWC_STORE/$SNAP_NAME"
  chown -R www-data:www-data "$KWC_STORE/$SNAP_NAME" 2>/dev/null || true
  echo "✔ Published to store ${KWC_STORE}/${SNAP_NAME}"
fi

# --------------------------------------------------
# Update Snapshot Pointers (directory-level symlinks)
# --------------------------------------------------

if [ "$GITSTATUS" = "clean" ]; then
  rm -f "${SNAP_DIR}/latest"
  ln -s "${HEAD_COMMIT}" "${SNAP_DIR}/latest"
fi

rm -f "${SNAP_DIR}/hottest"
ln -s "${SNAP_NAME}" "${SNAP_DIR}/hottest"

rm -f "$BUILD_LOG"

echo "✔ Snapshot created at ${SNAPSHOT_PATH}"
echo "✔ Archive created at ${ARCHIVE_PATH}"

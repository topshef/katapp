#!/bin/sh
set -e

# publish.sh
# Always outputs a uniquely named snapshot into dist/
# If tagged release, also copies into releases/<version>/

DIST_DIR="dist"
ARCHIVE_DIR="archive"
RELEASES_DIR="releases"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
BUILD_LOG="$(mktemp)"

[ -f "$SCRIPT_DIR/git_info.sh" ] && . "$SCRIPT_DIR/git_info.sh"

# --------------------------------------------------
# Detect Git state
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

# --------------------------------------------------
# Inject Build ID
# --------------------------------------------------

PATH_BUILD_TAG="src/buildInfo.js"

if [ -f "$PATH_BUILD_TAG" ]; then
  build_ts=$(date -u +"%Y-%m-%d %a %H:%M:%S UTC")
  build_id="$build_ts"

  if [ -n "$GIT_REPO" ] && [ -n "$GIT_BRANCH" ]; then
    build_id="$build_id  $GIT_REPO/tree/$GIT_BRANCH"
    [ -n "$GIT_HASH" ] && build_id="$build_id#$GIT_HASH"
  fi

  sed -i \
    "s|\(BUILDID *= *\"\)[^\"]*\(\".*\)|\1$build_id\2|" \
    "$PATH_BUILD_TAG" || true
fi

echo "BUILDID = $build_id"

# --------------------------------------------------
# Run build
# --------------------------------------------------

npm run build 2>&1 | tee "$BUILD_LOG"

mkdir -p "$ARCHIVE_DIR"
mkdir -p "$RELEASES_DIR"

# --------------------------------------------------
# Process built artifacts
# --------------------------------------------------

for file in "$DIST_DIR"/*; do
  [ -f "$file" ] || continue

  filename=$(basename "$file")

  case "$filename" in
    *.map) continue ;;
  esac

  name="${filename%.*}"
  ext="${filename##*.}"

  hash=$(sha1sum "$file" | cut -c1-6)
  ts=$(date -u +"%Y-%m-%d %a %H:%M:%S UTC")

  # Determine suffix
  if [ "$MODE" = "dirty" ]; then
    suffix="dirty"
  else
    suffix="$HEAD_COMMIT"
  fi

  SNAP_NAME="${name}.${suffix}.${ext}"
  SNAP_PATH="${DIST_DIR}/${SNAP_NAME}"

  # Always create snapshot artifact
  cp -f "$file" "$SNAP_PATH"

  # Archive hashed copy
  cp -f "$file" "${ARCHIVE_DIR}/${name}_${hash}.${ext}"

  # Handle sourcemap
  if [ -f "$DIST_DIR/$filename.map" ]; then
    cp -f "$DIST_DIR/$filename.map" \
      "${ARCHIVE_DIR}/${name}_${hash}.${ext}.map"

    cp -f "$DIST_DIR/$filename.map" \
      "${DIST_DIR}/${name}.${suffix}.${ext}.map"
  fi

  # Update snapshot.latest symlink if clean
  if [ "$MODE" != "dirty" ]; then
    LATEST_LINK="${DIST_DIR}/${name}.snapshot.latest.${ext}"
    rm -f "$LATEST_LINK"
    ln -s "$SNAP_NAME" "$LATEST_LINK"
  fi

  # If release, also copy raw bundle into releases/<version>/
  if [ "$MODE" = "release" ] && [ -n "$RELEASE_VERSION" ]; then
    VERSION_DIR="${RELEASES_DIR}/${RELEASE_VERSION}"
    mkdir -p "$VERSION_DIR"
    cp -f "$file" "${VERSION_DIR}/${filename}"
  fi

  # Metadata
  INFO_PATH="${DIST_DIR}/${name}.${suffix}.md"

  cat > "$INFO_PATH" <<EOF
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

done

rm -f "$BUILD_LOG"

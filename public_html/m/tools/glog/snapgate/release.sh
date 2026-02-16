#!/bin/sh
# ============================================================
# Snapgate
# Lightweight commit-locked release harness for microservices
#
# Release Flow:
#   1. Bump version in package.json
#   2. Run ./snapgate/changelog.sh --write
#   3. Commit package.json + CHANGELOG.md
#   4. Run ./snapgate/release.sh --run
#
# See snapgate/SNAPGATE.md for full documentation.
# ============================================================

SNAPGATE_VERSION="0.1.1"
MODE="$1"

set -e

# --------------------------------------------------
# SNAPGATE ROOT RESOLUTION
# --------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT" || exit 1

if [ ! -f "package.json" ]; then
  echo "❌ package.json not found in project root."
  exit 1
fi

PACKAGE_PATH="package.json"

# ============================================================
# 1. VALIDATION
# ============================================================

if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree not clean."
  exit 1
fi

PREFIX=$(git rev-parse --show-prefix)
TARGET_PATH="${PREFIX}${PACKAGE_PATH}"

if ! git diff-tree --no-commit-id --name-only -r HEAD | grep -q "^${TARGET_PATH}$"; then
  echo "❌ Last commit did not modify package.json."
  exit 1
fi

NAME=$(grep '"name"' "$PACKAGE_PATH" | head -1 | sed -E 's/.*"name": *"([^"]+)".*/\1/')
VERSION=$(grep '"version"' "$PACKAGE_PATH" | head -1 | sed -E 's/.*"version": *"([^"]+)".*/\1/')

if [ -z "$NAME" ] || [ -z "$VERSION" ]; then
  echo "❌ Failed to extract name or version."
  exit 1
fi

PREV_VERSION=$(git show HEAD^:"$PACKAGE_PATH" 2>/dev/null | \
  grep '"version"' | head -1 | sed -E 's/.*"version": *"([^"]+)".*/\1/')

if [ -n "$PREV_VERSION" ] && [ "$VERSION" = "$PREV_VERSION" ]; then
  echo "❌ Version was not incremented in last commit."
  exit 1
fi

TAG="${NAME}-v${VERSION}"
DIST_DIR="dist/${VERSION}"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌ Tag $TAG already exists."
  exit 1
fi

if [ -e "$DIST_DIR" ]; then
  echo "❌ Dist directory $DIST_DIR already exists."
  exit 1
fi

# ============================================================
# 2. DIAGNOSTICS
# ============================================================

HEAD_SHORT=$(git rev-parse --short HEAD)
HEAD_FULL=$(git rev-parse HEAD)
HEAD_DATE=$(git log -1 --format=%cd --date=short)

echo "--------------------------------------------------"
echo "Snapgate v$SNAPGATE_VERSION"
echo "Package:   $NAME"
echo "Version:   $VERSION"
echo "Tag:       $TAG"
echo "Commit:    $HEAD_SHORT ($HEAD_DATE)"
echo "Dist:      $DIST_DIR"
echo "--------------------------------------------------"

if [ -z "$MODE" ]; then
  echo "✔ Validation passed."
  echo "Run './snapgate/release.sh --run' to execute."
  exit 0
fi

if [ "$MODE" = "--dry-run" ]; then
  echo "✔ Dry run complete."
  exit 0
fi

if [ "$MODE" != "--run" ]; then
  echo "Usage:"
  echo "  ./snapgate/release.sh"
  echo "  ./snapgate/release.sh --dry-run"
  echo "  ./snapgate/release.sh --run"
  exit 1
fi

# ============================================================
# 3. BUILD SNAPSHOT
# ============================================================

mkdir -p "$DIST_DIR"
cp -a "src/." "$DIST_DIR/"
cp "$PACKAGE_PATH" "$DIST_DIR/"

rm -f dist/latest
ln -s "$VERSION" dist/latest

# ============================================================
# 4. RELEASE MANIFEST
# ============================================================

RELEASE_FILE="$DIST_DIR/RELEASE_INFO.md"
RELEASE_DATE=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

{
  echo "# $NAME v$VERSION"
  echo
  echo "Released: $RELEASE_DATE"
  echo "Tag: $TAG"
  echo "Commit: $HEAD_SHORT"
  echo "Full SHA: $HEAD_FULL"
  echo "Snapgate: v$SNAPGATE_VERSION"
  echo
  echo "---"
  echo "## Changelog Snapshot"
  echo
  cat CHANGELOG.md
} > "$RELEASE_FILE"

# ============================================================
# 5. TAG + PUSH
# ============================================================

git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"

echo "✔ Release complete."

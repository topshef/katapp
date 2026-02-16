#!/bin/sh

MODE="$1"

set -e

PACKAGE_PATH="package.json"

# ============================================================
# 1. VALIDATION
# ============================================================

# Ensure working tree is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree not clean. Commit or stash changes first."
  exit 1
fi

PREFIX=$(git rev-parse --show-prefix)
TARGET_PATH="${PREFIX}${PACKAGE_PATH}"

if ! git diff-tree --no-commit-id --name-only -r HEAD | grep -q "^${TARGET_PATH}$"; then
  echo "❌ Last commit did not modify package.json in this project."
  exit 1
fi

# Extract name and version
NAME=$(grep '"name"' "$PACKAGE_PATH" | head -1 | sed -E 's/.*"name": *"([^"]+)".*/\1/')
VERSION=$(grep '"version"' "$PACKAGE_PATH" | head -1 | sed -E 's/.*"version": *"([^"]+)".*/\1/')

if [ -z "$NAME" ] || [ -z "$VERSION" ]; then
  echo "❌ Failed to extract name or version from package.json"
  exit 1
fi

TAG="${NAME}-v${VERSION}"
DIST_DIR="dist/${VERSION}"

# ============================================================
# 2. DIAGNOSTICS (ALWAYS PRINTED)
# ============================================================

HEAD_SHORT=$(git rev-parse --short HEAD)
HEAD_FULL=$(git rev-parse HEAD)
HEAD_DATE=$(git log -1 --format=%cd --date=short)

echo "--------------------------------------------------"
echo "Release diagnostics"
echo "--------------------------------------------------"
echo "Package:        $NAME"
echo "Version:        $VERSION"
echo "Tag:            $TAG"
echo "HEAD commit:    $HEAD_SHORT ($HEAD_DATE)"
echo "Full SHA:       $HEAD_FULL"
echo "Dist target:    $DIST_DIR"
echo "--------------------------------------------------"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌ Tag $TAG already exists."
  exit 1
fi

if [ -e "$DIST_DIR" ]; then
  echo "❌ Dist directory $DIST_DIR already exists."
  exit 1
fi

# Default mode = inspect only
if [ -z "$MODE" ]; then
  echo "✔ Validation passed."
  echo "Run './release.sh --run' to execute release."
  exit 0
fi

if [ "$MODE" = "--dry-run" ]; then
  echo "✔ Dry run complete. No changes made."
  exit 0
fi

if [ "$MODE" != "--run" ]; then
  echo "Usage:"
  echo "  ./release.sh          (inspect only)"
  echo "  ./release.sh --dry-run"
  echo "  ./release.sh --run"
  exit 1
fi

# ============================================================
# 3. BUILD (EXECUTION MODE ONLY)
# ============================================================

echo "🚀 Executing release..."

mkdir -p "$DIST_DIR"
cp -a "src/." "$DIST_DIR/"
cp "$PACKAGE_PATH" "$DIST_DIR/"

rm -f dist/latest
ln -s "$VERSION" dist/latest

echo "✔ Build snapshot created."

# ============================================================
# 4. RELEASE MANIFEST GENERATION
# ============================================================

RELEASE_FILE="$DIST_DIR/RELEASE_INFO.md"
RELEASE_DATE=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

PREV_TAG=$(git describe --tags --abbrev=0 2>/dev/null || true)

{
  echo "# $NAME v$VERSION"
  echo
  echo "Released: $RELEASE_DATE"
  echo "Tag:      $TAG"
  echo "Commit:   $HEAD_SHORT"
  echo "Full SHA: $HEAD_FULL"
  echo

  if [ -n "$PREV_TAG" ]; then
    echo "## Commits since $PREV_TAG"
    git log "${PREV_TAG}..HEAD" --pretty=format:"- %h %s"
  else
    echo "## Initial release"
    git log HEAD --pretty=format:"- %h %s"
  fi

  echo
} > "$RELEASE_FILE"

echo "✔ RELEASE_INFO.md generated."

# ============================================================
# 5. TAG + PUSH
# ============================================================

git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"

echo "✔ Tag created and pushed."
echo "🎉 Release complete."

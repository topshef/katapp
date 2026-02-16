#!/bin/sh

set -e

MODE="$1"

PACKAGE_PATH="package.json"

usage() {
  echo "Usage:"
  echo "  ./release.sh              # check release readiness"
  echo "  ./release.sh --run        # perform release"
  echo "  ./release.sh --dry-run    # simulate release"
  echo "  ./release.sh --help       # show this help"
  echo
}

# -----------------------------
# HELP
# -----------------------------
if [ "$MODE" = "--help" ]; then
  usage
  exit 0
fi

echo "Release inspection..."

# -----------------------------
# CHECK WORKING TREE
# -----------------------------
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree is NOT clean."
  echo "   Commit or stash changes before releasing."
  exit 1
else
  echo "✅ Working tree is clean."
fi

# -----------------------------
# ENSURE LAST COMMIT TOUCHED package.json
# -----------------------------
PREFIX=$(git rev-parse --show-prefix)
TARGET_PATH="${PREFIX}${PACKAGE_PATH}"

if git diff-tree --no-commit-id --name-only -r HEAD | grep -q "^${TARGET_PATH}$"; then
  echo "✅ Last commit modified package.json."
else
  echo "❌ Last commit did NOT modify package.json."
  echo "   You must bump the version before releasing."
  exit 1
fi

# -----------------------------
# EXTRACT NAME + VERSION
# -----------------------------
NAME=$(grep '"name"' "$PACKAGE_PATH" | head -1 | sed -E 's/.*"name": *"([^"]+)".*/\1/')
VERSION=$(grep '"version"' "$PACKAGE_PATH" | head -1 | sed -E 's/.*"version": *"([^"]+)".*/\1/')

if [ -z "$NAME" ] || [ -z "$VERSION" ]; then
  echo "❌ Failed to extract name or version from package.json"
  exit 1
fi

TAG="${NAME}-v${VERSION}"
DIST_DIR="dist/${VERSION}"

echo
echo "Package: $NAME"
echo "Version: $VERSION"
echo "Tag:     $TAG"
echo "Dist:    $DIST_DIR"
echo

# -----------------------------
# CHECK TAG EXISTS
# -----------------------------
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "❌ Tag $TAG already exists."
  exit 1
else
  echo "✅ Tag does not yet exist."
fi

# -----------------------------
# CHECK DIST EXISTS
# -----------------------------
if [ -e "$DIST_DIR" ]; then
  echo "❌ Dist directory already exists: $DIST_DIR"
  exit 1
else
  echo "✅ Dist directory will be created."
fi

echo

# -----------------------------
# DEFAULT MODE = INSPECTION ONLY
# -----------------------------
if [ -z "$MODE" ]; then
  echo "Ready to release."
  echo
  echo "Run:"
  echo "  ./release.sh --run"
  echo
  exit 0
fi

# -----------------------------
# DRY RUN MODE
# -----------------------------
if [ "$MODE" = "--dry-run" ]; then
  echo "---- DRY RUN ----"
  echo "Would create: $DIST_DIR"
  echo "Would tag:    $TAG"
  echo "Would push tag to origin"
  exit 0
fi

# -----------------------------
# EXECUTION MODE
# -----------------------------
if [ "$MODE" != "--run" ]; then
  echo "Unknown option: $MODE"
  usage
  exit 1
fi

echo "Starting release..."

# ---- BUILD STEP ----
mkdir -p "$DIST_DIR"
cp -a "src/." "$DIST_DIR/"
cp package.json "$DIST_DIR/"

rm -f dist/latest
ln -s "$VERSION" dist/latest

echo "Build complete."
echo "Dist folder created and latest symlink updated."

# ---- TAG ----
git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"

echo
echo "Release complete."
echo "Released $NAME v$VERSION"

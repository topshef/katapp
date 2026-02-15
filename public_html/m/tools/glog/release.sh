#!/bin/sh

DRY_RUN=${1:-}

set -e

echo "Starting release..."

PACKAGE_PATH="package.json"

# Ensure working tree is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree not clean. Commit or stash changes first."
  exit 1
fi

PREFIX=$(git rev-parse --show-prefix)
TARGET_PATH="${PREFIX}${PACKAGE_PATH}"

if ! git diff-tree --no-commit-id --name-only -r HEAD | grep -q "^${TARGET_PATH}$"; then
  echo "Last commit did not modify package.json in this project. Aborting."
  exit 1
fi

# Extract name and version
NAME=$(grep '"name"' "$PACKAGE_PATH" | head -1 | sed -E 's/.*"name": *"([^"]+)".*/\1/')
VERSION=$(grep '"version"' "$PACKAGE_PATH" | head -1 | sed -E 's/.*"version": *"([^"]+)".*/\1/')

if [ -z "$NAME" ] || [ -z "$VERSION" ]; then
  echo "Failed to extract name or version from package.json"
  exit 1
fi

TAG="${NAME}-v${VERSION}"

echo "Preparing release $TAG"
echo "Version: $VERSION"
echo "Target dist folder: dist/${VERSION}"

# Fail if tag already exists
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Tag $TAG already exists. Aborting."
  exit 1
fi

# ---- BUILD STEP ----

SRC_DIR="src"
DIST_DIR="dist/${VERSION}"

if [ -e "$DIST_DIR" ]; then
  echo "Dist directory $DIST_DIR already exists. Aborting."
  exit 1
fi

mkdir -p "$DIST_DIR"
cp -a "$SRC_DIR/." "$DIST_DIR/"

rm -f dist/latest
ln -s "$VERSION" dist/latest

echo "Build complete."
echo "Dist folder created and latest symlink updated."

if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "---- DRY RUN COMPLETE ----"
  echo "Tag would be: $TAG"
  exit 0
fi

# ---- TAG ----
git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"

echo "Release complete."

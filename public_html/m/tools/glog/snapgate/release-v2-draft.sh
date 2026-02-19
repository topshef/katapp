#!/bin/sh
set -e

# Usage:
# ./release.sh v1.2.3 abc123 "Release notes"

VERSION="$1"
COMMIT="$2"
shift 2
MESSAGE="$*"

if [ -z "$VERSION" ] || [ -z "$COMMIT" ]; then
  echo "Usage:"
  echo "  ./release.sh <version> <commit> [message]"
  exit 1
fi

# Ensure commit exists
if ! git cat-file -e "$COMMIT^{commit}" 2>/dev/null; then
  echo "❌ Commit $COMMIT does not exist."
  exit 1
fi

# Ensure snapshot exists
if [ ! -d "snapshots/$COMMIT" ]; then
  echo "❌ Snapshot folder snapshots/$COMMIT not found. Build it with build.sh"
  exit 1
fi

# Ensure tag does not exist
if git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo "❌ Tag $VERSION already exists."
  exit 1
fi
# To delete a tag (but not recommended):
# git tag -d v1.2.3
# git push origin :refs/tags/v1.2.3


# Default message
if [ -z "$MESSAGE" ]; then
  MESSAGE="Release $VERSION"
fi

echo "--------------------------------------------------"
echo "Version: $VERSION"
echo "Commit:  $COMMIT"
echo "--------------------------------------------------"

# Create annotated tag for specific commit
git tag -a "$VERSION" "$COMMIT" -m "$MESSAGE"

git push origin "$VERSION"

# Create release symlink
mkdir -p releases

rm -f "releases/$VERSION"
ln -s "../snapshots/$COMMIT" "releases/$VERSION"

# Update latest
rm -f "releases/latest"
ln -s "$VERSION" "releases/latest"

echo "✔ Release $VERSION → $COMMIT complete."

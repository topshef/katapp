#!/bin/sh
set -e

# Usage:
# ./release.sh v1.2.3 abc123 "Release notes"

VERSION="$1"
COMMIT="$2"
shift 2
MESSAGE="$*"


# Resolve project root (one level up from this script)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SNAP_DIR_NAME="snapshots"
SNAP_DIR="$PROJECT_ROOT/$SNAP_DIR_NAME"
RELEASE_DIR="$PROJECT_ROOT/releases"



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
if [ ! -d "$SNAP_DIR/$COMMIT" ]; then
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
mkdir -p "$RELEASE_DIR"


rm -f "$RELEASE_DIR/$VERSION"
ln -s "../$SNAP_DIR_NAME/$COMMIT" "$RELEASE_DIR/$VERSION"

# Write release metadata (deployment truth)
cat > "$RELEASE_DIR/$VERSION/release.json" <<EOF
{
  "version": "$VERSION",
  "commit": "$COMMIT",
  "message": "$MESSAGE",
  "released_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF


# Update latest
rm -f "$RELEASE_DIR/latest"
ln -s "$VERSION" "$RELEASE_DIR/latest"

echo "✔ Release $VERSION → $COMMIT complete."

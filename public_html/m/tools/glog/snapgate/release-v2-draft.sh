#!/bin/sh
# ============================================================
# Release v2 (Draft)
# Lean Git-Tag-Based Release Script
#
# Philosophy:
#   - The release is the tested commit.
#   - No rebuild occurs at release time.
#   - Git tag is the version source of truth.
#   - Annotated tags are preferred.
#
# Usage:
#   ./release-v2-draft.sh v1.2.3
#   ./release-v2-draft.sh v1.2.3 "Optional release message"
# ============================================================

set -e

VERSION="$1"
MESSAGE="$2"

if [ -z "$VERSION" ]; then
  echo "Usage:"
  echo "  ./release-v2-draft.sh v1.2.3"
  echo "  ./release-v2-draft.sh v1.2.3 \"Release notes\""
  exit 1
fi

# Ensure working tree is clean
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree not clean."
  exit 1
fi

# Ensure tag does not already exist
if git rev-parse "$VERSION" >/dev/null 2>&1; then
  echo "❌ Tag $VERSION already exists."
  exit 1
fi

COMMIT=$(git rev-parse --short HEAD)
DATE=$(git log -1 --format=%cd --date=short)

echo "--------------------------------------------------"
echo "Preparing release:"
echo "  Version: $VERSION"
echo "  Commit:  $COMMIT ($DATE)"
echo "--------------------------------------------------"

# Default message if none provided
if [ -z "$MESSAGE" ]; then
  MESSAGE="Release $VERSION"
fi

# Create annotated tag
git tag -a "$VERSION" -m "$MESSAGE"

# Push tag
git push origin "$VERSION"


commit=$(git rev-parse --short HEAD)
ln -s ../snapshots/$commit releases/$VERSION
ln -s $VERSION releases/latest


echo "✔ Release tag $VERSION created and pushed."

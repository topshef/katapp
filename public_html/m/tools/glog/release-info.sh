#!/bin/sh

set -e

TAG_PREFIX="glog-v"

# Extract owner/repo from remote origin URL
REPO_PATH=$(git config --get remote.origin.url | \
  sed -E 's#.*[:/]([^/]+/[^/]+)\.git#\1#')

REPO_URL="https://github.com/${REPO_PATH}"

REQUESTED_VERSION=$1

# If version passed → show that release
if [ -n "$REQUESTED_VERSION" ]; then
  CURRENT_TAG="${TAG_PREFIX}${REQUESTED_VERSION}"
  SHOW_UNRELEASED=false
else
  # Otherwise show unreleased (last tag → HEAD)
  CURRENT_TAG=$(git tag --list "${TAG_PREFIX}*" --sort=-creatordate | head -n 1)
  SHOW_UNRELEASED=true
fi

if [ -z "$CURRENT_TAG" ]; then
  echo "No release tags found."
  exit 1
fi

# ------------------------------
# UNRELEASED MODE
# ------------------------------
if [ "$SHOW_UNRELEASED" = true ]; then
  echo "## Unreleased changes since ${CURRENT_TAG}"
  echo

  git log "${CURRENT_TAG}..HEAD" \
    --pretty=format:"- [%h](${REPO_URL}/commit/%H) %s (%ad)" \
    --date=short

  echo
  exit 0
fi

# ------------------------------
# SPECIFIC RELEASE MODE
# ------------------------------

echo "## ${CURRENT_TAG}"
echo

# Find previous tag
PREVIOUS_TAG=$(git tag --list "${TAG_PREFIX}*" --sort=-creatordate | \
  grep -A1 "^${CURRENT_TAG}$" | tail -n 1)

if [ -z "$PREVIOUS_TAG" ] || [ "$PREVIOUS_TAG" = "$CURRENT_TAG" ]; then
  echo "_No previous release found._"
  echo
  git log "${CURRENT_TAG}" \
    --pretty=format:"- [%h](${REPO_URL}/commit/%H) %s (%ad)" \
    --date=short
  echo
  exit 0
fi

echo "_Changes since ${PREVIOUS_TAG}_"
echo

git log "${PREVIOUS_TAG}..${CURRENT_TAG}" \
  --pretty=format:"- [%h](${REPO_URL}/commit/%H) %s (%ad)" \
  --date=short

echo

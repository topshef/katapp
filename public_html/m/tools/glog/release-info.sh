#!/bin/sh

set -e

TAG_PREFIX="glog-v"

REPO_PATH=$(git config --get remote.origin.url | \
  sed -E 's#.*[:/]([^/]+/[^/]+)\.git#\1#')

REPO_URL="https://github.com/${REPO_PATH}"

REQUESTED_VERSION=$1

if [ -n "$REQUESTED_VERSION" ]; then
  CURRENT_TAG="${TAG_PREFIX}${REQUESTED_VERSION}"
else
  CURRENT_TAG=$(git tag --list "${TAG_PREFIX}*" --sort=-creatordate | head -n 1)
fi

if [ -z "$CURRENT_TAG" ]; then
  echo "No release tags found."
  exit 1
fi

echo "Release: $CURRENT_TAG"

PREVIOUS_TAG=$(git tag --list "${TAG_PREFIX}*" --sort=-creatordate | \
  grep -A1 "^${CURRENT_TAG}$" | tail -n 1)

if [ -z "$PREVIOUS_TAG" ] || [ "$PREVIOUS_TAG" = "$CURRENT_TAG" ]; then
  echo "No previous release found."
  echo
  git log "$CURRENT_TAG" \
    --pretty=format:"- [%h](${REPO_URL}/commit/%H) %s"
  exit 0
fi

echo "Previous: $PREVIOUS_TAG"
echo

git log "${PREVIOUS_TAG}..${CURRENT_TAG}" \
  --pretty=format:"- [%h](${REPO_URL}/commit/%H) %s (%ad)" \
  --date=short

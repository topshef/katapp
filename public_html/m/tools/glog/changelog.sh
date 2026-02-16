#!/bin/sh

set -e

NAME=$(sed -nE 's/.*"name": *"([^"]+)".*/\1/p' package.json | head -1)
TAG_PREFIX="${NAME}-v"

CHANGELOG_FILE="CHANGELOG.md"
INSERT_MARKER="<!-- INSERT_HERE -->"

# Extract owner/repo (ignore domain)
REPO_PATH=$(git config --get remote.origin.url | \
  sed -E 's#.*[:/]([^/]+/[^/]+)\.git#\1#')

REPO_URL="https://github.com/${REPO_PATH}"

REQUESTED_VERSION=""
WRITE_FLAG=false

for arg in "$@"
do
  if [ "$arg" = "--write" ]; then
    WRITE_FLAG=true
  else
    REQUESTED_VERSION="$arg"
  fi
done

if [ -n "$REQUESTED_VERSION" ]; then
  CURRENT_TAG="${TAG_PREFIX}${REQUESTED_VERSION}"
  SHOW_UNRELEASED=false
else
  CURRENT_TAG=$(git tag --list "${TAG_PREFIX}*" --sort=-creatordate | head -n 1)
  SHOW_UNRELEASED=true
fi

if [ -z "$CURRENT_TAG" ]; then
  echo "No release tags found."
  exit 1
fi

TMP_FILE=$(mktemp)

if [ "$SHOW_UNRELEASED" = true ]; then
 
PKG_VERSION=$(grep '"version"' package.json | head -1 | sed -E 's/.*"version": *"([^"]+)".*/\1/')

	if git diff --quiet package.json; then
		# package.json not modified
		HEADER="## Unreleased"
	else
		# package.json modified (likely version bumped)
		HEADER="## ${TAG_PREFIX}${PKG_VERSION} (unreleased)"
	fi
  {
    echo "$HEADER"
    echo
    git log "${CURRENT_TAG}..HEAD" \
      --pretty=format:"- [%h](${REPO_URL}/commit/%H) %s (%ad)" \
      --date=short
    echo
  } > "$TMP_FILE"

else
  PREVIOUS_TAG=$(git tag --list "${TAG_PREFIX}*" --sort=-creatordate | \
    grep -A1 "^${CURRENT_TAG}$" | tail -n 1)

  {
    echo "## ${CURRENT_TAG}"
    echo

    if [ -n "$PREVIOUS_TAG" ] && [ "$PREVIOUS_TAG" != "$CURRENT_TAG" ]; then
      echo "_Changes since ${PREVIOUS_TAG}_"
      echo
      git log "${PREVIOUS_TAG}..${CURRENT_TAG}" \
        --pretty=format:"- [%h](${REPO_URL}/commit/%H) %s (%ad)" \
        --date=short
    else
      echo "_Initial release_"
      echo
      git log "${CURRENT_TAG}" \
        --pretty=format:"- [%h](${REPO_URL}/commit/%H) %s (%ad)" \
        --date=short
    fi

    echo
  } > "$TMP_FILE"
fi

# If not writing, just print
if [ "$WRITE_FLAG" != true ]; then
  cat "$TMP_FILE"
  rm "$TMP_FILE"
  exit 0
fi

# Ensure changelog exists
if [ ! -f "$CHANGELOG_FILE" ]; then
  {
    echo "# Changelog"
    echo
    echo "$INSERT_MARKER"
    echo
  } > "$CHANGELOG_FILE"
fi

# Ensure marker exists
if ! grep -q "$INSERT_MARKER" "$CHANGELOG_FILE"; then
  echo "Insert marker not found in $CHANGELOG_FILE"
  rm "$TMP_FILE"
  exit 1
fi

# Insert content after marker (robust match)
INSERTED_FLAG=$(mktemp)

awk -v marker="$INSERT_MARKER" -v tmp="$TMP_FILE" -v flag="$INSERTED_FLAG" '
{
  print
  if (index($0, marker)) {
    while ((getline line < tmp) > 0)
      print line
    close(tmp)
    print "yes" > flag
    close(flag)
  }
}' "$CHANGELOG_FILE" > "${CHANGELOG_FILE}.new"

# Ensure we actually inserted
if [ ! -s "$INSERTED_FLAG" ]; then
  rm -f "${CHANGELOG_FILE}.new" "$TMP_FILE" "$INSERTED_FLAG"
  echo "Marker match failed; nothing written."
  exit 1
fi

mv "${CHANGELOG_FILE}.new" "$CHANGELOG_FILE"

echo
echo "WROTE:"
cat "$TMP_FILE"
echo
echo "CHANGELOG.md updated."

rm -f "$TMP_FILE" "$INSERTED_FLAG"

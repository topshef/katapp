#!/bin/sh

# Snapgate
# Generates or previews changelog entries from commit history.
# use this inconjucntion with release.sh
# See snapgate/SNAPGATE.md for full release workflow.


# Exit immediately if any command fails
# This prevents partial writes or half-generated changelogs
set -e

# --------------------------------------------------
# SNAPGATE ROOT RESOLUTION
# --------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT" || exit 1

if [ ! -f "package.json" ]; then
  echo "❌ package.json not found in project root."
  echo "Snapgate must be placed inside the project."
  exit 1
fi

echo "Snapgate: release engine initialised."
echo "Project root: $PROJECT_ROOT"
echo


# Print CLI usage instructions and exit
# This makes --help and -h behave like a real CLI tool
usage() {
  echo "Usage:"
  echo "  ./changelog.sh [version] [-m \"message\"] [--write]"
  echo
  echo "Options:"
  echo "  -m         Optional release message under header"
  echo "  --write    Write output into CHANGELOG.md"
  echo "  --help     Show this help message"
	
  echo
  echo "Examples:"
  echo "  ./changelog.sh            # Show unreleased changes"
  echo "  ./changelog.sh 1.2.3      # Show changes for version"
  echo "  ./changelog.sh --write    # Write unreleased to file"
  exit 0
}

# Extract project name from package.json
# Used to build tag prefix like: my-app-v1.2.3
NAME=$(sed -nE 's/.*"name": *"([^"]+)".*/\1/p' package.json | head -1)

# If no name was found in package.json, use the git repo folder name instead.
# This keeps the script working even outside Node-based projects.
if [ -z "$NAME" ]; then
  NAME=$(basename "$(git rev-parse --show-toplevel)")
fi

# All release tags are expected to follow this pattern:
# <name>-v<version>
TAG_PREFIX="${NAME}-v"

# Target changelog file
CHANGELOG_FILE="CHANGELOG.md"

# Marker used to determine where new entries are inserted
# Content is inserted immediately after this line
INSERT_MARKER="<!-- INSERT_HERE -->"

# Extract owner/repo from git remote URL
# Works for SSH and HTTPS remotes
REPO_PATH=$(git config --get remote.origin.url | \
  sed -E 's#.*[:/]([^/]+/[^/]+)\.git#\1#')

# Construct GitHub URL for commit links in changelog
REPO_URL="https://github.com/${REPO_PATH}"

# Default state:
# - No specific version requested
# - Do not write to file unless --write is passed
REQUESTED_VERSION=""
WRITE_FLAG=false
MESSAGE=""

# Parse CLI arguments
# Supports:
#   --write  → write into CHANGELOG.md
#   --help   → show usage
#   <version> → generate changelog for specific version
while [ $# -gt 0 ]
do
  case "$1" in
    --write)
      WRITE_FLAG=true
      shift
      ;;
    --help|-h)
      usage
      ;;
    -m)
      MESSAGE="$2"
      shift 2
      ;;
    *)
      REQUESTED_VERSION="$1"
      shift
      ;;
  esac
done

# Determine whether we are generating:
# - A specific tagged release
# - Or unreleased changes since latest tag

# If a version was provided, construct its full tag name
if [ -n "$REQUESTED_VERSION" ]; then
  CURRENT_TAG="${TAG_PREFIX}${REQUESTED_VERSION}"
  SHOW_UNRELEASED=false
# Otherwise, find the most recent release tag
else
  CURRENT_TAG=$(git tag --list "${TAG_PREFIX}*" --sort=-creatordate | head -n 1)
  SHOW_UNRELEASED=true
fi


# Create temporary file to hold generated changelog section
# This ensures we only write to the real file after validation
TMP_FILE=$(mktemp)

# Generate changelog for commits since latest release tag
# This represents the "Unreleased" section
if [ "$SHOW_UNRELEASED" = true ]; then

	# Extract current version from package.json
	# Used to label unreleased section if version was bumped
	PKG_VERSION=$(sed -nE 's/.*"version": *"([^"]+)".*/\1/p' package.json | head -1)
	#PKG_VERSION=$(grep '"version"' package.json | head -1 | sed -E 's/.*"version": *"([^"]+)".*/\1/')

	# Detect whether package.json has changed
	# If version changed but not tagged yet, reflect that in header
	if git diff --quiet package.json; then
		# package.json not modified
		HEADER="## Unreleased"
	else
		# package.json modified (likely version bumped)
		HEADER="## ${TAG_PREFIX}${PKG_VERSION}"
	fi


	# Write formatted commit list into temporary file
	# Includes commit hash, link, message, and date
	{
		echo "$HEADER"
		echo

		if [ -n "$MESSAGE" ]; then
			echo "$MESSAGE"
			echo
		fi

		if [ -n "$CURRENT_TAG" ]; then
			git log "${CURRENT_TAG}..HEAD" \
				--pretty=format:"- [%h](${REPO_URL}/commit/%H) %s (%ad)" \
				--date=short
		else
			echo "_Initial release_"
			echo
			git log HEAD \
				--pretty=format:"- [%h](${REPO_URL}/commit/%H) %s (%ad)" \
				--date=short
		fi

		echo
	} > "$TMP_FILE"

# Generate changelog for a specific release tag
else
	# Identify the tag immediately before the current one
	# Used to calculate commit range
  PREVIOUS_TAG=$(git tag --list "${TAG_PREFIX}*" --sort=-creatordate | \
    grep -A1 "^${CURRENT_TAG}$" | tail -n 1)

	# If previous tag exists, show changes between tags
	# Otherwise treat as initial release
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

if [ ! -f "$CHANGELOG_FILE" ]; then
  echo "❌ CHANGELOG.md not found."
  echo
  echo "To create a new changelog run:"
  echo "  ./snapgate.sh init changelog"
  echo
  rm "$TMP_FILE"
  exit 1
fi


# Ensure insertion marker exists in file
# Prevents corrupt or misplaced writes
if ! grep -q "$INSERT_MARKER" "$CHANGELOG_FILE"; then
	echo "ERROR: insertion marker not found in $CHANGELOG_FILE"
	echo
	echo "Expected marker line:"
	echo "  $INSERT_MARKER"
	echo
	echo "If the marker was removed, re-add it manually."
	echo "The script inserts new releases immediately after that line."
  rm "$TMP_FILE"
  exit 1
fi

# Insert content after marker (robust match)
INSERTED_FLAG=$(mktemp)

# Insert generated content immediately after marker line
# Uses awk to preserve file structure safely
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

# Confirm insertion actually occurred
# If marker match failed, abort safely
if [ ! -s "$INSERTED_FLAG" ]; then
  rm -f "${CHANGELOG_FILE}.new" "$TMP_FILE" "$INSERTED_FLAG"
	echo "ERROR: marker match failed; nothing written."
	echo "Expected marker:"
	echo "  $INSERT_MARKER"
  exit 1
fi

mv "${CHANGELOG_FILE}.new" "$CHANGELOG_FILE"

# Replace original changelog with updated version
# Then show what was written
echo
echo "WROTE:"
cat "$TMP_FILE"
echo
echo "CHANGELOG.md updated."

# Clean up temporary files
rm -f "$TMP_FILE" "$INSERTED_FLAG"

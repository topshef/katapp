#!/bin/sh

# --------------------------------------------------
# Snapgate - CHANGELOG Initialiser
# Creates a fresh CHANGELOG.md with insertion marker
# --------------------------------------------------

set -e

# --------------------------------------------------
# SNAPGATE ROOT RESOLUTION
# --------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT" || exit 1

PACKAGE="package.json"
CHANGELOG_FILE="CHANGELOG.md"
INSERT_MARKER="<!-- INSERT_HERE -->"

if [ ! -f "$PACKAGE" ]; then
  echo "❌ package.json not found in project root."
  exit 1
fi

if [ -f "$CHANGELOG_FILE" ]; then
  echo "CHANGELOG.md already exists."
  exit 1
fi

NAME=$(grep '"name"' "$PACKAGE" | head -1 | sed -E 's/.*"name": *"([^"]+)".*/\1/')

REPO_PATH=$(git config --get remote.origin.url | \
  sed -E 's#.*[:/]([^/]+/[^/]+)\.git#\1#')

REPO_URL="https://github.com/${REPO_PATH}"

{
  echo "# ${NAME}"
  echo
  echo "Repository: ${REPO_URL}"
  echo
  echo "<!--"
  echo "  Snapgate changelog file."
  echo "  New releases are inserted below the marker."
  echo "  Do NOT remove the marker line."
  echo "-->"
  echo
  echo "$INSERT_MARKER"
  echo
} > "$CHANGELOG_FILE"

echo
echo "✔ CHANGELOG.md created."
echo

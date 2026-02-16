#!/usr/bin/env bash

set -e

# snaplet.sh 
# v0.0.11 ignore archive folder
# v0.0.1 Initial version 16 Feb 2026
# ----------
# Deterministic recursive snaplet tool.
#
# A Snaplet is a canonically produced .tar.gz snapshot of a directory,
# named as: <name>-v<semver>-<8charhash>.tar.gz
# The semver is read from package.json, and the hash reflects the exact
# file names + contents of the archived tree.
#
# Intent:
# Provides a lightweight, portable snapshot for small codebases without
# requiring package management or full version control. Drop this script
# into any folder and generate simple, standalone versioned artifacts.
#
# Minimum requirement for versioning:
# Include a package.json with "name" and "version" fields.
#
# - Recursively archives target directory
# - Excludes common build/system folders (.git, node_modules, dist, *.gz, etc.)
# - Normalises metadata for deterministic hashing
# - Aborts if identical snaplet already exists
#
# Usage:
#   ./snaplet.sh <target-directory>
#
# Example:
#   ./snaplet.sh ./
#   ./snaplet.sh ../my-widget


# ---- Usage ----
usage() {
  echo "Usage:"
  echo "  ./snaplet.sh [target-directory]"
  echo ""
  echo "Example:"
  echo "  ./snaplet.sh ./"
  echo "  ./snaplet.sh ../my-widget"
}

# ---- Resolve target directory ----
if [ -z "$1" ]
then
  usage
  exit 0
fi

TARGET_DIR="$1"

if [ ! -d "$TARGET_DIR" ]
then
  echo "Error: '$TARGET_DIR' is not a directory."
  usage
  exit 1
fi


# Convert to absolute path
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"

echo "Target directory: $TARGET_DIR"

cd "$TARGET_DIR"

DEFAULT_NAME="snaplet"
DEFAULT_VERSION="0.0.0"

NAME="$DEFAULT_NAME"
VERSION="$DEFAULT_VERSION"

# ---- Read package.json if present ----
if [ -f "package.json" ]
then
  echo "Found package.json"

  NAME=$(grep -m1 '"name"' package.json | sed -E 's/.*"name":[[:space:]]*"([^"]+)".*/\1/')
  VERSION=$(grep -m1 '"version"' package.json | sed -E 's/.*"version":[[:space:]]*"([^"]+)".*/\1/')

  NAME="${NAME:-$DEFAULT_NAME}"
  VERSION="${VERSION:-$DEFAULT_VERSION}"
else
  echo "No package.json found. Using defaults."
fi

echo "Package name: $NAME"
echo "Version: v$VERSION"

# ---- Default recursive excludes ----
# note if you want different excludes atm you have to change this script its hardcoded
EXCLUDES=(
  "*.gz"
  ".git"
  "node_modules"
  "dist"
  "archive"
  ".env"
  ".DS_Store"
)

TMP_FILE="/tmp/${NAME}.$$.$RANDOM.tmp.tar.gz"

# ---- Build tar exclude args ----
EXCLUDE_ARGS=()
for pattern in "${EXCLUDES[@]}"
do
  EXCLUDE_ARGS+=(--exclude="$pattern")
done

echo "Excludes:"
printf '  - %s\n' "${EXCLUDES[@]}"

# ---- Create deterministic recursive archive ----
tar -czf "$TMP_FILE" \
  --sort=name \
  --mtime='UTC 1970-01-01' \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  "${EXCLUDE_ARGS[@]}" \
  .

HASH=$(sha1sum "$TMP_FILE" | awk '{print $1}' | cut -c1-8)

FINAL_FILE="${TARGET_DIR}/${NAME}-v${VERSION}-snaplet-${HASH}.tar.gz"

echo "Final archive: $FINAL_FILE"

if [ -f "$FINAL_FILE" ]
then
  echo "snaplet already exists. Nothing to do."
  rm "$TMP_FILE"
  exit 0
fi

mv "$TMP_FILE" "$FINAL_FILE"

echo "Created $FINAL_FILE"

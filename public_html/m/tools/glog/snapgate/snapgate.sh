#!/bin/sh

# ------------------------------------------------------------------------------
# Snapgate
# Version: see release.sh
#
# Commands:
#   snapgate status        → Validate release readiness (dry-run)
#   snapgate bump patch    → Increment patch version + draft changelog
#   snapgate release       → Execute release
#
# Philosophy:
#   Snapgate does not auto-commit.
#   A release must come from a clean, intentional commit.
# ------------------------------------------------------------------------------

set -e
# --------------------------------------------------
# SNAPGATE ROOT RESOLUTION
# --------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT" || exit 1

COMMAND=$1
SUBCOMMAND=$2

PACKAGE="package.json"

usage() {
  echo
  echo "Snapgate"
  echo
  echo "Usage:"
  echo "  ./snapgate.sh status"
  echo "  ./snapgate.sh bump patch"
  echo "  ./snapgate.sh release"
  echo
  exit 0
}

# --------------------------------------------------
# No args → show help
# --------------------------------------------------
if [ -z "$COMMAND" ]; then
  usage
fi

# --------------------------------------------------
# STATUS (dry-run validation)
# --------------------------------------------------
if [ "$COMMAND" = "status" ]; then
  echo
  echo "Snapgate Status Check"
  echo "----------------------"
  echo
  "$SCRIPT_DIR/release.sh"
  exit 0
fi

# --------------------------------------------------
# BUMP PATCH
# --------------------------------------------------
if [ "$COMMAND" = "bump" ] && [ "$SUBCOMMAND" = "patch" ]; then

  if [ ! -f "$PACKAGE" ]; then
    echo "package.json not found."
    exit 1
  fi

  CURRENT=$(grep '"version"' "$PACKAGE" | head -1 | sed -E 's/.*"version": *"([^"]+)".*/\1/')

  IFS='.' read -r MAJOR MINOR PATCH <<EOF
$CURRENT
EOF

  PATCH=$((PATCH + 1))
  NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"

  echo
  echo "Bumping version:"
  echo "  $CURRENT → $NEW_VERSION"
  echo

  sed -i -E "s/\"version\": *\"${CURRENT}\"/\"version\": \"${NEW_VERSION}\"/" "$PACKAGE"

  echo "package.json updated."

	if [ -f "$SCRIPT_DIR/changelog.sh" ]; then
		"$SCRIPT_DIR/changelog.sh" --write
  else
    echo "changelog.sh not found."
    exit 1
  fi

  echo
  echo "Next steps:"
  echo "  1. Review CHANGELOG.md"
  echo "  2. git add package.json CHANGELOG.md"
  echo "  3. git commit -m \"chore(release): ${NEW_VERSION}\""
  echo "  4. ./snapgate.sh release"
  echo

  exit 0
fi

# --------------------------------------------------
# RELEASE
# --------------------------------------------------
if [ "$COMMAND" = "release" ]; then
  echo
  echo "Executing Snapgate Release"
  echo "---------------------------"
  echo
  "$SCRIPT_DIR/release.sh" --run
  exit 0
fi

# --------------------------------------------------
# Anything else → help
# --------------------------------------------------
usage

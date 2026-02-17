#!/bin/sh
set -e

# publish.sh --> build and deploy
# dist folder is used for 'snapshot' (HEAD) or 'dirty' (working dirty tree)

# Output directories
DIST_DIR="dist"        # Build output from npm
ARCHIVE_DIR="archive"  # Historical copies of deployed bundles

# Absolute path to the directory containing this script
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# echo "SCRIPT_DIR = $SCRIPT_DIR"


# Temporary file to capture full build output for later reference
BUILD_LOG="$(mktemp)"

# get git info
#[ -f "./git_info.sh" ] && . ./git_info.sh
[ -f "$SCRIPT_DIR/git_info.sh" ] && . "$SCRIPT_DIR/git_info.sh"



# --------------------------------------------------
# Release detection (based on Git tag)
# --------------------------------------------------

MODE="dirty"
RELEASE_TAG=""
RELEASE_VERSION=""

TREE_CLEAN=false
if git diff --quiet 2>/dev/null; then
  TREE_CLEAN=true
fi

if [ "$TREE_CLEAN" = true ]; then
  if RELEASE_TAG=$(git describe --tags --exact-match 2>/dev/null); then
    MODE="release"
    RELEASE_VERSION=$(echo "$RELEASE_TAG" | sed -E 's/.*-v([0-9.]+)$/\1/')
  else
    MODE="snapshot"
  fi
fi


echo "----------------------------------------"
echo "Release detection:"
echo "  RELEASE_TAG     = $RELEASE_TAG"
echo "  RELEASE_VERSION = $RELEASE_VERSION"
echo "  HEAD_COMMIT     = $(git rev-parse --short HEAD 2>/dev/null || true)"
echo "  TREE CLEAN      = $(git diff --quiet 2>/dev/null && echo yes || echo no)"
echo "  MODE            = $MODE"  # dirty | snapshot | release
echo "----------------------------------------"



# echo "GIT_REPO   = $GIT_REPO"
# echo "GIT_BRANCH = $GIT_BRANCH"
# echo "GIT_HASH   = $GIT_HASH"

#
# Build ID injection (UTC timestamp)
#
# Replaces the BUILDID value with a full UTC timestamp, e.g.:
#   const BUILDID = "2026-01-28T14:37:22Z"
#
# This runs immediately before the build so the value is guaranteed
# to be baked into the bundled output.
# If the BUILDID line is missing, this silently does nothing.
#

PATH_BUILD_TAG="src/buildInfo.js"

if [ -f "$PATH_BUILD_TAG" ]; then
  # Generate UTC timestamp (ISO-like, filesystem- and log-friendly)
  #build_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  build_ts=$(date -u +"%Y-%m-%d %a %H:%M:%S UTC")

	build_id="$build_ts"

  # Append git diagnostics if available
	if [ -n "$GIT_REPO" ] && [ -n "$GIT_BRANCH" ]; then
		build_id="$build_id  $GIT_REPO/tree/$GIT_BRANCH"
		[ -n "$GIT_HASH" ] && build_id="$build_id#$GIT_HASH"
	fi
	
  # Replace existing BUILDID string value, if present
	sed -i \
		"s|\(BUILDID *= *\"\)[^\"]*\(\".*\)|\1$build_id\2|" \
		"$PATH_BUILD_TAG" || true
		
fi

#test build id
echo "BUILDID = $build_id"
# exit 0


# Run build and capture output (both console + log file)
npm run build 2>&1 | tee "$BUILD_LOG"

# Ensure archive directory exists
mkdir -p "$ARCHIVE_DIR"

# If release build, prepare releases/<version> directory
if [ "$MODE" = "release" ] && [ -n "$RELEASE_VERSION" ]; then
  VERSIONED_DIST_DIR="releases/$RELEASE_VERSION"
  mkdir -p "$VERSIONED_DIST_DIR"
fi



# Deploy each built artifact
for file in "$DIST_DIR"/*; do
  [ -f "$file" ] || continue

  filename=$(basename "$file")
	
	# Ignore sourcemaps here; handled separately
  case "$filename" in
    *.map)
      continue
      ;;
  esac	
	
	# Split filename into name + extension
  name="${filename%.*}"
  ext="${filename##*.}"

	# Short content hash for traceability
  hash=$(sha1sum "$file" | cut -c1-6)
	
	# Deployment timestamp (UTC)
  ts=$(date -u +"%Y-%m-%d %a %H:%M:%S UTC")

	 # Target paths
  archived="${ARCHIVE_DIR}/${name}_${hash}.${ext}"
	info="${DIST_DIR}/${name}.${MODE}.md"

	# archive a hashed copy
  cp -f "$file" "$archived"

	# If release state, copy into releases/<version>
	if [ "$MODE" = "release" ]; then
		cp -f "$file" "$VERSIONED_DIST_DIR/$filename"
	fi

	DIRTY_ALIAS="${DIST_DIR}/${name}.dirty.${ext}"
	SNAP_ALIAS="${DIST_DIR}/${name}.snapshot.${ext}"

	if [ "$MODE" = "snapshot" ]; then
		cp -f "$file" "$SNAP_ALIAS"

		# Make dirty point to snapshot (clean tree means identical)
		rm -f "$DIRTY_ALIAS"
		ln -s "$(basename "$SNAP_ALIAS")" "$DIRTY_ALIAS"
	fi

	if [ "$MODE" = "dirty" ]; then
		# Overwrite dirty directly (dirty tree)
		rm -f "$DIRTY_ALIAS"
		cp -f "$file" "$DIRTY_ALIAS"
	fi

	# Also handle sourcemap aliases
	if [ -f "$DIST_DIR/$filename.map" ]; then
		if [ "$MODE" = "snapshot" ]; then
			cp -f "$DIST_DIR/$filename.map" \
				"${DIST_DIR}/${name}.snapshot.${ext}.map"
		fi

		if [ "$MODE" = "dirty" ]; then
			cp -f "$DIST_DIR/$filename.map" \
				"${DIST_DIR}/${name}.dirty.${ext}.map"
		fi
	fi


  # Deploy & archive sourcemap using bundle hash
  if [ -f "$DIST_DIR/$filename.map" ]; then
    cp -f "$DIST_DIR/$filename.map" \
      "$ARCHIVE_DIR/${name}_${hash}.${ext}.map"
  fi

	# Write deployment metadata + full build output
	cat > "$info" <<EOF
# ${name}

- **Mode:** ${MODE}
- **Release Tag:** ${RELEASE_TAG}
- **Commit:** $(git rev-parse --short HEAD 2>/dev/null || true)
- **Bundle:** ${filename}
- **SHA-1:** ${hash}
- **Build ID:** ${build_id}
- **Deployed:** ${ts}
- **Source:** npm run build

## Build output

\`\`\`text
$(cat "$BUILD_LOG")
\`\`\`
EOF


done

# Clean up temporary build log
rm -f "$BUILD_LOG"

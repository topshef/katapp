# Git diagnostics helper (sourced)
# Populates: GIT_REPO, GIT_BRANCH, GIT_HASH
# Safe under `set -e`

GIT_REPO=""
GIT_BRANCH=""
GIT_HASH=""

# Only proceed if git exists and we're in a repo
if command -v git >/dev/null 2>&1; then
  if GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null); then

    # GIT_REPO=$(git -C "$GIT_ROOT" config --get remote.origin.url 2>/dev/null | \
      # sed -E 's#.*/([^/]+/[^/.]+)(\.git)?$#\1#')
		GIT_REPO=$(git -C "$GIT_ROOT" config --get remote.origin.url 2>/dev/null | \
			sed -E 's#^(git@[^:]+:|https?://[^/]+/)##; s#\.git$##')
			

    GIT_BRANCH=$(git -C "$GIT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)

    GIT_HASH=$(git -C "$GIT_ROOT" rev-parse --short HEAD 2>/dev/null)

  fi
fi

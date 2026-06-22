#!/usr/bin/env bash
# Push git tag v{package.json version} → triggers .github/workflows/release.yml
set -euo pipefail
cd "$(dirname "$0")/.."

FORCE=false
if [[ "${1:-}" == "--force" ]]; then
  FORCE=true
fi

VERSION="$(node -p "require('./package.json').version")"
TAG="v${VERSION}"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  if [[ "$FORCE" == true ]]; then
    git push origin "$TAG" --force
  else
    echo "Tag $TAG already exists. Use --force to re-push and trigger publish."
    exit 1
  fi
else
  git tag -a "$TAG" -m "Release $TAG"
  git push origin "$TAG"
fi

echo ""
echo "Pushed $TAG — GitHub Actions will build and publish Mac + Windows."
echo "https://github.com/kshoo0214/worship-flow/actions"

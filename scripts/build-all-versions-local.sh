#!/usr/bin/env bash
# Build each release tag locally and copy artifacts into releases/{mac|windows}/{version}/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FORCE=false
if [[ "${1:-}" == "--force" ]]; then
  FORCE=true
fi

TAGS=(v1.1.0 v1.1.1 v1.1.2 v1.1.3)
ORIG_BRANCH="$(git branch --show-current 2>/dev/null || echo main)"
STASHED=false
ORGANIZE_HELPER="$ROOT/scripts/.organize-releases-enhanced.sh"
cp "$ROOT/scripts/organize-releases.sh" "$ORGANIZE_HELPER"

version_has_artifacts() {
  local ver="$1"
  local mac_dmg win_exe
  mac_dmg="$(find "$ROOT/releases/mac/$ver" -maxdepth 1 -name '*.dmg' 2>/dev/null | head -1 || true)"
  win_exe="$(find "$ROOT/releases/windows/$ver" -maxdepth 1 -name '*.exe' 2>/dev/null | head -1 || true)"
  [[ -n "$mac_dmg" && -n "$win_exe" ]]
}

if [[ -n "$(git status --porcelain -- playlists.json settings.json songs.json 2>/dev/null)" ]]; then
  echo "Stashing user data files…"
  git stash push -m "build-all-versions-local" -- playlists.json settings.json songs.json
  STASHED=true
fi

restore_branch() {
  rm -f "$ROOT/scripts/.organize-releases-enhanced.sh"
  git checkout "$ORIG_BRANCH" 2>/dev/null || git checkout main
  if [[ "$STASHED" == true ]]; then
    git stash pop || true
  fi
}
trap restore_branch EXIT

for tag in "${TAGS[@]}"; do
  ver="${tag#v}"
  if [[ "$FORCE" != true ]] && version_has_artifacts "$ver"; then
    echo ""
    echo "== $tag: skip (already in releases/$ver)"
    continue
  fi

  echo ""
  echo "========================================"
  echo "Building $tag …"
  echo "========================================"
  git checkout "$tag"
  npm ci
  rm -rf "$ROOT/dist/"*
  npm run build:prep
  npx electron-builder --mac
  npx electron-builder --win
  SUBTITLE_BROADCAST_ROOT="$ROOT" bash "$ORGANIZE_HELPER"
done

echo ""
echo "All requested versions built."
find "$ROOT/releases" -type f | sort

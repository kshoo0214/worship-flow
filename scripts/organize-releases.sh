#!/usr/bin/env bash
# Copy install artifacts from dist/ into releases/{mac|windows}/{version}/
set -euo pipefail
ROOT="${SUBTITLE_BROADCAST_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
DIST="$ROOT/dist"
OUT="$ROOT/releases"

version_from_name() {
  echo "$1" | sed -n 's/.*FLOW-\([0-9][0-9.]*\)-.*/\1/p'
}

mkdir -p "$OUT/mac" "$OUT/windows"

copy_glob() {
  local os_dir="$1"
  local glob="$2"
  while IFS= read -r -d '' f; do
    local base ver dest
    base="$(basename "$f")"
    ver="$(version_from_name "$base")"
    if [[ -z "$ver" ]]; then
      echo "  skip (no version): $base" >&2
      continue
    fi
    dest="$OUT/$os_dir/$ver"
    mkdir -p "$dest"
    cp -f "$f" "$dest/"
    echo "  → $os_dir/$ver/$base"
  done < <(find "$DIST" -maxdepth 1 -name "$glob" -print0)
}

echo "Organizing releases from dist/ …"
copy_glob mac 'Worship FLOW-*-arm64.dmg'
copy_glob mac 'Worship FLOW-*-arm64.dmg.blockmap'
copy_glob mac 'Worship FLOW-*-arm64.zip'
copy_glob mac 'Worship FLOW-*-arm64.zip.blockmap'
copy_glob mac 'Worship-FLOW-*-arm64.dmg'
copy_glob mac 'Worship-FLOW-*-arm64.dmg.blockmap'
copy_glob mac 'Worship-FLOW-*-arm64.zip'
copy_glob mac 'Worship-FLOW-*-arm64.zip.blockmap'
copy_glob windows 'Worship FLOW-*-win-x64.exe'
copy_glob windows 'Worship FLOW-*-win-x64.exe.blockmap'
copy_glob windows 'Worship FLOW-*-win-x64.zip'
copy_glob windows 'Worship-FLOW-*-win-x64.exe'
copy_glob windows 'Worship-FLOW-*-win-x64.exe.blockmap'
copy_glob windows 'Worship-FLOW-*-win-x64.zip'

VER="$(node -p "require('$ROOT/package.json').version")"
if [[ -f "$DIST/latest-mac.yml" ]]; then
  mkdir -p "$OUT/mac/$VER"
  cp -f "$DIST/latest-mac.yml" "$OUT/mac/$VER/"
  echo "  → mac/$VER/latest-mac.yml"
fi
if [[ -f "$DIST/latest.yml" ]]; then
  mkdir -p "$OUT/windows/$VER"
  cp -f "$DIST/latest.yml" "$OUT/windows/$VER/"
  echo "  → windows/$VER/latest.yml"
fi

echo ""
echo "Done: $OUT"

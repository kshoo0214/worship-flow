#!/usr/bin/env bash
# Download GitHub release install artifacts into releases/{mac|windows}/{version}/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/releases"
OWNER="kshoo0214"
REPO="worship-flow"

version_from_asset() {
  echo "$1" | sed -n 's/.*FLOW-\([0-9][0-9.]*\)-.*/\1/p'
}

mkdir -p "$OUT/mac" "$OUT/windows"

releases_json="$(curl -fsSL "https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=20")"

echo "$releases_json" | node -e "
const releases = JSON.parse(require('fs').readFileSync(0, 'utf8'));
for (const rel of releases) {
  const tag = String(rel.tag_name || '').replace(/^v/i, '');
  if (!tag) continue;
  for (const asset of rel.assets || []) {
    const name = asset.name;
    const url = asset.browser_download_url;
    let os = '';
    if (name.includes('-arm64.') || name === 'latest-mac.yml') os = 'mac';
    else if (name.includes('-win-') || name === 'latest.yml') os = 'windows';
    else continue;
    console.log([tag, os, name, url].join('\t'));
  }
}
" | while IFS=$'\t' read -r ver os name url; do
  dest="$OUT/$os/$ver"
  mkdir -p "$dest"
  target="$dest/$name"
  if [[ -f "$target" ]]; then
    echo "  skip $os/$ver/$name"
    continue
  fi
  echo "  ↓ $os/$ver/$name"
  curl -fsSL "$url" -o "$target"
done

echo ""
echo "Done: $OUT"
find "$OUT" -type f | sort

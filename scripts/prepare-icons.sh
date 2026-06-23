#!/usr/bin/env bash
# Generate build/icon.png, build/icon.icns, resources/logo.png from source artwork.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$ROOT/build/logo-source.png}"

if [[ ! -f "$SRC" ]]; then
  echo "Source image not found: $SRC" >&2
  echo "Place a square logo at build/logo-source.png (1024×1024 recommended)." >&2
  exit 1
fi

mkdir -p "$ROOT/build" "$ROOT/resources"
sips -s format png "$SRC" --out "$ROOT/build/icon.png" >/dev/null
cp "$ROOT/build/icon.png" "$ROOT/resources/logo.png"

ICONSET="$ROOT/build/icon.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
specs=(
  "16:icon_16x16.png"
  "32:icon_16x16@2x.png"
  "32:icon_32x32.png"
  "64:icon_32x32@2x.png"
  "128:icon_128x128.png"
  "256:icon_128x128@2x.png"
  "256:icon_256x256.png"
  "512:icon_256x256@2x.png"
  "512:icon_512x512.png"
  "1024:icon_512x512@2x.png"
)
for spec in "${specs[@]}"; do
  size="${spec%%:*}"
  name="${spec##*:}"
  sips -z "$size" "$size" "$ROOT/build/icon.png" --out "$ICONSET/$name" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$ROOT/build/icon.icns"
rm -rf "$ICONSET"

echo "Icons ready: build/icon.png, build/icon.icns, resources/logo.png"

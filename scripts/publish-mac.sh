#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${GH_TOKEN:-}" && -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [[ -z "${GH_TOKEN:-}" && -f .gh-token ]]; then
  GH_TOKEN="$(tr -d '[:space:]' < .gh-token)"
  export GH_TOKEN
fi

if [[ -z "${GH_TOKEN:-}" ]]; then
  echo "GH_TOKEN is not set."
  echo "Option 1: export GH_TOKEN=\"ghp_xxxx\" && bash scripts/publish-mac.sh"
  echo "Option 2: echo 'GH_TOKEN=ghp_xxxx' > .env.local  (gitignored)"
  exit 1
fi

npm run build:prep
npx electron-builder --mac --publish always

echo ""
echo "Done. Check: https://github.com/kshoo0214/worship-flow/releases"

#!/usr/bin/env bash
# Push main to GitHub using GH_TOKEN from .env.local
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [[ -z "${GH_TOKEN:-}" || "$GH_TOKEN" == *"여기에"* || "$GH_TOKEN" == *"ghp_xxx"* ]]; then
  echo "Edit .env.local in the project root:"
  echo '  GH_TOKEN=ghp_your_real_token'
  echo ""
  echo "Get a token: https://github.com/settings/tokens (scopes: repo, workflow)"
  exit 1
fi

git push "https://kshoo0214:${GH_TOKEN}@github.com/kshoo0214/worship-flow.git" main
echo ""
echo "Pushed to https://github.com/kshoo0214/worship-flow"

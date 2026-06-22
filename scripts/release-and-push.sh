#!/usr/bin/env bash
# Push main + tag v{version} → triggers GitHub Actions release build
set -euo pipefail
cd "$(dirname "$0")/.."

bash scripts/git-push.sh
bash scripts/release-tag.sh

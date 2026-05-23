#!/usr/bin/env bash
# UPLAY Pagamentos — Update (git pull + rebuild + health)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> git pull"
git pull --ff-only

echo "==> build"
docker-compose -f docker-compose.prod.yml build --pull upplay_app

echo "==> up -d"
docker-compose -f docker-compose.prod.yml up -d --remove-orphans

echo "==> prune"
docker image prune -f || true

echo "==> health"
bash scripts/health.sh

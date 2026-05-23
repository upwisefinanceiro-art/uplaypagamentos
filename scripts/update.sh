#!/usr/bin/env bash
# UPLAY Pagamentos — Atualização zero-downtime na VPS
# Uso: bash scripts/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> git pull"
git pull --ff-only

echo "==> docker compose build --pull"
docker compose -f docker-compose.prod.yml build --pull upplay_app

echo "==> docker compose up -d (rolling)"
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "==> prune"
docker image prune -f
docker builder prune -f --filter "until=168h" || true

echo "==> health"
bash scripts/health.sh

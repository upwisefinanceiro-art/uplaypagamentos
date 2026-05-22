#!/usr/bin/env bash
# UPLAY Pagamentos - Deploy helper para VPS (Ubuntu + Docker + Portainer)
# Uso na VPS:  bash deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

echo "==> git pull"
git pull --ff-only

echo "==> docker compose down"
docker compose down --remove-orphans || true

echo "==> docker compose build --pull"
docker compose build --pull

echo "==> docker compose up -d"
docker compose up -d

echo "==> docker image prune -f"
docker image prune -f || true

echo "==> status"
docker compose ps

echo
echo "OK. Healthcheck: curl -I http://127.0.0.1/healthz"

#!/usr/bin/env bash
# UPLAY Pagamentos — Rollback rápido para o commit anterior (ou hash informado)
# Uso:
#   bash scripts/rollback.sh           # volta 1 commit
#   bash scripts/rollback.sh <hash>    # volta para um commit específico
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-HEAD~1}"

echo "==> Commit atual:  $(git rev-parse --short HEAD)"
echo "==> Alvo rollback: $(git rev-parse --short "$TARGET")"
read -r -p "Confirma rollback? (digite ROLLBACK): " C
[[ "$C" == "ROLLBACK" ]] || { echo "Abortado."; exit 1; }

git fetch --all --tags
git checkout "$TARGET"

echo "==> Rebuild + up"
docker compose -f docker-compose.prod.yml build --pull upplay_app
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "==> Health"
bash scripts/health.sh

echo
echo "OK. Para voltar ao main: git checkout main && bash scripts/update.sh"

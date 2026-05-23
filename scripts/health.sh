#!/usr/bin/env bash
# UPLAY Pagamentos — Health-check operacional da VPS
set -euo pipefail

echo "=== Docker ==="
docker --version
docker compose version

echo
echo "=== Containers ==="
docker compose -f docker-compose.prod.yml ps

echo
echo "=== Healthchecks ==="
for c in upplay_app uplay_caddy; do
  S=$(docker inspect --format='{{.State.Health.Status}}' "$c" 2>/dev/null || echo "n/a")
  printf "  %-20s %s\n" "$c" "$S"
done

echo
echo "=== Endpoints ==="
curl -fsS -o /dev/null -w "  127.0.0.1/healthz       -> %{http_code}\n" http://127.0.0.1/healthz || true
curl -fsS -o /dev/null -w "  https://uplaypagamento.com.br -> %{http_code}\n" https://uplaypagamento.com.br/healthz || true

echo
echo "=== Recursos ==="
docker stats --no-stream --format "  {{.Name}}: CPU {{.CPUPerc}} | MEM {{.MemUsage}}"

echo
echo "=== Disco / Backups ==="
df -h / | tail -1
ls -lh backups/ 2>/dev/null | tail -5 || echo "  (sem backups ainda)"

#!/usr/bin/env bash
# UPLAY Pagamentos — Health-check operacional
set -euo pipefail

echo "=== Docker ==="
docker --version
docker-compose --version

echo
echo "=== Containers ==="
docker-compose -f docker-compose.prod.yml ps

echo
echo "=== Healthchecks ==="
for c in upplay_app uplay_caddy uplay_backup uplay_watchtower; do
  S=$(docker inspect --format='{{.State.Health.Status}}{{if not .State.Health}}{{.State.Status}}{{end}}' "$c" 2>/dev/null || echo "n/a")
  printf "  %-22s %s\n" "$c" "$S"
done

echo
echo "=== Endpoints ==="
curl -fsS -o /dev/null -w "  http://127.0.0.1/healthz                     -> %{http_code}\n" http://127.0.0.1/healthz || true
curl -fsSk -o /dev/null -w "  https://uplaypagamento.com.br/healthz        -> %{http_code}\n" https://uplaypagamento.com.br/healthz || true

echo
echo "=== Recursos ==="
docker stats --no-stream --format "  {{.Name}}: CPU {{.CPUPerc}} | MEM {{.MemUsage}}"

echo
echo "=== Disco / Backups ==="
df -h / | tail -1
ls -lh backups/ 2>/dev/null | tail -5 || echo "  (sem backups ainda)"

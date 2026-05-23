#!/usr/bin/env bash
# UPLAY Pagamentos — Backup diário do banco Supabase (Lovable Cloud)
# Executado pelo container `uplay_backup` via cron (03:00 America/Sao_Paulo)
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL não definido}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_DIR="/backups"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="${BACKUP_DIR}/uplay_${TS}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Iseconds)] >>> Iniciando backup -> ${OUT}"
pg_dump --no-owner --no-privileges --clean --if-exists \
  --quote-all-identifiers --schema=public "$SUPABASE_DB_URL" \
  | gzip -9 > "$OUT"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "[$(date -Iseconds)] <<< Backup concluído (${SIZE})"

# Limpeza por retenção
find "$BACKUP_DIR" -name 'uplay_*.sql.gz' -mtime +${RETENTION_DAYS} -print -delete || true

# Mantém apenas últimos 30 logs
find "$BACKUP_DIR" -name 'backup.log.*' -mtime +30 -delete || true
echo "[$(date -Iseconds)] === Retenção: ${RETENTION_DAYS} dias ==="

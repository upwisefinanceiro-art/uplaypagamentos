#!/usr/bin/env bash
# UPLAY Pagamentos — Restore manual de um backup
# Uso: bash scripts/restore.sh ./backups/uplay_20260101_030000.sql.gz
set -euo pipefail

FILE="${1:-}"
if [[ -z "$FILE" || ! -f "$FILE" ]]; then
  echo "Uso: $0 <arquivo.sql.gz>"
  ls -lh backups/ 2>/dev/null || true
  exit 1
fi

: "${SUPABASE_DB_URL:?Defina SUPABASE_DB_URL no shell antes de rodar}"

echo ">>> ATENÇÃO: vai restaurar ${FILE} sobre o banco de produção."
read -r -p "Digite 'RESTORE' para confirmar: " CONFIRM
[[ "$CONFIRM" == "RESTORE" ]] || { echo "Abortado."; exit 1; }

gunzip -c "$FILE" | psql "$SUPABASE_DB_URL"
echo "<<< Restore concluído."

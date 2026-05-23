#!/usr/bin/env bash
# UPLAY Pagamentos — Restore manual
# Uso: SUPABASE_DB_URL='postgresql://...' bash scripts/restore.sh backups/uplay_YYYYMMDD_HHMMSS.sql.gz
set -euo pipefail

FILE="${1:?Informe o arquivo .sql.gz}"
: "${SUPABASE_DB_URL:?Exporte SUPABASE_DB_URL antes (postgresql://...)}"
[[ -f "$FILE" ]] || { echo "Arquivo não encontrado: $FILE"; exit 1; }

echo "==> Restaurando $FILE no banco Supabase"
read -r -p "ATENÇÃO: isto sobrescreve o schema public. Digite RESTORE: " C
[[ "$C" == "RESTORE" ]] || { echo "Abortado."; exit 1; }

gunzip -c "$FILE" | docker run --rm -i \
  -e PGPASSWORD \
  postgres:16-alpine psql "$SUPABASE_DB_URL"

echo "==> Restore concluído."

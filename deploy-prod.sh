#!/usr/bin/env bash
# =========================================================
# UPLAY Pagamentos — Deploy automático de PRODUÇÃO
# VPS Hostinger Ubuntu + Docker Compose v1 (legacy)
# Uso: bash deploy-prod.sh
# Idempotente: pode rodar quantas vezes quiser.
# =========================================================
set -Eeuo pipefail

APP_DIR="/root/uplaypagamentos"
COMPOSE_FILE="docker-compose.prod.yml"
DOMAIN="uplaypagamento.com.br"

# ---------- helpers ----------
c_reset="\033[0m"; c_green="\033[1;32m"; c_blue="\033[1;34m"
c_yellow="\033[1;33m"; c_red="\033[1;31m"; c_cyan="\033[1;36m"
log()  { echo -e "${c_blue}[deploy]${c_reset} $*"; }
ok()   { echo -e "${c_green}[ ✓ ]${c_reset} $*"; }
warn() { echo -e "${c_yellow}[ ! ]${c_reset} $*"; }
err()  { echo -e "${c_red}[ ✗ ]${c_reset} $*" >&2; }
step() { echo; echo -e "${c_cyan}==> $*${c_reset}"; }

trap 'err "Falha na linha $LINENO. Deploy abortado."; exit 1' ERR

# ---------- 0. Pré-checagens ----------
step "0/9 Verificando ambiente"
command -v docker >/dev/null         || { err "docker ausente — rode: bash install-vps.sh"; exit 1; }
command -v docker-compose >/dev/null || { err "docker-compose ausente — rode: bash install-vps.sh"; exit 1; }
command -v git >/dev/null            || { err "git ausente — rode: bash install-vps.sh"; exit 1; }
ok "docker, docker-compose e git disponíveis"

echo -e "${c_green}🚀 Deploy iniciado — UPLAY Pagamentos${c_reset}"

# ---------- 1. Pasta ----------
step "1/9 Entrando em $APP_DIR"
[ -d "$APP_DIR" ] || { err "Pasta $APP_DIR não existe. Faça o clone primeiro."; exit 1; }
cd "$APP_DIR"
ok "PWD: $(pwd)"

# ---------- 2. git pull ----------
step "2/9 Atualizando repositório (git pull --ff-only)"
git pull --ff-only
ok "Repositório atualizado"

# ---------- 3. .env ----------
step "3/9 Garantindo arquivo .env"
if [ ! -f .env ]; then
  if [ -f .env.production.example ]; then
    cp -n .env.production.example .env
    chmod 600 .env
    warn ".env criado a partir do .env.production.example — EDITE com SUPABASE_DB_URL real:"
    warn "  nano $APP_DIR/.env"
  else
    err ".env.production.example não encontrado"; exit 1
  fi
else
  chmod 600 .env
  ok ".env já existe (chmod 600 aplicado)"
fi

# ---------- 4. Validação de arquivos ----------
step "4/9 Validando arquivos essenciais"
required=("$COMPOSE_FILE" "Caddyfile" "Dockerfile" \
          "scripts/health.sh" "scripts/update.sh" "scripts/rollback.sh" \
          "scripts/backup.sh" "scripts/restore.sh")
missing=0
for f in "${required[@]}"; do
  if [ -f "$f" ]; then ok "presente: $f"
  else err "faltando: $f"; missing=1
  fi
done
[ "$missing" -eq 0 ] || { err "Arquivos faltando. Abortando."; exit 1; }

# ---------- 5. Permissões ----------
step "5/9 Ajustando permissões dos scripts"
chmod +x scripts/*.sh
ok "scripts/*.sh executáveis"

# ---------- 6. Down ----------
step "6/9 Derrubando stack antiga (se existir)"
docker-compose -f "$COMPOSE_FILE" down --remove-orphans || true
ok "Stack antiga removida"

# ---------- 7. Up ----------
step "7/9 Subindo containers (build + up -d) — HTTPS sendo configurado automaticamente"
echo -e "${c_yellow}🔧 Subindo containers...${c_reset}"
docker-compose -f "$COMPOSE_FILE" up -d --build
echo -e "${c_yellow}🔒 HTTPS configurando (Let's Encrypt) — pode levar até 60s na 1ª vez...${c_reset}"
sleep 8
docker image prune -f >/dev/null 2>&1 || true
ok "Containers no ar"

# ---------- 8. Healthcheck ----------
step "8/9 Healthcheck"
bash scripts/health.sh || warn "Healthcheck reportou avisos — confira acima"

# ---------- 9. Resumo ----------
step "9/9 Resumo final"
echo
echo -e "${c_cyan}Containers ativos:${c_reset}"
docker-compose -f "$COMPOSE_FILE" ps
echo
echo -e "${c_cyan}Portas publicadas:${c_reset}"
docker ps --format "  {{.Names}}  →  {{.Ports}}"
echo
echo -e "${c_green}✅ Deploy finalizado com sucesso!${c_reset}"
echo -e "   🌐 URL pública: ${c_cyan}https://${DOMAIN}${c_reset}"
echo -e "   ❤️  Healthz   : ${c_cyan}https://${DOMAIN}/healthz${c_reset}"
echo -e "   📜 Logs ao vivo: docker-compose -f $COMPOSE_FILE logs -f --tail 100"
echo -e "   🔁 Update     : bash deploy-prod.sh"
echo -e "   ⏪ Rollback   : bash scripts/rollback.sh"
echo

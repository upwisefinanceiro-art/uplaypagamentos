#!/usr/bin/env bash
# =========================================================
# UPLAY Pagamentos — Deploy automático de PRODUÇÃO
# VPS Hostinger Ubuntu + Docker Compose v1 (legacy)
# Uso: bash deploy-prod.sh
# Idempotente · Rollback automático em falha de build
# =========================================================
set -Eeuo pipefail

APP_DIR="/root/uplaypagamentos"
COMPOSE_FILE="docker-compose.prod.yml"
DOMAIN="uplaypagamento.com.br"
LOG_DIR="/var/log/uplay"
LOG_FILE="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"

# ---------- cores ----------
c_reset="\033[0m"; c_green="\033[1;32m"; c_blue="\033[1;34m"
c_yellow="\033[1;33m"; c_red="\033[1;31m"; c_cyan="\033[1;36m"; c_dim="\033[2m"
log()  { echo -e "${c_blue}[deploy]${c_reset} $*"; }
ok()   { echo -e "${c_green}[ ✓ ]${c_reset} $*"; }
warn() { echo -e "${c_yellow}[ ! ]${c_reset} $*"; }
err()  { echo -e "${c_red}[ ✗ ]${c_reset} $*" >&2; }
step() { echo; echo -e "${c_cyan}━━━ $* ━━━${c_reset}"; }

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

# ---------- estado para rollback ----------
PREV_COMMIT=""
DEPLOY_STAGE="init"

rollback() {
  err "Falha no estágio: $DEPLOY_STAGE"
  if [ -n "$PREV_COMMIT" ] && [ "$DEPLOY_STAGE" = "build" ]; then
    warn "🔁 Iniciando ROLLBACK AUTOMÁTICO para $PREV_COMMIT"
    cd "$APP_DIR" || exit 1
    git reset --hard "$PREV_COMMIT" || true
    docker-compose -f "$COMPOSE_FILE" up -d --build --remove-orphans || true
    err "Rollback executado. Investigue o log: $LOG_FILE"
  else
    err "Sem rollback automático (estágio: $DEPLOY_STAGE). Log: $LOG_FILE"
  fi
  exit 1
}
trap rollback ERR

# =========================================================
echo -e "${c_green}╔══════════════════════════════════════════════╗${c_reset}"
echo -e "${c_green}║  🚀 UPLAY Pagamentos — Deploy de Produção   ║${c_reset}"
echo -e "${c_green}╚══════════════════════════════════════════════╝${c_reset}"
echo -e "${c_dim}log: $LOG_FILE${c_reset}"

# ---------- 0. Pré-checagens ----------
DEPLOY_STAGE="pre-check"
step "0/9 Verificando ambiente"
command -v docker >/dev/null         || { err "docker ausente — rode: bash install-vps.sh"; exit 1; }
command -v docker-compose >/dev/null || { err "docker-compose ausente — rode: bash install-vps.sh"; exit 1; }
command -v git >/dev/null            || { err "git ausente — rode: bash install-vps.sh"; exit 1; }
ok "docker $(docker --version | awk '{print $3}' | tr -d ,) · compose $(docker-compose --version | awk '{print $3}' | tr -d ,) · git ok"

# ---------- 1. Pasta ----------
DEPLOY_STAGE="cd"
step "1/9 Entrando em $APP_DIR"
[ -d "$APP_DIR" ] || { err "Pasta $APP_DIR não existe. Faça o clone primeiro."; exit 1; }
cd "$APP_DIR"
PREV_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo '')"
ok "PWD: $(pwd)  ·  commit atual: ${PREV_COMMIT:0:8}"

# ---------- 2. git pull ----------
DEPLOY_STAGE="git-pull"
step "2/9 Atualizando repositório (git pull --ff-only)"
git pull --ff-only
NEW_COMMIT="$(git rev-parse HEAD)"
if [ "$PREV_COMMIT" = "$NEW_COMMIT" ]; then
  ok "Já está no commit mais recente (${NEW_COMMIT:0:8})"
else
  ok "Atualizado: ${PREV_COMMIT:0:8} → ${NEW_COMMIT:0:8}"
  echo -e "${c_dim}$(git log --oneline "$PREV_COMMIT..$NEW_COMMIT" | head -5)${c_reset}"
fi

# ---------- 3. .env ----------
DEPLOY_STAGE="env"
step "3/9 Garantindo arquivo .env"
if [ ! -f .env ]; then
  if [ -f .env.production.example ]; then
    cp -n .env.production.example .env
    chmod 600 .env
    warn ".env criado a partir do exemplo — EDITE SUPABASE_DB_URL real:"
    warn "  nano $APP_DIR/.env"
  else
    err ".env.production.example não encontrado"; exit 1
  fi
else
  chmod 600 .env
  ok ".env presente (chmod 600)"
fi

# ---------- 4. Validação de arquivos ----------
DEPLOY_STAGE="validate"
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
DEPLOY_STAGE="chmod"
step "5/9 Ajustando permissões dos scripts"
chmod +x scripts/*.sh deploy-prod.sh install-vps.sh 2>/dev/null || true
ok "scripts executáveis"

# ---------- 6. Down ----------
DEPLOY_STAGE="down"
step "6/9 Derrubando stack antiga (mantendo volumes)"
docker-compose -f "$COMPOSE_FILE" down --remove-orphans || true
ok "Stack antiga removida"

# ---------- 7. Build + Up (com rollback automático) ----------
DEPLOY_STAGE="build"
step "7/9 Build + Up -d (rollback automático ativo)"
echo -e "${c_yellow}🔧 Subindo containers...${c_reset}"
docker-compose -f "$COMPOSE_FILE" up -d --build
echo -e "${c_yellow}🔒 HTTPS configurando (Let's Encrypt) — até 60s na 1ª vez...${c_reset}"
sleep 10
docker image prune -f >/dev/null 2>&1 || true
ok "Containers no ar"

# A partir daqui desativamos rollback automático — qualquer erro é só warning
DEPLOY_STAGE="post-deploy"
trap - ERR
set +e

# ---------- 8. Healthcheck ----------
step "8/9 Healthcheck"
bash scripts/health.sh || warn "Healthcheck reportou avisos — confira acima"

# ---------- 9. Resumo visual ----------
step "9/9 Status final"
echo
echo -e "${c_cyan}┌─ Containers ─────────────────────────────────┐${c_reset}"
docker-compose -f "$COMPOSE_FILE" ps
echo -e "${c_cyan}└──────────────────────────────────────────────┘${c_reset}"
echo
echo -e "${c_cyan}┌─ Portas publicadas ──────────────────────────┐${c_reset}"
docker ps --format "  {{.Names}}  →  {{.Ports}}"
echo -e "${c_cyan}└──────────────────────────────────────────────┘${c_reset}"
echo
echo -e "${c_cyan}┌─ Recursos ───────────────────────────────────┐${c_reset}"
docker stats --no-stream --format "  {{.Name}}: CPU {{.CPUPerc}} | MEM {{.MemUsage}}"
echo -e "${c_cyan}└──────────────────────────────────────────────┘${c_reset}"
echo
echo -e "${c_cyan}┌─ Últimas 5 linhas do app ────────────────────┐${c_reset}"
docker logs upplay_app --tail 5 2>&1 | sed 's/^/  /'
echo -e "${c_cyan}└──────────────────────────────────────────────┘${c_reset}"
echo
echo -e "${c_green}╔══════════════════════════════════════════════╗${c_reset}"
echo -e "${c_green}║  ✅ Deploy finalizado com sucesso!          ║${c_reset}"
echo -e "${c_green}╚══════════════════════════════════════════════╝${c_reset}"
echo -e "   🌐 URL pública : ${c_cyan}https://${DOMAIN}${c_reset}"
echo -e "   ❤️  Healthz    : ${c_cyan}https://${DOMAIN}/healthz${c_reset}"
echo -e "   📜 Logs live   : docker-compose -f $COMPOSE_FILE logs -f --tail 100"
echo -e "   🔁 Re-deploy   : bash deploy-prod.sh"
echo -e "   ⏪ Rollback    : bash scripts/rollback.sh"
echo -e "   📁 Log deploy  : $LOG_FILE"
echo

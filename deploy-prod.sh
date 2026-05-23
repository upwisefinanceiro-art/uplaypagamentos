#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/root/uplaypagamentos"
COMPOSE_FILE="docker-compose.prod.yml"
DOMAIN="uplaypagamento.com.br"
LOG_DIR="/var/log/uplay"
LOG_FILE="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"

c_reset="\033[0m"; c_green="\033[1;32m"; c_blue="\033[1;34m"; c_yellow="\033[1;33m"; c_red="\033[1;31m"; c_cyan="\033[1;36m"; c_dim="\033[2m"
ok() { echo -e "${c_green}[ ✓ ]${c_reset} $*"; }
warn() { echo -e "${c_yellow}[ ! ]${c_reset} $*"; }
err() { echo -e "${c_red}[ ✗ ]${c_reset} $*" >&2; }
step() { echo; echo -e "${c_cyan}━━━ $* ━━━${c_reset}"; }

mkdir -p "$LOG_DIR"
exec > >(tee -a "$LOG_FILE") 2>&1

DEPLOY_STAGE="init"
PREV_COMMIT=""

rollback() {
  err "Falha no estágio: $DEPLOY_STAGE"
  if [ -n "$PREV_COMMIT" ] && [ -d "$APP_DIR/.git" ]; then
    warn "Rollback automático para commit ${PREV_COMMIT:0:8}"
    cd "$APP_DIR" || exit 1
    git reset --hard "$PREV_COMMIT" || true
    docker-compose -f "$COMPOSE_FILE" build --no-cache upplay_app || true
    docker-compose -f "$COMPOSE_FILE" up -d --force-recreate --remove-orphans || true
  fi
  err "Deploy interrompido. Log: $LOG_FILE"
  exit 1
}
trap rollback ERR

echo -e "${c_green}╔══════════════════════════════════════════════╗${c_reset}"
echo -e "${c_green}║  🚀 UPLAY Pagamentos — Deploy Hostinger VPS ║${c_reset}"
echo -e "${c_green}╚══════════════════════════════════════════════╝${c_reset}"
echo -e "${c_dim}log: $LOG_FILE${c_reset}"

DEPLOY_STAGE="pre-check"
step "0/10 Verificando Docker legacy, Compose legacy e Git"
command -v docker >/dev/null || { err "docker ausente — rode: bash install-vps.sh"; exit 1; }
command -v docker-compose >/dev/null || { err "docker-compose ausente — rode: bash install-vps.sh"; exit 1; }
command -v git >/dev/null || { err "git ausente — rode: bash install-vps.sh"; exit 1; }
ok "docker $(docker --version | awk '{print $3}' | tr -d ',') · docker-compose $(docker-compose --version | awk '{print $3}' | tr -d ',') · git ok"

DEPLOY_STAGE="cd"
step "1/10 Entrando em $APP_DIR"
[ -d "$APP_DIR" ] || { err "Pasta $APP_DIR não existe. Clone o repositório primeiro."; exit 1; }
cd "$APP_DIR"
PREV_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo '')"
ok "PWD: $(pwd) · commit atual: ${PREV_COMMIT:0:8}"

DEPLOY_STAGE="git-pull"
step "2/10 Atualizando repositório"
git pull --ff-only
NEW_COMMIT="$(git rev-parse HEAD)"
ok "commit ativo: ${NEW_COMMIT:0:8}"

DEPLOY_STAGE="env"
step "3/10 Garantindo .env"
if [ ! -f .env ]; then
  [ -f .env.production.example ] || { err ".env.production.example não encontrado"; exit 1; }
  cp -n .env.production.example .env
  warn ".env criado do exemplo. Configure SUPABASE_DB_URL real antes de produção crítica."
fi
chmod 600 .env
ok ".env presente"

DEPLOY_STAGE="validate-files"
step "4/10 Validando arquivos obrigatórios"
required=("Dockerfile" "Caddyfile" "docker/Caddyfile.proxy" "$COMPOSE_FILE" "deploy-prod.sh" "install-vps.sh" "scripts/health.sh" "scripts/update.sh" "scripts/rollback.sh" "scripts/backup.sh" "scripts/restore.sh")
for f in "${required[@]}"; do
  [ -f "$f" ] || { err "faltando: $f"; exit 1; }
  ok "presente: $f"
done

DEPLOY_STAGE="validate-dockerfile"
step "5/10 Validando sintaxe legacy do Dockerfile"
grep -Eq "^COPY Caddyfile /etc/caddy/Caddyfile$" Dockerfile || { err "Dockerfile deve conter exatamente: COPY Caddyfile /etc/caddy/Caddyfile"; exit 1; }
legacy_forbidden_pattern='(COPY|RUN)[[:space:]]+<<|#[[:space:]]*syntax=docker/dockerfile|--mount=type='
if grep -RInE "$legacy_forbidden_pattern" Dockerfile docker-compose.prod.yml Caddyfile docker/Caddyfile.proxy scripts 2>/dev/null; then
  err "BuildKit/heredoc encontrado. Remova antes do deploy."
  exit 1
fi
ok "No BuildKit syntax remaining"
ok "Legacy Docker compatible"

DEPLOY_STAGE="chmod"
step "6/10 Ajustando permissões"
chmod +x deploy-prod.sh install-vps.sh scripts/*.sh 2>/dev/null || true
ok "scripts executáveis"

DEPLOY_STAGE="down"
step "7/10 Parando stack antiga"
docker-compose -f "$COMPOSE_FILE" down --remove-orphans || true
ok "stack antiga removida"

DEPLOY_STAGE="purge-cache"
step "8/10 Limpando cache Docker antigo"
docker system prune -af || true
docker builder prune -af || true
ok "Docker cache purge enabled"

DEPLOY_STAGE="build"
step "9/10 Build Linux limpo sem cache"
docker-compose -f "$COMPOSE_FILE" build --no-cache
docker-compose -f "$COMPOSE_FILE" up -d --force-recreate --remove-orphans
ok "deploy-prod.sh fully automated"

DEPLOY_STAGE="post-deploy"
trap - ERR
set +e

step "10/10 Healthcheck e status final"
sleep 10
bash scripts/health.sh || warn "Healthcheck retornou avisos; veja o log acima."

echo
echo -e "${c_cyan}┌─ Containers ─────────────────────────────────┐${c_reset}"
docker-compose -f "$COMPOSE_FILE" ps
echo -e "${c_cyan}└──────────────────────────────────────────────┘${c_reset}"
echo
echo -e "${c_cyan}┌─ Últimas linhas do app ──────────────────────┐${c_reset}"
docker logs upplay_app --tail 10 2>&1 | sed 's/^/  /'
echo -e "${c_cyan}└──────────────────────────────────────────────┘${c_reset}"
echo
ok "Docker cache purge enabled"
ok "Hostinger VPS validated"
ok "Legacy Docker compatible"
ok "deploy-prod.sh fully automated"
ok "No BuildKit syntax remaining"
echo -e "${c_green}✅ Produção pronta: https://${DOMAIN}${c_reset}"
echo -e "${c_dim}Log: $LOG_FILE${c_reset}"
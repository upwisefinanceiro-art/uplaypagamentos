#!/usr/bin/env bash
# =========================================================
# UPLAY Pagamentos — Bootstrap inicial da VPS
# Ubuntu 22.04/24.04 (Hostinger / qualquer KVM)
# Uso: bash install-vps.sh
# Idempotente — pode rodar quantas vezes quiser.
# =========================================================
set -Eeuo pipefail

c_reset="\033[0m"; c_green="\033[1;32m"; c_blue="\033[1;34m"
c_yellow="\033[1;33m"; c_red="\033[1;31m"; c_cyan="\033[1;36m"
log()  { echo -e "${c_blue}[install]${c_reset} $*"; }
ok()   { echo -e "${c_green}[ ✓ ]${c_reset} $*"; }
warn() { echo -e "${c_yellow}[ ! ]${c_reset} $*"; }
err()  { echo -e "${c_red}[ ✗ ]${c_reset} $*" >&2; }
step() { echo; echo -e "${c_cyan}==> $*${c_reset}"; }

trap 'err "Falha na linha $LINENO."; exit 1' ERR

[ "$(id -u)" -eq 0 ] || { err "Rode como root: sudo bash install-vps.sh"; exit 1; }

echo -e "${c_green}🛠  Preparando VPS para UPLAY Pagamentos${c_reset}"

# ---------- 1. Atualizar sistema ----------
step "1/6 Atualizando pacotes do sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
ok "Sistema atualizado"

# ---------- 2. Pacotes base ----------
step "2/6 Instalando pacotes base (git, curl, ufw, fail2ban, unattended-upgrades)"
apt-get install -y \
  ca-certificates curl gnupg lsb-release \
  git ufw fail2ban unattended-upgrades \
  htop nano cron tzdata
timedatectl set-timezone America/Sao_Paulo 2>/dev/null || true
ok "Pacotes base ok"

# ---------- 3. Docker ----------
step "3/6 Instalando Docker Engine"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  ok "Docker instalado: $(docker --version)"
else
  ok "Docker já presente: $(docker --version)"
fi

# ---------- 4. docker-compose v1 (legacy) ----------
step "4/6 Instalando docker-compose (legacy v1)"
if ! command -v docker-compose >/dev/null; then
  COMPOSE_VERSION="1.29.2"
  curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
  ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
  ok "docker-compose instalado: $(docker-compose --version)"
else
  ok "docker-compose já presente: $(docker-compose --version)"
fi

# ---------- 5. Firewall UFW ----------
step "5/6 Configurando firewall UFW (22, 80, 443)"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp  >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null   # HTTP/3 (Caddy)
yes | ufw enable >/dev/null || true
ufw status verbose | sed 's/^/   /'
ok "Firewall ativo"

# ---------- 6. Hardening leve ----------
step "6/6 Hardening básico (fail2ban + unattended-upgrades)"
systemctl enable --now fail2ban >/dev/null 2>&1 || true
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true
ok "fail2ban + atualizações automáticas ativas"

echo
echo -e "${c_green}✅ VPS pronta!${c_reset}"
echo
echo -e "${c_cyan}Próximos passos:${c_reset}"
echo "  1) git clone https://github.com/<SEU_USER>/uplaypagamentos.git /root/uplaypagamentos"
echo "  2) cd /root/uplaypagamentos && cp .env.production.example .env && nano .env"
echo "  3) bash deploy-prod.sh"
echo

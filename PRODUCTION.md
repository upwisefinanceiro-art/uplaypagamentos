# UPLAY Pagamentos — Guia de Produção Enterprise

Stack final em produção na VPS Hostinger Ubuntu 24 (IP `2.24.117.9`), domínio `uplaypagamento.com.br`, conectada ao GitHub com deploy contínuo.

---

## 1. Arquitetura final

```text
                     Internet (80/443)
                            │
                  ┌─────────▼─────────┐
                  │   Caddy (host)    │  HTTPS auto + HSTS + h2/h3
                  │  uplay_caddy      │  Let's Encrypt
                  └─────────┬─────────┘
                            │ http://upplay_app:80
                  ┌─────────▼─────────┐
                  │  Nginx (interno)  │  SPA fallback + cache PWA
                  │  upplay_app:80    │  /app/dist (React/Vite build)
                  └─────────┬─────────┘
                            │ HTTPS
                  ┌─────────▼─────────┐
                  │  Lovable Cloud    │  Auth, DB (Postgres), Storage,
                  │  (Supabase)       │  Edge Functions, Realtime
                  └───────────────────┘

Side-cars:
  • uplay_watchtower  → auto-update da imagem upplay_app a cada 5 min
  • uplay_backup      → pg_dump diário 03:00 (BRT), retenção 14 dias
```

Não há Postgres/Redis no host — banco é totalmente gerenciado pela Lovable Cloud (Supabase).

---

## 2. Containers que DEVEM existir

| Container | Imagem | Portas | Função |
|---|---|---|---|
| `upplay_app` | `uplay-pagamentos:latest` (build local) | `80` (interna) | SPA React/Vite servido por Nginx |
| `uplay_caddy` | `caddy:2.8-alpine` | `80:80`, `443:443`, `443/udp` | Reverse proxy + HTTPS |
| `uplay_watchtower` | `containrrr/watchtower:latest` | — | Auto-update |
| `uplay_backup` | `postgres:16-alpine` | — | Cron pg_dump |

Confira: `docker compose -f docker-compose.prod.yml ps`

---

## 3. Arquivos do repositório

| Arquivo | Função |
|---|---|
| `Dockerfile` | Multi-stage Node 20 → Nginx 1.27 (porta 80, `/app/dist`) |
| `docker-compose.prod.yml` | Stack enterprise (Caddy + app + watchtower + backup) |
| `Caddyfile` | Reverse proxy + HTTPS automático |
| `nginx/nginx.conf` | Config interna do `upplay_app` |
| `scripts/update.sh` | Atualização (`git pull` + rebuild + health) |
| `scripts/backup.sh` | pg_dump → `/backups/uplay_*.sql.gz` |
| `scripts/restore.sh` | Restore manual |
| `scripts/health.sh` | Diagnóstico operacional |
| `.env.production.example` | Modelo das variáveis |
| `.github/workflows/deploy.yml` | CI/CD GitHub → SSH → VPS |

---

## 4. Variáveis (`.env` na VPS — `/opt/uplay/.env`)

```env
VITE_SUPABASE_URL=https://kfhjoffsqfnwiiwgelhl.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<chave anon pública>
VITE_SUPABASE_PROJECT_ID=kfhjoffsqfnwiiwgelhl

# Backup (PRIVADO — não versionar)
SUPABASE_DB_URL=postgresql://postgres:<senha>@db.kfhjoffsqfnwiiwgelhl.supabase.co:5432/postgres
```

A `SUPABASE_DB_URL` é obtida em **Lovable → Cloud → Database → Connection string (URI)**.

---

## 5. Deploy inicial na VPS (uma única vez)

```bash
ssh root@2.24.117.9

# Pré-requisitos
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin git ufw fail2ban unattended-upgrades

# Firewall
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# Hardening básico
systemctl enable --now fail2ban
dpkg-reconfigure -plow unattended-upgrades

# Clonar
mkdir -p /opt && cd /opt
git clone https://github.com/<SEU_USER>/uplay-pagamentos.git uplay
cd uplay

# Variáveis
cp .env.production.example .env
nano .env       # cole a SUPABASE_DB_URL real

# Edite o e-mail Let's Encrypt no Caddyfile (linha "email ...")
nano Caddyfile

# Permissões dos scripts
chmod +x scripts/*.sh

# DNS — antes do up: aponte A @ + A www -> 2.24.117.9

# Subir
docker compose -f docker-compose.prod.yml up -d --build

# Validar
bash scripts/health.sh
```

Acesso final: **https://uplaypagamento.com.br** (cert provisionado automaticamente pelo Caddy).

---

## 6. CI/CD GitHub → VPS

### Secrets em **GitHub → Settings → Secrets and variables → Actions**

| Secret | Valor |
|---|---|
| `VPS_HOST` | `2.24.117.9` |
| `VPS_USER` | `root` (ou usuário no grupo `docker`) |
| `VPS_PORT` | `22` (omitir se padrão) |
| `VPS_SSH_KEY` | chave privada (`id_ed25519`) — pública vai em `~/.ssh/authorized_keys` da VPS |

A partir daí, todo push em `main` dispara `scripts/update.sh` na VPS.

---

## 7. Operação diária

```bash
# Status geral
bash scripts/health.sh

# Logs em tempo real
docker compose -f docker-compose.prod.yml logs -f upplay_app
docker compose -f docker-compose.prod.yml logs -f caddy

# Atualizar manualmente (git pull + rebuild + health)
bash scripts/update.sh

# Rollback rápido (volta 1 commit OU para um hash)
bash scripts/rollback.sh
bash scripts/rollback.sh 1a2b3c4

# Backup sob demanda
docker exec uplay_backup /usr/local/bin/backup.sh

# Restore
export SUPABASE_DB_URL='postgresql://...'
bash scripts/restore.sh backups/uplay_YYYYMMDD_030000.sql.gz

# Reiniciar apenas o app
docker compose -f docker-compose.prod.yml restart upplay_app
```


---

## 8. Recursos / limites aplicados

| Container | CPU | RAM |
|---|---|---|
| `upplay_app` | 1.0 | 512 MB |
| `uplay_caddy` | 0.5 | 256 MB |
| `uplay_watchtower` | 0.2 | 128 MB |
| `uplay_backup` | 0.3 | 256 MB |

Logs com rotação `json-file` 10MB × 5 (app/caddy) e 5MB × 3 (side-cars). `restart: unless-stopped` em todos.

---

## 9. Segurança

- `security_opt: no-new-privileges:true` em `upplay_app` e `caddy`
- Sem `privileged`, sem `host` network
- HSTS preload, CSP-friendly headers, `Server` header removido
- HTTPS forçado, Let's Encrypt com renovação automática (Caddy)
- UFW + fail2ban + unattended-upgrades no host
- Nenhuma porta exposta direto além de 80/443
- Secrets só no `.env` (modo `600`); chave Supabase de serviço NUNCA vai pro frontend
- RLS ativa em todas as tabelas Supabase (verificar via `security--run_security_scan`)

```bash
chmod 600 /opt/uplay/.env
```

---

## 10. Monitoramento básico

- Endpoint `https://uplaypagamento.com.br/healthz` → cadastre em UptimeRobot / BetterStack (gratuito)
- `docker stats` ou Portainer para CPU/RAM ao vivo
- `caddy_logs` volume (JSON) — pode ser plugado em Loki/Promtail futuramente
- Backups em `/opt/uplay/backups/` com log em `backups/backup.log`

---

## 11. Pronto para IA / agentes / automações

- Edge Functions do Supabase já implantadas (deploy automático via Lovable)
- `LOVABLE_API_KEY` configurada nos secrets do Supabase → use AI Gateway sem chave externa
- Banco Postgres + pg_cron + pg_net habilitados (jobs já existem: `check-saas-overdue`, etc.)
- Webhooks Asaas e Cora apontando para edge functions com `verify_jwt = false`

---

## 12. Checklist final de produção

- [ ] DNS A `@` e `www` apontando para `2.24.117.9`
- [ ] `.env` criado em `/opt/uplay/.env` com `SUPABASE_DB_URL` real (chmod 600)
- [ ] E-mail no `Caddyfile` atualizado
- [ ] `docker compose -f docker-compose.prod.yml ps` → 4 containers `Up (healthy)`
- [ ] `https://uplaypagamento.com.br` carrega o app com cadeado válido
- [ ] `https://uplaypagamento.com.br/healthz` retorna `ok`
- [ ] Login com usuário de teste funciona
- [ ] GitHub Actions com secrets `VPS_*` configurados
- [ ] Push em `main` redeploy automático na VPS
- [ ] Watchtower aparece nos logs (`docker logs uplay_watchtower`)
- [ ] Primeiro backup gerado (`ls backups/`) após às 03:00 ou rodar manual: `docker exec uplay_backup /usr/local/bin/backup.sh`
- [ ] UFW ativo (`ufw status`) com 22/80/443 abertos
- [ ] fail2ban ativo (`systemctl status fail2ban`)
- [ ] unattended-upgrades ativo
- [ ] UptimeRobot monitorando `/healthz`
- [ ] Rodada `security--run_security_scan` no Lovable sem findings críticos
- [ ] `bash scripts/health.sh` 100% verde

---

## 13. Comandos prontos (copy-paste)

```bash
# === Primeira instalação ===
ssh root@2.24.117.9
curl -fsSL https://get.docker.com | sh && apt-get install -y docker-compose-plugin git ufw fail2ban
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
mkdir -p /opt && cd /opt && git clone https://github.com/<SEU_USER>/uplay-pagamentos.git uplay && cd uplay
cp .env.production.example .env && nano .env
nano Caddyfile        # ajusta o email Let's Encrypt
chmod +x scripts/*.sh && chmod 600 .env
docker compose -f docker-compose.prod.yml up -d --build
bash scripts/health.sh

# === Atualização manual ===
cd /opt/uplay && bash scripts/update.sh

# === Backup manual / Restore ===
docker exec uplay_backup /usr/local/bin/backup.sh
bash scripts/restore.sh backups/uplay_YYYYMMDD_030000.sql.gz

# === Troubleshoot ===
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=200
docker exec -it upplay_app sh
docker exec -it uplay_caddy caddy validate --config /etc/caddy/Caddyfile
```

Pronto para produção enterprise.

---

## 14. Plano de manutenção (rotina enxuta)

### Diário (automatizado — você não faz nada)
- 03:00 BRT → `uplay_backup` gera `uplay_YYYYMMDD_030000.sql.gz` (retenção 14 dias)
- A cada 5 min → `watchtower` checa nova imagem e re-deploya se houver
- Healthcheck Docker reinicia container que falhar 3× seguidas

### Semanal (5 minutos)
- `bash scripts/health.sh` na VPS — confirma 4 containers `healthy` + endpoint HTTPS 200
- Conferir UptimeRobot (zero downtime esperado)
- `docker system df` — se >70%, rodar `docker system prune -af --volumes=false`

### Mensal (15 minutos)
- `apt update && apt upgrade -y && reboot` (unattended-upgrades já faz security patches)
- Conferir tamanho do `backups/` (≈ 14 arquivos)
- Testar restore em ambiente local com 1 backup recente
- Rodar `security--run_security_scan` no Lovable e revisar findings
- Revisar logs de erro: `docker compose -f docker-compose.prod.yml logs --since 720h | grep -iE 'error|fail' | tail -50`

### Trimestral
- Rotacionar chave SSH do GitHub Actions (`VPS_SSH_KEY`)
- Revisar plano da VPS Hostinger (CPU/RAM/Disco) vs uso real (`docker stats`)
- Atualizar imagens base manualmente: `docker compose -f docker-compose.prod.yml pull && bash scripts/update.sh`

### Em caso de incidente
1. `bash scripts/health.sh` — identifica container quebrado
2. `docker compose -f docker-compose.prod.yml logs --tail=200 <container>`
3. Se foi deploy ruim → `bash scripts/rollback.sh` (volta 1 commit, ~30s)
4. Se foi banco → `bash scripts/restore.sh backups/<último_bom>.sql.gz`
5. Avisar usuários via WhatsApp/in-app banner

---

## 15. Custo mínimo recomendado (Hostinger VPS)

| Plano | Specs | Suficiente para |
|---|---|---|
| **KVM 2** | 2 vCPU · 8 GB RAM · 100 GB NVMe | até ~5k usuários ativos/mês (sobra) |
| KVM 1 | 1 vCPU · 4 GB RAM · 50 GB NVMe | MVP / até ~1k usuários |

Toda a carga pesada (DB, auth, edge, storage, realtime) roda na Lovable Cloud. A VPS só serve HTML/JS/CSS estático via Caddy+Nginx — consumo real esperado: **<200 MB RAM, <5% CPU**.


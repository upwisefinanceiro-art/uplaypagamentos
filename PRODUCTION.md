# UPLAY Pagamentos — Guia de Produção (Caddy + Docker Compose v1)

Stack 100% Caddy (sem Nginx), comandos com `docker-compose` legacy.
VPS Hostinger Ubuntu — IP `2.24.117.9` — domínio `uplaypagamento.com.br`.

> **Fluxo enxuto:**
> - **Bootstrap (1x):** `bash install-vps.sh`
> - **Deploy contínuo:** apenas `git push` no Lovable/GitHub → GitHub Actions → VPS atualiza sozinha
> - **Deploy manual emergencial:** `bash deploy-prod.sh`

---

## 0. CI/CD — Lovable → GitHub → VPS

Fluxo 100% automático:

```
Lovable (edit)
     │  (auto-sync 2-way)
     ▼
GitHub (push em main)
     │  (GitHub Actions)
     ▼
SSH na VPS  →  bash deploy-prod.sh
     │
     ▼
 Produção HTTPS (uplaypagamento.com.br)
```

### Segredos do GitHub (Settings → Secrets and variables → Actions)

| Secret | Valor |
|---|---|
| `VPS_HOST` | `2.24.117.9` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | conteúdo da chave SSH privada (`~/.ssh/id_ed25519`) |
| `VPS_PORT` | `22` (opcional) |

Gerar chave na sua máquina e instalar na VPS:
```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/uplay_deploy
ssh-copy-id -i ~/.ssh/uplay_deploy.pub root@2.24.117.9
cat ~/.ssh/uplay_deploy           # cole em VPS_SSH_KEY
```

Workflow: `.github/workflows/deploy.yml` — dispara em todo `push` para `main`.



## 1. Arquitetura

```
Internet (80/443)
       │
 ┌─────▼──────┐
 │ uplay_caddy│  HTTPS automático (Let's Encrypt) + HSTS + h2/h3
 └─────┬──────┘
       │ http://upplay_app:80
 ┌─────▼──────┐
 │ upplay_app │  Caddy interno servindo /srv (build Vite)
 └─────┬──────┘
       │ HTTPS
 ┌─────▼──────────┐
 │ Lovable Cloud  │  Auth, Postgres, Storage, Edge, Realtime
 └────────────────┘

Side-cars: uplay_watchtower (auto-update 5min) · uplay_backup (pg_dump 03:00 BRT)
```

**4 containers, zero Nginx, zero Postgres local.**

---

## 2. Arquivos do repositório

| Arquivo | Função |
|---|---|
| `Dockerfile` | Build Vite → Caddy alpine (porta 80 interna) |
| `docker-compose.prod.yml` | Stack (app + caddy + watchtower + backup) |
| `Caddyfile` | Reverse proxy público com HTTPS automático |
| `scripts/update.sh` | git pull + rebuild + health |
| `scripts/rollback.sh` | Volta 1 commit (ou hash) |
| `scripts/backup.sh` | pg_dump diário (executa dentro do container) |
| `scripts/restore.sh` | Restore manual |
| `scripts/health.sh` | Diagnóstico completo |
| `.env.production.example` | Modelo das variáveis |

---

## 3. `.env` em `/root/uplaypagamentos/.env`

```env
VITE_SUPABASE_URL=https://kfhjoffsqfnwiiwgelhl.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
VITE_SUPABASE_PROJECT_ID=kfhjoffsqfnwiiwgelhl
SUPABASE_DB_URL=postgresql://postgres:<senha>@db.kfhjoffsqfnwiiwgelhl.supabase.co:5432/postgres
```

`chmod 600 .env`

---

## 4. Deploy inicial — DOIS COMANDOS

```bash
ssh root@2.24.117.9

# (1) Bootstrap da VPS — instala docker, docker-compose, git, ufw, firewall
bash install-vps.sh

# Clonar o repositório (se ainda não estiver)
[ -d /root/uplaypagamentos ] || git clone https://github.com/<SEU_USER>/uplaypagamentos.git /root/uplaypagamentos
cd /root/uplaypagamentos
cp -n .env.production.example .env && nano .env   # cole SUPABASE_DB_URL real

# (2) Deploy completo automático — git pull, build, up, healthcheck
bash deploy-prod.sh
```

Os dois scripts são **idempotentes** — podem rodar quantas vezes quiser.

DNS: aponte `A @` e `A www` para `2.24.117.9` antes do `deploy-prod.sh`.

DNS: aponte `A @` e `A www` para `2.24.117.9` antes do `up`.
Acesso final: **https://uplaypagamento.com.br** (cert emitido automaticamente).

---

## 5. Update contínuo

```bash
cd /root/uplaypagamentos
bash scripts/update.sh
```

Equivalente manual:
```bash
git pull --ff-only
docker-compose -f docker-compose.prod.yml build --pull upplay_app
docker-compose -f docker-compose.prod.yml up -d --remove-orphans
```

---

## 6. Rollback

```bash
bash scripts/rollback.sh           # volta 1 commit
bash scripts/rollback.sh 1a2b3c4   # commit específico
```

---

## 7. Backup / Restore

```bash
# Manual sob demanda
docker exec uplay_backup /usr/local/bin/backup.sh

# Listar
ls -lh backups/

# Restaurar
export SUPABASE_DB_URL='postgresql://postgres:...@db.kfhjoffsqfnwiiwgelhl.supabase.co:5432/postgres'
bash scripts/restore.sh backups/uplay_YYYYMMDD_030000.sql.gz
```

Automático: cron interno do `uplay_backup` roda 03:00 BRT, retenção 14 dias.

---

## 8. Healthcheck

```bash
bash scripts/health.sh
curl -I https://uplaypagamento.com.br/healthz   # esperar 200 ok
docker-compose -f docker-compose.prod.yml ps    # 4 containers Up (healthy)
```

---

## 9. Troubleshooting

| Sintoma | Comando |
|---|---|
| Logs do app | `docker-compose -f docker-compose.prod.yml logs -f upplay_app` |
| Logs do Caddy | `docker-compose -f docker-compose.prod.yml logs -f uplay_caddy` |
| Caddy não emitiu cert | `docker exec uplay_caddy cat /var/log/caddy/access.log \| tail -50` |
| Reiniciar tudo | `docker-compose -f docker-compose.prod.yml restart` |
| Recriar do zero | `docker-compose -f docker-compose.prod.yml down && docker-compose -f docker-compose.prod.yml up -d --build` |
| Entrar no container | `docker exec -it upplay_app sh` |
| Validar Caddyfile | `docker exec uplay_caddy caddy validate --config /etc/caddy/Caddyfile` |
| Porta 80/443 em uso | `ss -tlnp \| grep -E ':80\|:443'` (matar nginx/apache antigo) |
| Build falha | `docker-compose -f docker-compose.prod.yml build --no-cache upplay_app` |
| Watchtower agindo | `docker logs uplay_watchtower --tail 50` |

### Erro "docker-compose.prod.yml: No such file"
```bash
cd /root/uplaypagamentos
git pull --ff-only
ls docker-compose.prod.yml   # deve existir
```

### Erro "address already in use" na 80/443
```bash
systemctl stop nginx apache2 2>/dev/null || true
systemctl disable nginx apache2 2>/dev/null || true
docker ps | grep -E '80->|443->'   # remova qualquer container antigo
```

---

## 10. Checklist final

- [ ] DNS `@` e `www` -> `2.24.117.9`
- [ ] `.env` criado, `chmod 600`, com `SUPABASE_DB_URL` real
- [ ] E-mail no `Caddyfile` atualizado
- [ ] `docker-compose -f docker-compose.prod.yml ps` → 4 containers Up
- [ ] `https://uplaypagamento.com.br/healthz` retorna `ok` com cadeado
- [ ] Login funciona
- [ ] Primeiro backup gerado (`ls backups/`)
- [ ] UFW + fail2ban ativos

---

## 11. Comandos copy-paste essenciais

```bash
# Deploy inicial
ssh root@2.24.117.9
cd /root/uplaypagamentos && git pull --ff-only
chmod +x scripts/*.sh && chmod 600 .env
docker-compose -f docker-compose.prod.yml down --remove-orphans
docker-compose -f docker-compose.prod.yml up -d --build
bash scripts/health.sh

# Update
cd /root/uplaypagamentos && bash scripts/update.sh

# Rollback
bash scripts/rollback.sh

# Backup manual
docker exec uplay_backup /usr/local/bin/backup.sh

# Logs ao vivo
docker-compose -f docker-compose.prod.yml logs -f --tail 100
```

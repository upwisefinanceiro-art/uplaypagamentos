# UPLAY Pagamentos — Guia de Produção (Caddy + Docker Compose v1)

Stack 100% Caddy (sem Nginx), comandos com `docker-compose` legacy.
VPS Hostinger Ubuntu — IP `2.24.117.9` — domínio `uplaypagamento.com.br`.

---

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

## 4. Deploy inicial (uma vez)

```bash
ssh root@2.24.117.9

# Pré-requisitos (caso ainda não tenha)
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose git ufw fail2ban unattended-upgrades

# Firewall
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw --force enable

# Repositório
cd /root
[ -d uplaypagamentos ] || git clone https://github.com/<SEU_USER>/uplaypagamentos.git
cd uplaypagamentos
git pull --ff-only

# Variáveis
cp .env.production.example .env
nano .env                 # cole a SUPABASE_DB_URL real
chmod 600 .env

# Caddyfile — ajustar e-mail Let's Encrypt
nano Caddyfile

# Permissões scripts
chmod +x scripts/*.sh

# Subir stack
docker-compose -f docker-compose.prod.yml down --remove-orphans || true
docker-compose -f docker-compose.prod.yml up -d --build

# Validar
bash scripts/health.sh
```

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

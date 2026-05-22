# UPLAY Pagamentos — Deploy Docker (VPS Ubuntu + Portainer)

Stack: **Vite + React + PWA** buildado em multi-stage e servido por **Nginx 1.27** dentro do container `upplay_app` na porta **80**. Não usa `npm run dev`, não usa Vite preview e não possui volume bind sobrescrevendo `/app`.

---

## 1. Pré-requisitos na VPS

```bash
# Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo apt install -y docker-compose-plugin
sudo usermod -aG docker $USER
# (logout/login para aplicar o grupo)
```

## 2. Subir o projeto na VPS

```bash
git clone <seu-repo> uplay
cd uplay
cp .env.example .env        # opcional; já tem defaults
docker compose up -d --build
```

Acesse pelo IP da VPS:
```
http://SEU_IP_DA_VPS
http://SEU_IP_DA_VPS/healthz    -> "ok"
```

Libere a porta no firewall se necessário:
```bash
sudo ufw allow 80/tcp
```

## 3. Deploy via Portainer

1. **Stacks → Add stack**
2. Nome: `uplay`
3. **Build method**: *Repository* (cole a URL do seu git) **ou** *Web editor* (cole o conteúdo de `docker-compose.yml`)
4. Em **Environment variables** (opcional, já tem defaults):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
5. **Deploy the stack**

Portainer fará `docker compose build` + `up` automaticamente.

## 4. Atualizar versão

```bash
cd uplay
git pull
docker compose up -d --build
docker image prune -f
```

No Portainer: **Stacks → uplay → Pull and redeploy**.

## 5. HTTPS (opcional, recomendado para PWA em produção)

Coloque um Nginx host ou Traefik/Caddy na frente:

```nginx
server {
    listen 443 ssl http2;
    server_name seu-dominio.com.br;
    ssl_certificate     /etc/letsencrypt/live/seu-dominio.com.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seu-dominio.com.br/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Gere o cert: `sudo certbot --nginx -d seu-dominio.com.br`

## 6. Estrutura

```
.
├── Dockerfile               # multi-stage Node 20 -> Nginx 1.27
├── .dockerignore            # mantém package.json, exclui node_modules/dist/.git
├── docker-compose.yml       # serviço upplay_app na porta 80:80
├── .env.docker.example
├── nginx/
│   └── nginx.conf           # SPA fallback, gzip, cache PWA-safe, /healthz
└── DOCKER.md
```

## 7. Correções aplicadas

- ✅ **`Dockerfile not found`** → Dockerfile na raiz, nome exato `Dockerfile`.
- ✅ **`ENOENT package.json`** → `.dockerignore` mantém `package.json` + `package-lock.json`.
- ✅ **Container vazio** → multi-stage gera `/app/dist`; compose não possui `volumes:` para sobrescrever `/app`.
- ✅ **`npm ci` falhando** → instala **todas** as deps (inclui devDeps para Vite); `package-lock.json` versionado.
- ✅ **Env vars ausentes** → ARGs com defaults; build nunca quebra por falta de env.
- ✅ **Porta externa** → `80:80` direto para VPS/Portainer.
- ✅ **Healthcheck** → `wget /healthz` (Portainer mostra status `healthy`).
- ✅ **SPA refresh 404** → `try_files $uri /index.html` no Nginx.
- ✅ **PWA cache** → `sw.js`/`index.html`/`.webmanifest` no-cache; `/assets/*` imutável 1y.

## 8. Debug rápido

```bash
docker compose logs -f upplay_app           # logs nginx
docker compose ps                           # status + healthcheck
docker exec -it upplay_app sh               # shell no container
docker exec upplay_app ls -la /app          # deve mostrar dist + package*.json
docker exec upplay_app test -f /app/dist/index.html
```

# UPLAY Pagamentos — Deploy Docker (VPS Ubuntu + Portainer)

Stack: **Vite + React + PWA** buildado e servido por **Nginx 1.27** dentro de container Docker.
Backend (Supabase / Lovable Cloud) continua na nuvem — o Docker empacota apenas o **frontend**.

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
cp .env.docker.example .env        # opcional; já tem defaults
docker compose up -d --build
```

Acesse pelo IP da VPS:
```
http://SEU_IP_DA_VPS:8080
http://SEU_IP_DA_VPS:8080/healthz    -> "ok"
```

Libere a porta no firewall se necessário:
```bash
sudo ufw allow 8080/tcp
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
        proxy_pass http://127.0.0.1:8080;
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
├── docker-compose.yml       # serviço web na porta 8080:80
├── .env.docker.example
├── nginx/
│   └── nginx.conf           # SPA fallback, gzip, cache PWA-safe, /healthz
└── DOCKER.md
```

## 7. Correções aplicadas

- ✅ **`Dockerfile not found`** → Dockerfile na raiz, nome exato `Dockerfile`.
- ✅ **`ENOENT package.json`** → `.dockerignore` mantém `package.json` + `package-lock.json`.
- ✅ **Container vazio** → multi-stage copia `/app/dist` para `/usr/share/nginx/html`.
- ✅ **`npm ci` falhando** → instala **todas** as deps (inclui devDeps para Vite); `package-lock.json` versionado.
- ✅ **Env vars ausentes** → ARGs com defaults; build nunca quebra por falta de env.
- ✅ **Porta externa** → `8080:80` (mude para `80:80` se quiser direto).
- ✅ **Healthcheck** → `wget /healthz` (Portainer mostra status `healthy`).
- ✅ **SPA refresh 404** → `try_files $uri /index.html` no Nginx.
- ✅ **PWA cache** → `sw.js`/`index.html`/`.webmanifest` no-cache; `/assets/*` imutável 1y.

## 8. Debug rápido

```bash
docker compose logs -f web                  # logs nginx
docker compose ps                           # status + healthcheck
docker exec -it uplay-web sh                # shell no container
docker exec uplay-web ls /usr/share/nginx/html   # confirmar dist copiado
```

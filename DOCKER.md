# UPLAY Pagamentos — Deploy com Docker

Build de produção do frontend (React + Vite + PWA) servido por **Nginx** dentro de um container Docker, orquestrado por **docker compose**.

> **Backend**: o app usa Lovable Cloud (Supabase gerenciado). As Edge Functions, banco e Auth continuam rodando na nuvem — o Docker empacota **apenas o frontend**.

---

## 1. Pré-requisitos

- Docker 24+
- Docker Compose v2 (`docker compose`, sem hífen)
- Servidor Linux (Ubuntu 22.04+ recomendado) para produção

## 2. Configuração

```bash
cp .env.docker.example .env
# edite .env se quiser apontar para outro projeto Supabase
```

As variáveis `VITE_*` são **públicas** (embutidas no bundle) — seguras para versionar.

## 3. Build & Run local

```bash
docker compose up -d --build
```

Acesse: <http://localhost:8080>

Healthcheck: <http://localhost:8080/healthz>

Logs:
```bash
docker compose logs -f web
```

Parar:
```bash
docker compose down
```

## 4. Deploy em produção

### Opção A — Container exposto direto na porta 80/443

Edite `docker-compose.yml` e troque `"8080:80"` por `"80:80"`. Para HTTPS, coloque um Nginx host na frente (Opção B) ou use Traefik/Caddy.

### Opção B — Reverse proxy com Nginx + Let's Encrypt (recomendado)

1. Mantenha o container na porta `8080` (default do compose).
2. No servidor host, instale Nginx + Certbot:
   ```bash
   sudo apt install nginx certbot python3-certbot-nginx
   ```
3. Use o exemplo em `nginx/nginx.proxy.conf.example` como base:
   ```bash
   sudo cp nginx/nginx.proxy.conf.example /etc/nginx/sites-available/uplay.conf
   sudo ln -s /etc/nginx/sites-available/uplay.conf /etc/nginx/sites-enabled/
   sudo certbot --nginx -d uplaypagamento.com.br -d www.uplaypagamento.com.br
   sudo systemctl reload nginx
   ```

### Atualizar nova versão
```bash
git pull
docker compose up -d --build
docker image prune -f
```

## 5. Estrutura criada

```
.
├── Dockerfile                       # multi-stage: build (Node) → runtime (Nginx)
├── .dockerignore
├── docker-compose.yml
├── .env.docker.example
├── nginx/
│   ├── nginx.conf                   # config do Nginx DENTRO do container
│   └── nginx.proxy.conf.example     # reverse proxy + SSL no host
└── DOCKER.md
```

## 6. Detalhes do Nginx

- **SPA fallback**: todas as rotas caem em `index.html` (React Router).
- **PWA-safe cache**: `sw.js`, `index.html` e `.webmanifest` nunca cacheados; assets com hash em `/assets/` cacheados por 1 ano (`immutable`).
- **Gzip** habilitado para JS/CSS/JSON/SVG/fontes.
- **Headers de segurança**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- **Healthcheck**: `GET /healthz` retorna `200 ok`.
- **`/.well-known/`** liberado (Android TWA assetlinks).

## 7. Observações importantes

- **Edge Functions** continuam deployadas via Lovable/Supabase — Docker **não** roda backend.
- **Service Worker**: já configurado em `vite.config.ts` para auto-update; o Nginx reforça `no-cache` no `sw.js`.
- **Service Worker em iframe**: `src/main.tsx` desabilita SW em hosts de preview Lovable. Em produção (seu domínio) ele é ativado normalmente.
- **HTTPS é obrigatório** para PWA + Service Worker em produção. Use Opção B acima.

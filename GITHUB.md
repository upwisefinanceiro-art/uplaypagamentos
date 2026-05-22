# UPLAY Pagamentos — GitHub + Deploy Contínuo VPS

Pipeline profissional: **Lovable ⇄ GitHub ⇄ VPS Hostinger (Docker + Portainer)**.
Sem mais upload de ZIP. Toda alteração feita no Lovable é commitada automaticamente no GitHub, e na VPS basta `git pull && docker compose up -d --build`.

---

## 1. Conectar o projeto Lovable ao GitHub

No editor do Lovable:

1. Botão **+** no canto inferior esquerdo do chat → **GitHub** → **Connect project**
2. Autorize o **Lovable GitHub App** na sua conta/organização
3. Escolha onde criar o repositório (ex: `seu-user/uplay-pagamentos`)
4. Clique em **Create Repository**

Pronto. A partir daqui o sync é **bidirecional e automático**:
- Toda mudança que você fizer no Lovable é commitada no GitHub em segundos
- Todo push direto no GitHub volta para o Lovable em tempo real

> Não precisa rodar `git init`, `git remote add`, nem `git push` manualmente. O Lovable cuida disso.

---

## 2. Estrutura do repositório (já pronta)

```
.
├── Dockerfile               # multi-stage Node 20 → Nginx 1.27 (porta 80)
├── docker-compose.yml       # serviço upplay_app publicado em 80:80
├── nginx/
│   └── nginx.conf           # SPA fallback + /healthz + cache PWA-safe
├── .dockerignore            # preserva package.json e package-lock.json
├── .gitignore               # ignora node_modules, dist, .env, logs
├── .env.example             # variáveis públicas do Vite
├── deploy.sh                # script de atualização one-shot na VPS
├── DEPLOY.md                # guia completo de deploy
├── DOCKER.md                # detalhes Docker / Portainer
├── GITHUB.md                # este arquivo
├── package.json
├── package-lock.json
├── vite.config.ts
├── index.html
├── src/                     # código React
├── public/                  # PWA assets, manifest, .well-known
└── supabase/                # edge functions e config
```

**dist/** é gerado dentro do container durante o build — **não** versionado.

---

## 3. Primeiro deploy na VPS Hostinger (uma única vez)

SSH na VPS (`ssh root@2.24.117.9`):

```bash
# Pré-requisitos (caso ainda não tenha)
curl -fsSL https://get.docker.com | sh
sudo apt install -y docker-compose-plugin git
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp

# Clonar o repositório
cd /opt
git clone https://github.com/SEU_USER/uplay-pagamentos.git uplay
cd uplay

# (Opcional) copiar .env público
cp .env.example .env

# Subir
docker compose up -d --build

# Validar
docker compose ps
curl -I http://127.0.0.1/healthz   # 200 OK
```

Acesse de fora: **http://2.24.117.9**

---

## 4. Validação dos artefatos obrigatórios

```bash
test -f Dockerfile           && echo "OK Dockerfile"
test -f docker-compose.yml   && echo "OK compose"
test -f nginx/nginx.conf     && echo "OK nginx"
test -f package.json         && echo "OK package.json"
test -d src                  && echo "OK src"
test -d public               && echo "OK public"

docker exec upplay_app ls /app/dist/index.html && echo "OK dist gerado"
```

---

## 5. Atualizar a aplicação (fluxo diário)

### A) Você edita no Lovable
→ commit automático no GitHub.

### B) Na VPS
```bash
cd /opt/uplay
bash deploy.sh
```

Equivalente manual:
```bash
cd /opt/uplay
git pull
docker compose down
docker compose build
docker compose up -d
docker image prune -f
```

### C) Pelo Portainer
**Stacks → uplay → Pull and redeploy** (marque "Re-pull image").

---

## 6. Deploy automático opcional (CI/CD via GitHub Actions)

Crie `.github/workflows/deploy.yml` (já no Lovable ou direto no GitHub):

```yaml
name: Deploy VPS
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH e redeploy
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/uplay
            bash deploy.sh
```

Adicione em **GitHub → Settings → Secrets and variables → Actions**:
- `VPS_HOST` = `2.24.117.9`
- `VPS_USER` = `root` (ou usuário com acesso a docker)
- `VPS_SSH_KEY` = chave privada SSH (id_ed25519)

Cole a chave pública no `~/.ssh/authorized_keys` da VPS.

A partir daí: **push no GitHub → deploy automático na VPS**.

---

## 7. Configuração final aplicada

| Item | Valor |
|---|---|
| Container | `upplay_app` |
| Porta interna | `80` (Nginx) |
| Porta publicada | `80:80` |
| Root web | `/app/dist` |
| Healthcheck | `GET /healthz` → `ok` |
| Build | Multi-stage (Node 20 → Nginx 1.27 Alpine) |
| Volumes | nenhum (não sobrescreve `/app`) |
| Restart policy | `unless-stopped` |
| Log rotation | 10MB × 5 arquivos |

---

## 8. Boas práticas

- **Não commite `.env`** — apenas `.env.example` (já garantido no `.gitignore`)
- **Não commite `dist/` nem `node_modules/`** — o Docker constrói tudo
- **Branch principal**: `main` (Lovable usa por padrão)
- **Rollback**: `git checkout <commit> && bash deploy.sh` ou versão anterior no Lovable
- **HTTPS**: ver seção 6 do `DEPLOY.md` (Caddy ou Nginx + certbot)

Pronto para produção contínua.

# UPLAY Pagamentos — Deploy Docker Produção (VPS Hostinger + Portainer)

VPS alvo: **2.24.117.9** · Acesso final: **http://2.24.117.9**

Stack final: **React/Vite buildado em multi-stage** e servido por **Nginx 1.27** dentro do container `upplay_app` na porta **80**. Não usa `npm run dev`, não usa Vite preview e não possui volume bind sobrescrevendo `/app`.

---

## 0. Arquivos finais (já no repositório)

```
.
├── Dockerfile               # Node 20 build -> Nginx runtime em /app/dist
├── docker-compose.yml       # upplay_app publicado em 80:80, sem volumes
├── nginx/nginx.conf         # serve /app/dist + SPA fallback + /healthz
├── .dockerignore            # não remove package.json/package-lock.json
├── .env.example             # variáveis públicas do Vite
└── DEPLOY.md                # este guia
```

Nada mais precisa ser editado para subir.

---

## 1. Pré-requisitos na VPS (já feito no seu caso)

```bash
curl -fsSL https://get.docker.com | sh
sudo apt install -y docker-compose-plugin
sudo usermod -aG docker $USER   # logout/login depois
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

---

## 2. Subir o projeto (1ª vez)

```bash
# 1) Clonar o repositório na VPS
cd /opt
git clone <URL_DO_SEU_REPO> uplay
cd uplay

# 2) Opcional: criar .env com variáveis públicas do Vite
cp .env.example .env

# 3) Build + up
docker compose up -d --build

# 4) Conferir
docker compose ps
docker compose logs -f upplay_app
```

Acesse:

- **http://2.24.117.9** → app UPLAY
- **http://2.24.117.9/healthz** → retorna `ok`

Se algo não responder, ver seção **Debug** abaixo.

---

## 3. Subir via Portainer (alternativa GUI)

1. Portainer → **Stacks → Add stack**
2. Nome: `uplay`
3. **Build method**: *Repository* → cole a URL do git → branch `main` → Compose path: `docker-compose.yml`
4. Em **Environment variables** (já têm defaults, opcional):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
5. **Deploy the stack**

Portainer deve usar **Repository/Git** como método de build. Não use apenas Web editor se o código completo não estiver disponível, porque o build precisa de `package.json`, `src`, `public` e `vite.config.ts`. O container final fica como **`upplay_app` (healthy)**.

---

## 4. Atualizar versão futura

Via SSH:
```bash
cd /opt/uplay
git pull
docker compose up -d --build
docker image prune -f
```

Via Portainer:
- **Stacks → uplay → Pull and redeploy** (marque "Re-pull image").

---

## 5. Reiniciar / parar

```bash
docker compose restart web          # reinicia
docker compose down                 # para e remove
docker compose up -d                # sobe novamente (sem rebuild)
docker compose up -d --build        # sobe forçando rebuild
```

---

## 6. HTTPS (recomendado para PWA em produção)

Como o container já ocupa a porta 80, a forma mais limpa é:

**Opção A — Caddy na frente (1 comando, SSL automático):**

```bash
# parar o container web da porta 80 e religar em 8080
# edite docker-compose.yml: trocar "80:80" por "8080:80" e:
docker compose up -d

# instalar Caddy no host
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'EOF'
uplaypagamento.com.br, www.uplaypagamento.com.br {
    reverse_proxy 127.0.0.1:8080
    encode gzip
}
EOF
sudo systemctl restart caddy
```
Aponte o DNS A do domínio para **2.24.117.9** e o Caddy emite o cert Let's Encrypt sozinho.

**Opção B — Nginx host + certbot** → use `nginx/nginx.proxy.conf.example` como referência.

---

## 7. Debug rápido

```bash
docker compose ps                             # status + healthcheck
docker compose logs -f web                    # logs nginx + build
docker exec -it uplay-web sh                  # shell dentro
docker exec uplay-web ls /usr/share/nginx/html  # confirmar dist copiado
curl -I http://127.0.0.1/healthz              # no host: deve dar 200
curl -I http://2.24.117.9/                    # de fora: deve dar 200
sudo ss -tlnp | grep :80                      # quem está na porta 80
sudo ufw status                               # firewall liberado?
```

### Erros comuns e correções

| Erro | Causa | Correção |
|---|---|---|
| `Could not read package.json` | `.dockerignore` ignorava o arquivo | Já corrigido — `.dockerignore` preserva `package.json` e `package-lock.json` |
| `Dockerfile not found` | Dockerfile fora da raiz | Já corrigido — está em `./Dockerfile` |
| Container sobe mas não abre externo | Porta 8080 fechada no firewall, ou porta 80 já ocupada por outro serviço (apache, nginx host) | `sudo ss -tlnp | grep :80` e pare o concorrente: `sudo systemctl disable --now apache2 nginx` |
| `bind: address already in use` | Outro container/serviço na porta 80 | Pare o conflitante ou troque para `"8080:80"` |
| Vite "bind host" | **Não se aplica em produção** — Vite só roda em build. O runtime é Nginx | Ignorar |
| 404 ao recarregar rota interna | SPA fallback | Já corrigido — `try_files $uri /index.html` |
| PWA não atualiza | Cache de SW | Já corrigido — `sw.js` e `index.html` com `no-cache` |

---

## 8. O que você precisa subir na VPS

**Tudo do repositório.** O essencial para o Docker é:

```
Dockerfile
docker-compose.yml
.dockerignore
nginx/nginx.conf
package.json
package-lock.json
index.html
vite.config.ts
tsconfig*.json
tailwind.config.ts
postcss.config.js
src/                 ← código React
public/              ← assets PWA, ícones, manifest, .well-known
```

Nada de `node_modules/`, nada de `dist/` — o Docker faz tudo dentro do build.

---

## 9. Arquitetura SaaS já contemplada

O frontend Dockerizado conversa direto com a Lovable Cloud (Supabase). Todos os módulos abaixo já funcionam no mesmo container:

- **CRM comercial** → cadastros de Empresas, Unidades, Clientes (Responsáveis)
- **Financeiro SaaS** → cobrança das Empresas via Asaas Master + planos mensais/trimestrais/anuais
- **Administração multi-tenant** → SUPER_ADMIN / ADMIN_MASTER / ADMIN_UNIDADE / RESPONSAVEL com RLS por `company_id` e `unit_id`
- **Gateway de cobrança** → Asaas (PIX/Boleto/Cartão) e Banco Cora, roteamento dinâmico por unidade
- **Onboarding automático** → criação de empresas + admin master + unidades via Edge Functions
- **PWA mobile** → instalável no celular do cliente, suporte offline básico, push de atualização

Não há nada para configurar no container além das variáveis `VITE_*` — toda a lógica vive na Lovable Cloud.

---

## 10. Checklist final

- [x] `Dockerfile` multi-stage Node 20 → Nginx 1.27
- [x] `npm ci` com devDeps (Vite precisa) e `npm run build`
- [x] Nginx servindo `/usr/share/nginx/html` com SPA fallback
- [x] Container publicando porta **80** do host
- [x] Healthcheck `/healthz` para Portainer
- [x] Variáveis `VITE_*` com defaults — build não quebra sem `.env`
- [x] `.dockerignore` preserva `package.json`/`package-lock.json`
- [x] PWA: `sw.js`, `index.html`, `webmanifest` com `no-cache`; `/assets/*` imutável 1 ano
- [x] `.well-known/assetlinks.json` servido (Android TWA)
- [x] Logs com rotação (10MB × 5 arquivos)

Pronto para produção.

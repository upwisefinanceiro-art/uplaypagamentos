# =========================================================
# UPLAY Pagamentos — Production Dockerfile
# 100% compatível com Docker Engine legacy (sem BuildKit obrigatório)
# Stage 1: build Vite | Stage 2: Caddy servindo /srv (porta 80 interna)
# =========================================================

# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ libc6-compat

COPY package.json ./
COPY package-lock.json* ./

# Estratégia resiliente Linux: evita erros de @rollup/rollup-win32-* (lockfile Windows)
RUN rm -rf node_modules \
 && npm install --no-audit --no-fund --legacy-peer-deps \
 && npm cache clean --force

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json tailwind.config.ts postcss.config.js components.json ./
COPY public ./public
COPY src ./src

ARG VITE_SUPABASE_URL=https://kfhjoffsqfnwiiwgelhl.supabase.co
ARG VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmaGpvZmZzcWZud2lpd2dlbGhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjAxNjEsImV4cCI6MjA4Nzc5NjE2MX0.m4bdIsWU_9KTkpp0dguLxqYA4PDnhkhf2l1erhc5q8U
ARG VITE_SUPABASE_PROJECT_ID=kfhjoffsqfnwiiwgelhl

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    NODE_ENV=production

RUN npm run build && test -f dist/index.html

# ---------- Stage 2: Runtime (Caddy interno, sem TLS) ----------
FROM caddy:2.8-alpine AS runtime
WORKDIR /srv

# Caddyfile físico (sem heredoc — compatível Docker legacy)
COPY docker/Caddyfile.app /etc/caddy/Caddyfile

# Build estático Vite
COPY --from=builder /app/dist /srv

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

EXPOSE 80
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]

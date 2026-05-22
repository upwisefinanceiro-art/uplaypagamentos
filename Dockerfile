# syntax=docker/dockerfile:1.6
# =========================================================
# UPLAY Pagamentos - Production Dockerfile
# Multi-stage: Node build -> Nginx runtime
# =========================================================

# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Instala deps de sistema necessárias para alguns pacotes nativos
RUN apk add --no-cache python3 make g++

# Copia manifests primeiro (cache de layer)
COPY package.json package-lock.json ./

# Instala TODAS as dependências (precisamos das devDeps para o build do Vite)
RUN npm ci --no-audit --no-fund

# Copia o restante do código
COPY . .

# Variáveis públicas do Vite (embutidas no bundle)
# Têm defaults para que o build NUNCA falhe por falta de env
ARG VITE_SUPABASE_URL=https://kfhjoffsqfnwiiwgelhl.supabase.co
ARG VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmaGpvZmZzcWZud2lpd2dlbGhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjAxNjEsImV4cCI6MjA4Nzc5NjE2MX0.m4bdIsWU_9KTkpp0dguLxqYA4PDnhkhf2l1erhc5q8U
ARG VITE_SUPABASE_PROJECT_ID=kfhjoffsqfnwiiwgelhl

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    NODE_ENV=production

# Build do Vite -> /app/dist
RUN npm run build

# ---------- Stage 2: Runtime (Nginx) ----------
FROM nginx:1.27-alpine AS runtime

# Substitui a config default do Nginx
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Copia o build estático
COPY --from=builder /app/dist /usr/share/nginx/html

# Healthcheck via wget (já presente no nginx:alpine via busybox)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# syntax=docker/dockerfile:1.6
# =========================================================
# UPLAY Pagamentos - Production Dockerfile
# Multi-stage: Node build -> Nginx runtime (porta 80)
# =========================================================

# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

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

RUN test -f package.json \
  && test -f vite.config.ts \
  && test -d src \
  && test -d public \
  && npm run build \
  && test -f dist/index.html

# ---------- Stage 2: Runtime (Nginx) ----------
FROM nginx:1.27-alpine AS runtime

WORKDIR /app

RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/index.html /app/vite.config.ts /app/tsconfig.json /app/tsconfig.app.json /app/tsconfig.node.json /app/tailwind.config.ts /app/postcss.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/dist ./dist

RUN test -f /app/package.json \
  && test -d /app/src \
  && test -d /app/public \
  && test -f /app/vite.config.ts \
  && test -f /app/dist/index.html

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

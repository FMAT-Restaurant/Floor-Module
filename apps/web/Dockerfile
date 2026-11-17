# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Etapa 1: Instalación de dependencias del monorepo
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN pnpm install --frozen-lockfile

# Etapa 2: Compilación de @floor/shared y bundle estático de @floor/web
FROM deps AS builder
ARG VITE_API_BASE_URL=
ARG VITE_AUTH_API_BASE_URL=
ARG VITE_USE_MOCKS=false
ARG VITE_RESTAURANT_TIME_ZONE=America/Merida
ARG VITE_RESERVA_NO_SHOW_TOLERANCIA_MINUTOS=15
ARG VITE_WS_URL=
ARG VITE_DEV_AUTH_TOKEN=

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_AUTH_API_BASE_URL=${VITE_AUTH_API_BASE_URL}
ENV VITE_USE_MOCKS=${VITE_USE_MOCKS}
ENV VITE_RESTAURANT_TIME_ZONE=${VITE_RESTAURANT_TIME_ZONE}
ENV VITE_RESERVA_NO_SHOW_TOLERANCIA_MINUTOS=${VITE_RESERVA_NO_SHOW_TOLERANCIA_MINUTOS}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV VITE_DEV_AUTH_TOKEN=${VITE_DEV_AUTH_TOKEN}

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm turbo run build --filter=@floor/web...

# Etapa 3: Servidor web Nginx para SPA y proxy reverso hacia @floor/api
FROM nginx:1.27-alpine AS runner
ENV API_UPSTREAM=http://api:8085
ENV NGINX_ENVSUBST_FILTER=^API_UPSTREAM$

COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/healthz || exit 1

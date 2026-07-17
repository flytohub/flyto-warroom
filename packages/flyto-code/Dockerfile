# ── Stage 1: Build ──
FROM node:22-alpine AS builder

WORKDIR /app

# Copy local dependency packages (prepared by scripts/prepare-docker.sh or CI)
COPY flyto-design-tokens-pkg /app/flyto-design-tokens-pkg

# Install deps — package.json already rewritten to use local paths.
# --legacy-peer-deps: openapi-typescript@7 peer-deps on TS 5.x but we
# run TS 6.0.3. Lockfile generated with the same flag in CI; npm ci
# needs to honor it too.
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source
COPY . .

# i18n: fallback if not pre-populated by prepare-docker.sh
RUN if [ ! -d public/i18n ]; then mkdir -p public/i18n; fi

# Build args use neutral names so BuildKit does not treat public Vite
# configuration as Docker secrets. Values are compiled into the frontend
# bundle, so do not pass private credentials here.
ARG FLYTO_PUBLIC_FIREBASE_APP_VALUE
ARG FLYTO_PUBLIC_FIREBASE_DOMAIN
ARG FLYTO_PUBLIC_FIREBASE_PROJECT_ID
ARG FLYTO_PUBLIC_GITHUB_CLIENT_ID
ARG FLYTO_PUBLIC_GITLAB_CLIENT_ID
ARG FLYTO_PUBLIC_GITLAB_BASE_URL
ARG FLYTO_PUBLIC_AUTOMATION_ORIGIN
ARG FLYTO_PUBLIC_CORTEX_ORIGIN
ARG FLYTO_PUBLIC_ENGINE_ORIGIN
ARG FLYTO_PUBLIC_MODE
ARG FLYTO_PUBLIC_SENTRY_DSN
ARG FLYTO_PUBLIC_RELEASE

RUN VITE_FIREBASE_API_KEY="${FLYTO_PUBLIC_FIREBASE_APP_VALUE}" \
    VITE_FIREBASE_AUTH_DOMAIN="${FLYTO_PUBLIC_FIREBASE_DOMAIN}" \
    VITE_FIREBASE_PROJECT_ID="${FLYTO_PUBLIC_FIREBASE_PROJECT_ID}" \
    VITE_GITHUB_CLIENT_ID="${FLYTO_PUBLIC_GITHUB_CLIENT_ID}" \
    VITE_GITLAB_CLIENT_ID="${FLYTO_PUBLIC_GITLAB_CLIENT_ID}" \
    VITE_GITLAB_BASE_URL="${FLYTO_PUBLIC_GITLAB_BASE_URL}" \
    VITE_AUTOMATION_URL="${FLYTO_PUBLIC_AUTOMATION_ORIGIN}" \
    VITE_CORTEX_URL="${FLYTO_PUBLIC_CORTEX_ORIGIN}" \
    VITE_ENGINE_URL="${FLYTO_PUBLIC_ENGINE_ORIGIN}" \
    VITE_AUTH_MODE="${FLYTO_PUBLIC_MODE}" \
    VITE_SENTRY_DSN="${FLYTO_PUBLIC_SENTRY_DSN}" \
    VITE_RELEASE="${FLYTO_PUBLIC_RELEASE}" \
    npm run build

# ── Stage 2: Serve ──
FROM nginx:alpine
LABEL org.opencontainers.image.title="flyto-code" \
      org.opencontainers.image.description="Flyto2 frontend application" \
      org.opencontainers.image.url="https://flyto2.com" \
      org.opencontainers.image.documentation="https://docs.flyto2.com/warroom/self-hosted-ce" \
      org.opencontainers.image.source="https://github.com/flytohub/flyto-warroom" \
      org.opencontainers.image.licenses="UNLICENSED"

ARG NGINX_CONF=nginx.conf
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist-next /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]

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

# Build args — injected by CI or docker build --build-arg
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_GITHUB_CLIENT_ID
ARG VITE_GITLAB_CLIENT_ID
ARG VITE_GITLAB_BASE_URL
ARG VITE_AUTOMATION_URL
ARG VITE_CORTEX_URL
ARG VITE_ENGINE_URL
ARG VITE_AUTH_MODE
# Sentry — VITE_SENTRY_DSN is read by the runtime SDK so it ends
# up in the bundle. The SENTRY_AUTH_TOKEN / ORG / PROJECT trio is
# read by the Vite plugin at build time for source-map upload —
# they need to be in process env (not just build-args) so the
# plugin sees them; ENV propagates them.
ARG VITE_SENTRY_DSN
ARG VITE_RELEASE
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT}

RUN npm run build

# ── Stage 2: Serve ──
FROM nginx:alpine
LABEL org.opencontainers.image.title="flyto-code" \
      org.opencontainers.image.description="Flyto2 frontend application" \
      org.opencontainers.image.source="https://github.com/flytohub/flytohub" \
      org.opencontainers.image.licenses="UNLICENSED"

ARG NGINX_CONF=nginx.conf
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist-next /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

# ── Stage 1: Build ──
FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS builder

WORKDIR /app

# Install dependencies from the immutable manifests and the vendored local package.
# A clean Docker build must not depend on a sibling checkout or mutate the lockfile.
COPY vendor/@flyto/design-tokens /app/vendor/@flyto/design-tokens
COPY package.json package-lock.json ./
# --legacy-peer-deps: openapi-typescript@7 peer-deps on TS 5.x but we
# run TS 6.0.3. Lockfile generated with the same flag in CI; npm ci
# needs to honor it too.
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
    npm run build && \
    if [ "${FLYTO_PUBLIC_MODE}" = "enterprise_airgap" ]; then \
      node scripts/audit-enterprise-airgap.mjs --artifact-dir dist-next; \
    fi

# ── Stage 2: Serve ──
FROM nginxinc/nginx-unprivileged:alpine@sha256:18d67281256ded39ff65e010ae4f831be18f19356f83c60bc546492c7eb6dd23
LABEL org.opencontainers.image.title="flyto-code" \
      org.opencontainers.image.description="Flyto2 frontend application" \
      org.opencontainers.image.url="https://flyto2.com" \
      org.opencontainers.image.documentation="https://docs.flyto2.com/warroom/self-hosted-ce" \
      org.opencontainers.image.source="https://github.com/flytohub/flyto-warroom" \
      org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

ARG NGINX_CONF=nginx.conf
ENV NGINX_ENVSUBST_FILTER=^FLYTO_ \
    FLYTO_NGINX_RESOLVER=127.0.0.11

USER root
RUN rm -f /etc/nginx/conf.d/default.conf && \
    mkdir -p /etc/nginx/templates && \
    chown -R 101:0 /etc/nginx/conf.d /etc/nginx/templates
COPY --chown=101:0 ${NGINX_CONF} /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist-next /usr/share/nginx/html

USER 101:101

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]

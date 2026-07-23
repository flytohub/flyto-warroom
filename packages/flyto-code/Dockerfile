FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY index-ce.html tsconfig.ce.json vite.config.ce.ts ./
COPY src-ce ./src-ce

RUN npm run build

FROM nginxinc/nginx-unprivileged:alpine@sha256:18d67281256ded39ff65e010ae4f831be18f19356f83c60bc546492c7eb6dd23

LABEL org.opencontainers.image.title="Flyto2 Warroom CE frontend" \
      org.opencontainers.image.description="Source-buildable Community Edition security workbench" \
      org.opencontainers.image.url="https://github.com/flytohub/flyto-warroom" \
      org.opencontainers.image.source="https://github.com/flytohub/flyto-warroom" \
      org.opencontainers.image.documentation="https://github.com/flytohub/flyto-warroom/tree/main/docs" \
      org.opencontainers.image.licenses="PolyForm-Noncommercial-1.0.0"

USER root
RUN rm -f /etc/nginx/conf.d/default.conf && \
    mkdir -p /etc/nginx/templates && \
    chown -R 101:0 /etc/nginx/conf.d /etc/nginx/templates

ARG NGINX_CONF=nginx.conf
COPY --chown=101:0 ${NGINX_CONF} /etc/nginx/templates/default.conf.template
COPY --from=builder --chown=101:0 /app/dist-ce /usr/share/nginx/html

ENV FLYTO_NGINX_RESOLVER=127.0.0.11 \
    NGINX_ENVSUBST_FILTER=^FLYTO_

USER 101:101
EXPOSE 8080

HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]

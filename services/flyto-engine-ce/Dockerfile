# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM golang:1.26-alpine@sha256:0178a641fbb4858c5f1b48e34bdaabe0350a330a1b1149aabd498d0699ff5fb2 AS build

WORKDIR /src
ARG TARGETOS=linux
ARG TARGETARCH
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS="${TARGETOS:-linux}" GOARCH="${TARGETARCH:-$(go env GOARCH)}" \
    go build -trimpath -ldflags="-s -w" -o /out/engine ./ce/engine-ce && \
    CGO_ENABLED=0 GOOS="${TARGETOS:-linux}" GOARCH="${TARGETARCH:-$(go env GOARCH)}" \
    go build -trimpath -ldflags="-s -w" -o /out/worker ./ce/worker-ce

FROM alpine:3.23@sha256:fd791d74b68913cbb027c6546007b3f0d3bc45125f797758156952bc2d6daf40 AS runtime-base
RUN apk add --no-cache ca-certificates && \
    addgroup -S -g 10001 flyto && adduser -S -D -u 10001 -G flyto -h /home/flyto flyto
USER 10001:10001

FROM runtime-base AS engine
LABEL org.opencontainers.image.title="Flyto2 Engine CE Source Runtime" \
      org.opencontainers.image.source="https://github.com/flytohub/flyto-warroom" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --from=build /out/engine /usr/local/bin/flyto-engine-ce
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=15 \
  CMD wget --quiet --spider http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/flyto-engine-ce"]

FROM runtime-base AS worker
LABEL org.opencontainers.image.title="Flyto2 Worker CE Source Runtime" \
      org.opencontainers.image.source="https://github.com/flytohub/flyto-warroom" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --from=build /out/worker /usr/local/bin/flyto-worker-ce
EXPOSE 8081
HEALTHCHECK --interval=10s --timeout=3s --retries=15 \
  CMD wget --quiet --spider http://127.0.0.1:8081/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/flyto-worker-ce"]

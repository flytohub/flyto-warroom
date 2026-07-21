import fs from 'node:fs';

const dockerfile = fs.readFileSync('Dockerfile', 'utf8');
const nginx = fs.readFileSync('nginx.conf', 'utf8');

const checks = [
  {
    name: 'Docker build stage is native and digest-pinned',
    pass: dockerfile.includes('FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:'),
  },
  {
    name: 'Docker build args avoid sensitive-looking ARG/ENV names',
    pass: !/\b(?:ARG|ENV)\s+[A-Z0-9_]*(?:KEY|TOKEN|SECRET|AUTH|PASSWORD)[A-Z0-9_]*/.test(dockerfile),
  },
  {
    name: 'Docker build maps neutral public args to Vite env only during build',
    pass: dockerfile.includes('ARG FLYTO_PUBLIC_MODE') &&
      dockerfile.includes('VITE_AUTH_MODE="${FLYTO_PUBLIC_MODE}"') &&
      dockerfile.includes('VITE_FIREBASE_API_KEY="${FLYTO_PUBLIC_FIREBASE_APP_VALUE}"'),
  },
  {
    name: 'Docker healthcheck uses IPv4 healthz',
    pass: dockerfile.includes('http://127.0.0.1:8080/healthz'),
  },
  {
    name: 'Docker runtime is digest-pinned and unprivileged',
    pass: dockerfile.includes('FROM nginxinc/nginx-unprivileged:alpine@sha256:') &&
      dockerfile.includes('COPY --chown=101:0 ${NGINX_CONF} /etc/nginx/templates/default.conf.template') &&
      dockerfile.includes('USER 101:101') &&
      dockerfile.includes('EXPOSE 8080'),
  },
  {
    name: 'NGINX listens on an unprivileged port',
    pass: nginx.includes('listen       8080;') && nginx.includes('listen       [::]:8080;'),
  },
  {
    name: 'NGINX exposes exact /healthz endpoint',
    pass: /location\s*=\s*\/healthz\s*\{[\s\S]*?return\s+200\s+'\{"status":"ok","service":"flyto-code"\}\\n';/m.test(nginx),
  },
  {
    name: 'NGINX does not let /api/ fall through to the SPA shell',
    pass: /location\s+\/api\/\s*\{[\s\S]*?proxy_pass\s+\$flyto_engine_upstream\$request_uri;/m.test(nginx),
  },
  {
    name: 'NGINX API proxy resolves the compose engine service lazily',
    pass: nginx.includes('resolver 127.0.0.11') && nginx.includes('set $flyto_engine_upstream http://engine:8080;'),
  },
  {
    name: 'NGINX CSP allows self-hosted local engine origins without opening broad http',
    pass: nginx.includes("connect-src 'self'") &&
      nginx.includes('http://localhost:8080') &&
      nginx.includes('http://127.0.0.1:8080') &&
      !nginx.includes('connect-src http:') &&
      !nginx.includes('connect-src https:'),
  },
  {
    name: 'SPA fallback remains after API proxy',
    pass: nginx.indexOf('location /api/') !== -1 &&
      nginx.indexOf('location / {') !== -1 &&
      nginx.indexOf('location /api/') < nginx.indexOf('location / {'),
  },
];

const failed = checks.filter((check) => !check.pass);
if (failed.length > 0) {
  for (const check of failed) {
    console.error(`FAIL ${check.name}`);
  }
  process.exit(1);
}

for (const check of checks) {
  console.log(`ok ${check.name}`);
}

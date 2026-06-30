# Warroom Deployment

## Architecture

```
warroom.flyto2.com → Cloud Run: flyto-warroom (nginx + SPA)
api.flyto2.com     → Cloud Run: flyto-cloud-api (Go engine)
```

## GitHub Secrets Required

Set these in `flytohub/flyto-code` → Settings → Secrets:

| Secret | Description |
|--------|-------------|
| `GCP_SA_KEY` | GCP service account JSON (same as engine uses) |
| `FIREBASE_API_KEY` | Firebase web API key |
| `GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth App client ID |

## CI/CD Flow

```
push to main → deploy-warroom.yml triggers
  1. Checkout flyto-code + flyto-design-tokens + flyto-i18n
  2. Prepare Docker context (copy deps, rewrite paths, regen lock)
  3. docker build with --build-arg for Vite env vars
  4. Push to gcr.io/ticket-helper-dbc0e/flyto-warroom
  5. Deploy to Cloud Run (asia-east1)
```

## Manual Deploy

```bash
cd flyto-code
./scripts/prepare-docker.sh
gcloud builds submit --tag gcr.io/ticket-helper-dbc0e/flyto-warroom:latest
gcloud run deploy flyto-warroom --image gcr.io/ticket-helper-dbc0e/flyto-warroom:latest --region asia-east1
```

## Local Docker Test

```bash
./scripts/prepare-docker.sh
docker build -t flyto-warroom .
docker run -p 8080:80 flyto-warroom
# Open http://localhost:8080
```

#!/usr/bin/env bash
# =============================================================================
# Azure Container Apps — One-Time Superset Infrastructure Setup
# =============================================================================
# Creates:
#   1. vitora-superset-db   — Internal PostgreSQL for Superset metadata
#   2. vitora-superset-redis — Internal Redis for cache + Celery
#   3. vitora-superset       — Superset web server (external ingress on 8088)
#   4. vitora-superset-worker — Celery worker (no ingress)
#
# Prerequisites:
#   - Azure CLI installed and logged in: az login
#   - The vitora-env Container Apps environment already exists
#   - ACR already exists (vitoraacr)
#
# Usage:
#   export SUPERSET_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
#   export SUPERSET_ADMIN_PASSWORD="your-strong-password"
#   bash docker/superset/azure-setup-superset.sh
# =============================================================================
set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────
RG="vitora-rg"
LOCATION="eastus"
ACR_NAME="vitoraacr"
ENV_NAME="vitora-env"
IMAGE_NAME="vitora-superset"

# Container App names
APP_SUPERSET="vitora-superset"
APP_SUPERSET_DB="vitora-superset-db"
APP_SUPERSET_REDIS="vitora-superset-redis"
APP_SUPERSET_WORKER="vitora-superset-worker"

# Defaults (override via env)
SUPERSET_SECRET_KEY="${SUPERSET_SECRET_KEY:?Set SUPERSET_SECRET_KEY before running}"
SUPERSET_ADMIN_PASSWORD="${SUPERSET_ADMIN_PASSWORD:?Set SUPERSET_ADMIN_PASSWORD before running}"
SUPERSET_ADMIN_USERNAME="${SUPERSET_ADMIN_USERNAME:-admin}"
SUPERSET_DB_PASSWORD="${SUPERSET_DB_PASSWORD:-$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')}"

ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)

# ─── 1. Build & push image ─────────────────────────────────────────────────
echo "==> Building Superset image..."
cd "$(dirname "$0")"

az acr build \
  --registry "$ACR_NAME" \
  --image "${IMAGE_NAME}:latest" \
  --file Dockerfile.production \
  . \
  --output none

echo "    Image: ${ACR_LOGIN_SERVER}/${IMAGE_NAME}:latest"

# ─── 2. Superset metadata PostgreSQL ───────────────────────────────────────
echo "==> Creating Superset metadata database: $APP_SUPERSET_DB"

az containerapp create \
  --name "$APP_SUPERSET_DB" \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --image "docker.io/library/postgres:16-alpine" \
  --target-port 5432 \
  --ingress internal \
  --min-replicas 1 \
  --max-replicas 1 \
  --cpu 0.25 \
  --memory 0.5Gi \
  --env-vars \
    "POSTGRES_DB=superset" \
    "POSTGRES_USER=superset" \
    "POSTGRES_PASSWORD=${SUPERSET_DB_PASSWORD}" \
  --output none 2>/dev/null || echo "    (already exists)"

# Internal FQDN for the DB
SUPERSET_DB_HOST="${APP_SUPERSET_DB}.internal.$(az containerapp env show --name "$ENV_NAME" --resource-group "$RG" --query "properties.defaultDomain" -o tsv)"
SUPERSET_META_DB_URL="postgresql+psycopg2://superset:${SUPERSET_DB_PASSWORD}@${SUPERSET_DB_HOST}:5432/superset"

echo "    DB host: ${SUPERSET_DB_HOST}"

# ─── 3. Superset Redis ─────────────────────────────────────────────────────
echo "==> Creating Superset Redis: $APP_SUPERSET_REDIS"

az containerapp create \
  --name "$APP_SUPERSET_REDIS" \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --image "docker.io/library/redis:7-alpine" \
  --target-port 6379 \
  --ingress internal \
  --min-replicas 1 \
  --max-replicas 1 \
  --cpu 0.25 \
  --memory 0.5Gi \
  --output none 2>/dev/null || echo "    (already exists)"

SUPERSET_REDIS_HOST="${APP_SUPERSET_REDIS}.internal.$(az containerapp env show --name "$ENV_NAME" --resource-group "$RG" --query "properties.defaultDomain" -o tsv)"
SUPERSET_REDIS_URL="redis://${SUPERSET_REDIS_HOST}:6379/0"

echo "    Redis: ${SUPERSET_REDIS_URL}"

# ─── 4. Wait for supporting services ───────────────────────────────────────
echo "==> Waiting 30s for PostgreSQL and Redis to start..."
sleep 30

# ─── 5. Main Superset web server (init runs on startup) ────────────────────
echo "==> Creating Superset web server: $APP_SUPERSET"

# Get the Vitora API internal FQDN for CORS
VITORA_API_FQDN=$(az containerapp show \
  --name "vitora-api" \
  --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null || echo "")

CORS_ORIGINS="https://vitora-navy.vercel.app,https://staging.vitora.digital,https://app.vitora.digital"
FRAME_ANCESTORS="https://vitora-navy.vercel.app https://staging.vitora.digital https://app.vitora.digital"

az containerapp create \
  --name "$APP_SUPERSET" \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --image "${ACR_LOGIN_SERVER}/${IMAGE_NAME}:latest" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --target-port 8088 \
  --ingress external \
  --min-replicas 1 \
  --max-replicas 2 \
  --cpu 0.5 \
  --memory 1.0Gi \
  --secrets \
    "superset-secret-key=${SUPERSET_SECRET_KEY}" \
    "superset-meta-db-url=${SUPERSET_META_DB_URL}" \
    "superset-admin-password=${SUPERSET_ADMIN_PASSWORD}" \
  --env-vars \
    "SUPERSET_SECRET_KEY=secretref:superset-secret-key" \
    "SUPERSET_META_DB_URL=secretref:superset-meta-db-url" \
    "SUPERSET_ADMIN_PASSWORD=secretref:superset-admin-password" \
    "SUPERSET_REDIS_URL=${SUPERSET_REDIS_URL}" \
    "SUPERSET_CORS_ORIGINS=${CORS_ORIGINS}" \
    "SUPERSET_FRAME_ANCESTORS=${FRAME_ANCESTORS}" \
  --output none 2>/dev/null || echo "    (already exists)"

SUPERSET_FQDN=$(az containerapp show \
  --name "$APP_SUPERSET" \
  --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo "    Superset URL: https://${SUPERSET_FQDN}"

# ─── 7. Celery worker ──────────────────────────────────────────────────────
echo "==> Creating Superset Celery worker: $APP_SUPERSET_WORKER"

az containerapp create \
  --name "$APP_SUPERSET_WORKER" \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --image "${ACR_LOGIN_SERVER}/${IMAGE_NAME}:latest" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --min-replicas 1 \
  --max-replicas 1 \
  --cpu 0.5 \
  --memory 1.0Gi \
  --secrets \
    "superset-secret-key=${SUPERSET_SECRET_KEY}" \
    "superset-meta-db-url=${SUPERSET_META_DB_URL}" \
  --env-vars \
    "SUPERSET_SECRET_KEY=secretref:superset-secret-key" \
    "SUPERSET_META_DB_URL=secretref:superset-meta-db-url" \
    "SUPERSET_REDIS_URL=${SUPERSET_REDIS_URL}" \
  --command "celery" \
  --args "--app=superset.tasks.celery_app:app" "worker" "--pool=prefork" "-O" "fair" "-c" "2" \
  --output none 2>/dev/null || echo "    (already exists)"

# ─── 8. Connect Vitora data source ─────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Superset deployed!"
echo "============================================================"
echo ""
echo "  Superset URL:  https://${SUPERSET_FQDN}"
echo "  Admin login:   ${SUPERSET_ADMIN_USERNAME} / (your password)"
echo ""
echo "  Next steps:"
echo "  1. Log in to Superset at the URL above"
echo "  2. Add the Vitora database:"
echo "     Settings → Database Connections → + Database"
echo "     SQLAlchemy URI: (your Neon PostgreSQL connection string)"
echo "  3. Set SUPERSET_URL in the Vitora backend env:"
echo "     export SUPERSET_URL=https://${SUPERSET_FQDN}"
echo "     bash backend/scripts/azure-update-env.sh"
echo "  4. Set NEXT_PUBLIC_SUPERSET_URL in Vercel:"
echo "     https://${SUPERSET_FQDN}"
echo "  5. Create dashboards, enable embedding, and publish them"
echo ""
echo "  Saved values (store these securely):"
echo "    SUPERSET_SECRET_KEY=${SUPERSET_SECRET_KEY}"
echo "    SUPERSET_DB_PASSWORD=${SUPERSET_DB_PASSWORD}"
echo "    SUPERSET_META_DB_URL=${SUPERSET_META_DB_URL}"
echo "    SUPERSET_REDIS_URL=${SUPERSET_REDIS_URL}"
echo "============================================================"

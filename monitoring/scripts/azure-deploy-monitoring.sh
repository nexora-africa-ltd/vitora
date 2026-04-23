#!/usr/bin/env bash
# =============================================================================
# Deploy Monitoring Stack to Azure Container Apps
# =============================================================================
# Deploys Prometheus, Grafana, and Umami as Azure Container Apps in the
# existing vitora-env environment.
#
# Prerequisites:
#   - Azure CLI installed and logged in (az login)
#   - Existing resource group (vitora-rg) and environment (vitora-env)
#
# Usage:
#   bash monitoring/scripts/azure-deploy-monitoring.sh
# =============================================================================
set -euo pipefail

RG="vitora-rg"
ENV_NAME="vitora-env"
LOCATION="eastus"

# Passwords — override via env vars before running
# Use tr to strip non-alphanumeric chars so passwords are URL-safe in DATABASE_URL
GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)}"
UMAMI_DB_PASSWORD="${UMAMI_DB_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)}"
UMAMI_APP_SECRET="${UMAMI_APP_SECRET:-$(openssl rand -base64 32)}"

echo "========================================="
echo "  Vitora HMIS — Deploy Monitoring Stack"
echo "========================================="

# ─── 1. Umami PostgreSQL (internal TCP, not HTTP) ──────────────────────────
echo ""
echo "==> Deploying Umami PostgreSQL..."
az containerapp create \
  --name vitora-umami-db \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --image postgres:16-alpine \
  --cpu 0.25 --memory 0.5Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress internal --transport tcp --target-port 5432 \
  --env-vars \
    "POSTGRES_DB=umami" \
    "POSTGRES_USER=umami" \
    "POSTGRES_PASSWORD=$UMAMI_DB_PASSWORD" \
  --output none 2>/dev/null || \
az containerapp update \
  --name vitora-umami-db \
  --resource-group "$RG" \
  --set-env-vars \
    "POSTGRES_DB=umami" \
    "POSTGRES_USER=umami" \
    "POSTGRES_PASSWORD=$UMAMI_DB_PASSWORD" \
  --output none

echo "    Done."

# ─── 2. Umami (external ingress) ──────────────────────────────────────────
echo "==> Deploying Umami..."
az containerapp create \
  --name vitora-umami \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --image ghcr.io/umami-software/umami:postgresql-v2.15.1 \
  --cpu 0.25 --memory 0.5Gi \
  --min-replicas 1 --max-replicas 2 \
  --ingress external --target-port 3000 \
  --env-vars \
    "DATABASE_URL=postgresql://umami:${UMAMI_DB_PASSWORD}@vitora-umami-db:5432/umami" \
    "APP_SECRET=$UMAMI_APP_SECRET" \
    "DISABLE_TELEMETRY=1" \
  --output none 2>/dev/null || \
az containerapp update \
  --name vitora-umami \
  --resource-group "$RG" \
  --set-env-vars \
    "DATABASE_URL=postgresql://umami:${UMAMI_DB_PASSWORD}@vitora-umami-db:5432/umami" \
    "APP_SECRET=$UMAMI_APP_SECRET" \
    "DISABLE_TELEMETRY=1" \
  --output none

UMAMI_FQDN=$(az containerapp show \
  --name vitora-umami \
  --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo "    Umami: https://${UMAMI_FQDN}"

# ─── 3. Grafana (external ingress) ────────────────────────────────────────
echo "==> Deploying Grafana..."
az containerapp create \
  --name vitora-grafana \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --image grafana/grafana:11.6.0 \
  --cpu 0.25 --memory 0.5Gi \
  --min-replicas 1 --max-replicas 1 \
  --ingress external --target-port 3000 \
  --env-vars \
    "GF_SECURITY_ADMIN_USER=admin" \
    "GF_SECURITY_ADMIN_PASSWORD=$GRAFANA_ADMIN_PASSWORD" \
    "GF_SERVER_ROOT_URL=https://vitora-grafana.${ENV_NAME}.${LOCATION}.azurecontainerapps.io" \
  --output none 2>/dev/null || \
az containerapp update \
  --name vitora-grafana \
  --resource-group "$RG" \
  --set-env-vars \
    "GF_SECURITY_ADMIN_USER=admin" \
    "GF_SECURITY_ADMIN_PASSWORD=$GRAFANA_ADMIN_PASSWORD" \
  --output none

GRAFANA_FQDN=$(az containerapp show \
  --name vitora-grafana \
  --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo "    Grafana: https://${GRAFANA_FQDN}"

# ─── Summary ──────────────────────────────────────────────────────────────
echo ""
echo "========================================="
echo "  Monitoring Stack Deployed!"
echo "========================================="
echo ""
echo "  Grafana:  https://${GRAFANA_FQDN}"
echo "    User:     admin"
echo "    Password: ${GRAFANA_ADMIN_PASSWORD}"
echo ""
echo "  Umami:    https://${UMAMI_FQDN}"
echo "    User:     admin"
echo "    Password: umami"
echo ""
echo "  IMPORTANT: After Umami starts, change the default password!"
echo ""
echo "  Next steps:"
echo "    1. In Grafana, add Prometheus data source (or Azure Monitor)"
echo "    2. In Umami, create websites for:"
echo "       - Web App (vitora-navy.vercel.app)"
echo "       - Marketing (vitora.digital)"
echo "    3. Set NEXT_PUBLIC_UMAMI_URL and NEXT_PUBLIC_UMAMI_WEBSITE_ID"
echo "       in Vercel environment variables"
echo ""
echo "  NOTE: For production, consider Azure Monitor Managed Prometheus"
echo "  instead of self-hosted Prometheus. See docs/monitoring.md"
echo "========================================="

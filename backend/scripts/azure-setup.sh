#!/usr/bin/env bash
# =============================================================================
# Azure Container Apps - One-Time Infrastructure Setup
# =============================================================================
# Run this ONCE to create the ACA environment, container registry, and app.
# After this, the GitHub Actions workflow handles deployments.
#
# Prerequisites:
#   - Azure CLI installed: https://aka.ms/install-azure-cli
#   - Logged in: az login
#   - Neon PostgreSQL connection string ready
#
# Usage:
#   export DATABASE_URL="postgres://user:pass@host/db?sslmode=require"
#   export ENCRYPTION_KEY="zPvPKpZGcLmqPJ3L2oXZBCH_gJGWl5C6FZp8YMfFgFA="
#   bash scripts/azure-setup.sh
# =============================================================================
set -euo pipefail

# Configuration — adjust these as needed
RG="vitora-rg"
LOCATION="eastus"
ACR_NAME="vitoraacr"
ENV_NAME="vitora-env"
APP_NAME="vitora-api"
IMAGE_NAME="vitora-api"

echo "==> Creating resource group: $RG"
az group create --name "$RG" --location "$LOCATION" --output none

echo "==> Creating Azure Container Registry: $ACR_NAME"
az acr create \
  --resource-group "$RG" \
  --name "$ACR_NAME" \
  --sku Basic \
  --admin-enabled true \
  --output none

echo "==> Getting ACR credentials..."
ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer -o tsv)
ACR_USERNAME=$(az acr credential show --name "$ACR_NAME" --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" -o tsv)

echo "==> Building and pushing Docker image..."
cd "$(dirname "$0")/.."
az acr build \
  --registry "$ACR_NAME" \
  --image "${IMAGE_NAME}:latest" \
  --file Dockerfile \
  .

echo "==> Creating Container Apps environment: $ENV_NAME"
az containerapp env create \
  --name "$ENV_NAME" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --output none

echo "==> Creating Container App: $APP_NAME"
az containerapp create \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --image "${ACR_LOGIN_SERVER}/${IMAGE_NAME}:latest" \
  --registry-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --target-port 8000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 2 \
  --cpu 0.5 \
  --memory 1.0Gi \
  --secrets \
    "database-url=${DATABASE_URL}" \
    "encryption-key=${ENCRYPTION_KEY}" \
  --env-vars \
    "DJANGO_SETTINGS_MODULE=hmis.settings.staging" \
    "DATABASE_URL=secretref:database-url" \
    "ENCRYPTION_KEY=secretref:encryption-key" \
    "ALLOWED_HOSTS=${APP_NAME}.${LOCATION}.azurecontainerapps.io,localhost" \
    "CORS_ALLOWED_ORIGINS=https://vitora.vercel.app,http://localhost:3009" \
    "CSRF_TRUSTED_ORIGINS=https://vitora.vercel.app" \
    "DEMO_MODE=true" \
    "CELERY_TASK_ALWAYS_EAGER=true" \
    "PORT=8000" \
  --output none

# Get the FQDN
FQDN=$(az containerapp show --name "$APP_NAME" --resource-group "$RG" --query "properties.configuration.ingress.fqdn" -o tsv)

# Temporarily set min-replicas=1 so we can exec into a running container
echo "==> Setting min-replicas=1 for seeding..."
az containerapp update --name "$APP_NAME" --resource-group "$RG" --min-replicas 1 --output none

echo "==> Waiting 90s for container to start and run migrations..."
sleep 90

echo "==> Seeding demo data (this takes ~5 minutes)..."
az containerapp exec --name "$APP_NAME" --resource-group "$RG" --command "bash scripts/seed.sh"

echo "==> Restoring min-replicas=0 (scale-to-zero)..."
az containerapp update --name "$APP_NAME" --resource-group "$RG" --min-replicas 0 --output none

echo ""
echo "============================================="
echo "  Deployment complete!"
echo "============================================="
echo "  Backend URL: https://${FQDN}"
echo "  ACR:         ${ACR_LOGIN_SERVER}"
echo ""
echo "  Next steps:"
echo "  1. Set NEXT_PUBLIC_API_URL=https://${FQDN} in Vercel web-app env vars"
echo "  2. Update ALLOWED_HOSTS if you add a custom domain"
echo "  3. Add GitHub secrets for CI/CD:"
echo "     - AZURE_CREDENTIALS (service principal JSON)"
echo "     - ACR_USERNAME=${ACR_USERNAME}"
echo "     - ACR_PASSWORD=${ACR_PASSWORD}"
echo "  4. To re-seed later:"
echo "     az containerapp update -n $APP_NAME -g $RG --min-replicas 1"
echo "     az containerapp exec -n $APP_NAME -g $RG --command 'bash scripts/seed.sh'"
echo "     az containerapp update -n $APP_NAME -g $RG --min-replicas 0"
echo "============================================="

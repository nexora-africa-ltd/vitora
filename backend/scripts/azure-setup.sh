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
    "django-secret-key=${DJANGO_SECRET_KEY:-$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')}" \
    "sha-client-secret=${SHA_CLIENT_SECRET:-}" \
    "sha-password=${SHA_PASSWORD:-}" \
    "mpesa-consumer-secret=${MPESA_CONSUMER_SECRET:-}" \
    "mpesa-passkey=${MPESA_PASSKEY:-}" \
    "tibabot-api-key=${TIBABOT_API_KEY:-}" \
  --env-vars \
    "DJANGO_SETTINGS_MODULE=hmis.settings.production" \
    "DJANGO_SECRET_KEY=secretref:django-secret-key" \
    "DATABASE_URL=secretref:database-url" \
    "ENCRYPTION_KEY=secretref:encryption-key" \
    "DEBUG=false" \
    "PORT=8000" \
    "ALLOWED_HOSTS=${APP_NAME}.${LOCATION}.azurecontainerapps.io,staging.vitora.digital,vitora-navy.vercel.app,localhost" \
    "SECURE_SSL_REDIRECT=true" \
    "CORS_ALLOWED_ORIGINS=https://vitora-navy.vercel.app,https://staging.vitora.digital,http://localhost:3009" \
    "CSRF_TRUSTED_ORIGINS=https://vitora-navy.vercel.app,https://staging.vitora.digital" \
    "FRONTEND_URL=https://vitora-navy.vercel.app" \
    "DOCUMENT_VERIFICATION_URL=https://vitora-navy.vercel.app/verify" \
    "DEFAULT_FROM_EMAIL=noreply@vitora.digital" \
    "SHA_ENABLED=true" \
    "SHA_API_BASE_URL=https://uat.dha.go.ke" \
    "SHA_CONSUMER_KEY=${SHA_CONSUMER_KEY:-1FL-DHABP05113}" \
    "SHA_CLIENT_SECRET=secretref:sha-client-secret" \
    "SHA_USERNAME=${SHA_USERNAME:-r6i6gOQwxHj4WS1jYeX}" \
    "SHA_PASSWORD=secretref:sha-password" \
    "SHA_AGENT=${SHA_AGENT:-DHABP05113}" \
    "SHA_FHIR_BASE_URL=https://qa-mis.apeiro-digital.com" \
    "SHA_API_TIMEOUT=30" \
    "FACILITY_MFL_CODE=${FACILITY_MFL_CODE:-TEST-001}" \
    "FACILITY_LEVEL=${FACILITY_LEVEL:-L3}" \
    "FACILITY_NAME=${FACILITY_NAME:-Demo Health Facility}" \
    "FACILITY_COUNTY=${FACILITY_COUNTY:-Nairobi}" \
    "FACILITY_KRA_PIN=${FACILITY_KRA_PIN:-P000000000X}" \
    "MPESA_ENVIRONMENT=sandbox" \
    "MPESA_CONSUMER_KEY=${MPESA_CONSUMER_KEY:-}" \
    "MPESA_CONSUMER_SECRET=secretref:mpesa-consumer-secret" \
    "MPESA_SHORTCODE=${MPESA_SHORTCODE:-174379}" \
    "MPESA_PASSKEY=secretref:mpesa-passkey" \
    "MPESA_CALLBACK_URL=https://${APP_NAME}.${LOCATION}.azurecontainerapps.io/api/billing/mpesa/callback/" \
    "CELERY_TASK_ALWAYS_EAGER=true" \
    "ICD11_USE_LOCAL=false" \
    "HAPI_FHIR_ENABLED=true" \
    "HAPI_FHIR_BASE_URL=http://vitora-hapi-fhir.internal.agreeabledune-6cc420cc.eastus.azurecontainerapps.io/fhir" \
    "HAPI_FHIR_TIMEOUT=10" \
    "SYNC_ENABLED=false" \
    "HL7_INTEGRATION_ENABLED=true" \
    "HL7_SENDING_APPLICATION=VITORA_HMIS" \
    "HL7_SENDING_FACILITY=DEMO_FACILITY" \
    "HL7_RECEIVING_APPLICATION=LAB_LIS" \
    "HL7_RECEIVING_FACILITY=STAGING_LIS" \
    "MLLP_HOST=vitora-hl7-mock.internal.agreeabledune-6cc420cc.eastus.azurecontainerapps.io" \
    "MLLP_PORT=2575" \
    "HL7_LIS_CODE_SYSTEM=LIS_DEFAULT" \
    "HIE_AUTO_CR_LOOKUP=true" \
    "HIE_AUTO_CR_REGISTER=true" \
    "HIE_AUTO_SHR_PUSH=false" \
    "HIE_ADX_ENABLED=false" \
    "FHIR_BASE_URL=https://staging.vitora.digital" \
    "KMS_PROVIDER=local" \
    "TIBABOT_ENABLED=true" \
    "TIBABOT_API_URL=https://tibabot.vitora.nexora.africa" \
    "TIBABOT_API_KEY=secretref:tibabot-api-key" \
    "TIBABOT_TIMEOUT=30" \
    "TIBABOT_ENABLE_LAB_ASSIST=true" \
    "TIBABOT_ENABLE_DISCHARGE_READINESS=true" \
    "TIBABOT_ENABLE_CARE_PLAN=true" \
    "TIBABOT_ENABLE_CLERKING_ASSIST=true" \
    "TIBABOT_ENABLE_SURGICAL_ASSISTANT=true" \
    "SETUP_WIZARD_ENABLED=true" \
    "DJANGO_LOG_LEVEL=INFO" \
    "SMS_BACKEND=hmis.apps.core.sms.backends.MockSMSBackend" \
    "SMS_SENDER_ID=VitoraHMIS" \
    "WEBAUTHN_RP_ID=vitora-navy.vercel.app,staging.vitora.digital" \
    "WEBAUTHN_ORIGIN=https://vitora-navy.vercel.app,https://staging.vitora.digital" \
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

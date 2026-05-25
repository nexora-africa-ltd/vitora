#!/usr/bin/env bash
# =============================================================================
# Azure Container Apps — Update Environment Variables & Secrets
# =============================================================================
# Run this to push updated env vars to the EXISTING container app.
# Does NOT recreate infrastructure (ACR, resource group, environment).
#
# Prerequisites:
#   - Azure CLI installed and logged in: az login
#   - Source your .env or export vars before running
#
# Usage:
#   cd backend
#   set -a; source .env; set +a
#   bash scripts/azure-update-env.sh
#
# Or export individual overrides:
#   export DATABASE_URL="postgres://..."
#   export ENCRYPTION_KEY="..."
#   bash scripts/azure-update-env.sh
# =============================================================================
set -euo pipefail

# Must match azure-setup.sh
RG="vitora-rg"
APP_NAME="vitora-api"
LOCATION="eastus"

FQDN=$(az containerapp show \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null || true)

if [[ -z "$FQDN" ]]; then
  echo "ERROR: Container app '$APP_NAME' not found in resource group '$RG'."
  echo "       Run scripts/azure-setup.sh first."
  exit 1
fi

echo "==> Updating container app: $APP_NAME (https://${FQDN})"

# ─── Secrets ────────────────────────────────────────────────────────────────
# az containerapp secret set is idempotent — creates or updates.
# Empty values are skipped to avoid wiping existing secrets.
echo "==> Updating secrets..."

declare -A SECRETS=(
  ["database-url"]="${DATABASE_URL:-}"
  ["encryption-key"]="${ENCRYPTION_KEY:-}"
  ["pii-hmac-key"]="${PII_HMAC_KEY:-}"
  ["django-secret-key"]="${DJANGO_SECRET_KEY:-}"
  ["sha-username"]="${SHA_USERNAME:-}"
  ["sha-password"]="${SHA_PASSWORD:-}"
  ["sha-consumer-key"]="${SHA_CONSUMER_KEY:-}"
  ["sha-client-secret"]="${SHA_CLIENT_SECRET:-}"
  ["sha-encrypted-pin"]="${SHA_ENCRYPTED_PIN:-}"
  ["mpesa-consumer-key"]="${MPESA_CONSUMER_KEY:-}"
  ["mpesa-consumer-secret"]="${MPESA_CONSUMER_SECRET:-}"
  ["mpesa-passkey"]="${MPESA_PASSKEY:-}"
  ["at-api-key"]="${AT_API_KEY:-}"
  ["tibabot-api-key"]="${TIBABOT_API_KEY:-}"
  ["tibabot-jwt-secret"]="${TIBABOT_JWT_SECRET:-}"
  ["tibabot-jwt-private-key"]="${TIBABOT_JWT_PRIVATE_KEY:-}"
  ["tibabot-admin-key"]="${TIBABOT_ADMIN_KEY:-}"
  ["metabase-embedding-secret"]="${METABASE_EMBEDDING_SECRET:-}"
  ["metabase-api-key"]="${METABASE_API_KEY:-}"
  ["superset-admin-password"]="${SUPERSET_ADMIN_PASSWORD:-}"
  ["resend-api-key"]="${RESEND_API_KEY:-}"
  ["vapid-private-key"]="${VAPID_PRIVATE_KEY:-}"
  ["dhis2-username"]="${DHIS2_USERNAME:-}"
  ["dhis2-password"]="${DHIS2_PASSWORD:-}"
)

SECRET_ARGS=()
SKIPPED=()
for name in "${!SECRETS[@]}"; do
  value="${SECRETS[$name]}"
  if [[ -n "$value" ]]; then
    SECRET_ARGS+=("${name}=${value}")
  else
    # Skip empty secrets — do NOT overwrite existing secrets with placeholders.
    # The secret must already exist in Azure (set manually or by a previous run).
    SKIPPED+=("$name")
  fi
done

if [[ ${#SKIPPED[@]} -gt 0 ]]; then
  echo "    ⚠ Skipped (not exported, keeping existing Azure value): ${SKIPPED[*]}"
fi

if [[ ${#SECRET_ARGS[@]} -gt 0 ]]; then
  az containerapp secret set \
    --name "$APP_NAME" \
    --resource-group "$RG" \
    --secrets "${SECRET_ARGS[@]}" \
    --output none
  echo "    Updated ${#SECRET_ARGS[@]} secret(s)"
else
  echo "    No secrets to update (all empty — export them before running)"
fi

# ─── Environment Variables ──────────────────────────────────────────────────
echo "==> Updating environment variables..."

az containerapp update \
  --name "$APP_NAME" \
  --resource-group "$RG" \
  --set-env-vars \
    "DJANGO_SETTINGS_MODULE=${DJANGO_SETTINGS_MODULE:-hmis.settings.staging}" \
    "DJANGO_SECRET_KEY=secretref:django-secret-key" \
    "DATABASE_URL=secretref:database-url" \
    "ENCRYPTION_KEY=secretref:encryption-key" \
    "PII_HMAC_KEY=secretref:pii-hmac-key" \
    "DEBUG=false" \
    "PORT=8000" \
    "ALLOWED_HOSTS=${FQDN},staging.vitora.digital,vitora-navy.vercel.app,localhost" \
    "SECURE_SSL_REDIRECT=true" \
    "CORS_ALLOWED_ORIGINS=https://vitora-navy.vercel.app,https://staging.vitora.digital,http://localhost:3009" \
    "CSRF_TRUSTED_ORIGINS=https://vitora-navy.vercel.app,https://staging.vitora.digital" \
    "FRONTEND_URL=https://vitora-navy.vercel.app" \
    "DOCUMENT_VERIFICATION_URL=https://vitora-navy.vercel.app/verify" \
    "DEFAULT_FROM_EMAIL=noreply@vitora.digital" \
    "SHA_ENABLED=${SHA_ENABLED:-true}" \
    "SHA_API_BASE_URL=${SHA_API_BASE_URL:-https://uat.dha.go.ke}" \
    "SHA_AUTH_MODE=${SHA_AUTH_MODE:-ilm}" \
    "SHA_AUTH_BASE_URL=${SHA_AUTH_BASE_URL:-https://ilm-dev.dha.go.ke/uat-middleware}" \
    "SHA_AUTH_TOKEN_ENDPOINT=${SHA_AUTH_TOKEN_ENDPOINT:-}" \
    "SHA_CONSUMER_KEY=secretref:sha-consumer-key" \
    "SHA_CLIENT_ID=${SHA_CLIENT_ID:-}" \
    "SHA_CLIENT_SECRET=secretref:sha-client-secret" \
    "SHA_ENCRYPTED_PIN=secretref:sha-encrypted-pin" \
    "SHA_USERNAME=secretref:sha-username" \
    "SHA_PASSWORD=secretref:sha-password" \
    "SHA_AGENT=${SHA_AGENT:-DHABP05113}" \
    "SHA_FHIR_BASE_URL=${SHA_FHIR_BASE_URL:-https://qa-mis.apeiro-digital.com}" \
    "SHA_API_TIMEOUT=${SHA_API_TIMEOUT:-30}" \
    "SHA_FACILITY_FR_CODE=${SHA_FACILITY_FR_CODE:-}" \
    "SHA_TIBERBU_BASE_URL=${SHA_TIBERBU_BASE_URL:-https://api-uat.tiberbu.health}" \
    "ILM_BASE_URL=${ILM_BASE_URL:-}" \
    "ILM_REQUEST_TIMEOUT=${ILM_REQUEST_TIMEOUT:-30}" \
    "ILM_MAX_RETRIES=${ILM_MAX_RETRIES:-2}" \
    "ILM_BACKOFF_SECONDS=${ILM_BACKOFF_SECONDS:-0.5}" \
    "FACILITY_MFL_CODE=${FACILITY_MFL_CODE:-TEST-001}" \
    "FACILITY_LEVEL=${FACILITY_LEVEL:-L3}" \
    "FACILITY_NAME=${FACILITY_NAME:-Demo-Health-Facility}" \
    "FACILITY_COUNTY=${FACILITY_COUNTY:-Nairobi}" \
    "FACILITY_KRA_PIN=${FACILITY_KRA_PIN:-P000000000X}" \
    "MPESA_ENVIRONMENT=${MPESA_ENVIRONMENT:-sandbox}" \
    "MPESA_CONSUMER_KEY=secretref:mpesa-consumer-key" \
    "MPESA_CONSUMER_SECRET=secretref:mpesa-consumer-secret" \
    "MPESA_SHORTCODE=${MPESA_SHORTCODE:-174379}" \
    "MPESA_PASSKEY=secretref:mpesa-passkey" \
    "MPESA_CALLBACK_URL=https://${FQDN}/api/billing/mpesa/callback/" \
    "CELERY_TASK_ALWAYS_EAGER=${CELERY_TASK_ALWAYS_EAGER:-true}" \
    "ICD11_USE_LOCAL=${ICD11_USE_LOCAL:-false}" \
    "HAPI_FHIR_ENABLED=${HAPI_FHIR_ENABLED:-true}" \
    "HAPI_FHIR_BASE_URL=${HAPI_FHIR_BASE_URL:-http://vitora-hapi-fhir.internal.agreeabledune-6cc420cc.eastus.azurecontainerapps.io/fhir}" \
    "HAPI_FHIR_TIMEOUT=${HAPI_FHIR_TIMEOUT:-10}" \
    "SYNC_ENABLED=${SYNC_ENABLED:-false}" \
    "HL7_INTEGRATION_ENABLED=${HL7_INTEGRATION_ENABLED:-true}" \
    "HL7_SENDING_APPLICATION=${HL7_SENDING_APPLICATION:-VITORA_HMIS}" \
    "HL7_SENDING_FACILITY=${HL7_SENDING_FACILITY:-DEMO_FACILITY}" \
    "HL7_RECEIVING_APPLICATION=${HL7_RECEIVING_APPLICATION:-LAB_LIS}" \
    "HL7_RECEIVING_FACILITY=${HL7_RECEIVING_FACILITY:-STAGING_LIS}" \
    "MLLP_HOST=${MLLP_HOST:-vitora-hl7-mock.internal.agreeabledune-6cc420cc.eastus.azurecontainerapps.io}" \
    "MLLP_PORT=${MLLP_PORT:-2575}" \
    "HL7_LIS_CODE_SYSTEM=${HL7_LIS_CODE_SYSTEM:-LIS_DEFAULT}" \
    "HIE_AUTO_CR_LOOKUP=${HIE_AUTO_CR_LOOKUP:-true}" \
    "HIE_AUTO_CR_REGISTER=${HIE_AUTO_CR_REGISTER:-true}" \
    "HIE_AUTO_SHR_PUSH=${HIE_AUTO_SHR_PUSH:-false}" \
    "HIE_ADX_ENABLED=${HIE_ADX_ENABLED:-false}" \
    "FHIR_BASE_URL=https://staging.vitora.digital" \
    "KMS_PROVIDER=${KMS_PROVIDER:-local}" \
    "TIBABOT_ENABLED=${TIBABOT_ENABLED:-true}" \
    "TIBABOT_API_URL=${TIBABOT_API_URL:-https://tibabot.vitora.nexora.africa}" \
    "TIBABOT_API_KEY=secretref:tibabot-api-key" \
    "TIBABOT_TIMEOUT=${TIBABOT_TIMEOUT:-30}" \
    "TIBABOT_JWT_SECRET=secretref:tibabot-jwt-secret" \
    "TIBABOT_JWT_PRIVATE_KEY=secretref:tibabot-jwt-private-key" \
    "TIBABOT_JWT_ISSUER=${TIBABOT_JWT_ISSUER:-vitora.nexora.africa}" \
    "TIBABOT_JWT_AUDIENCE=${TIBABOT_JWT_AUDIENCE:-tibabot-api}" \
    "TIBABOT_JWT_EXPIRY_SECONDS=${TIBABOT_JWT_EXPIRY_SECONDS:-300}" \
    "TIBABOT_JWKS_URL=${TIBABOT_JWKS_URL:-}" \
    "TIBABOT_ADMIN_KEY=secretref:tibabot-admin-key" \
    "TIBABOT_ENABLE_LAB_ASSIST=${TIBABOT_ENABLE_LAB_ASSIST:-true}" \
    "TIBABOT_ENABLE_DISCHARGE_READINESS=${TIBABOT_ENABLE_DISCHARGE_READINESS:-true}" \
    "TIBABOT_ENABLE_CARE_PLAN=${TIBABOT_ENABLE_CARE_PLAN:-true}" \
    "TIBABOT_ENABLE_CLERKING_ASSIST=${TIBABOT_ENABLE_CLERKING_ASSIST:-true}" \
    "TIBABOT_ENABLE_SURGICAL_ASSISTANT=${TIBABOT_ENABLE_SURGICAL_ASSISTANT:-true}" \
    "SETUP_WIZARD_ENABLED=${SETUP_WIZARD_ENABLED:-true}" \
    "DJANGO_LOG_LEVEL=${DJANGO_LOG_LEVEL:-INFO}" \
    "SMS_BACKEND=${SMS_BACKEND:-hmis.apps.core.sms.backends.MockSMSBackend}" \
    "SMS_SENDER_ID=${SMS_SENDER_ID:-VitoraHMIS}" \
    "AT_API_KEY=secretref:at-api-key" \
    "AT_USERNAME=${AT_USERNAME:-sandbox}" \
    "WEBAUTHN_RP_ID=${WEBAUTHN_RP_ID:-vitora-navy.vercel.app,staging.vitora.digital}" \
    "WEBAUTHN_ORIGIN=${WEBAUTHN_ORIGIN:-https://vitora-navy.vercel.app,https://staging.vitora.digital}" \
    "METABASE_SITE_URL=${METABASE_SITE_URL:-https://vitora-metabase.agreeabledune-6cc420cc.eastus.azurecontainerapps.io}" \
    "METABASE_API_URL=${METABASE_API_URL:-http://vitora-metabase}" \
    "METABASE_EMBEDDING_SECRET=secretref:metabase-embedding-secret" \
    "METABASE_API_KEY=secretref:metabase-api-key" \
    "SUPERSET_URL=${SUPERSET_URL:-}" \
    "SUPERSET_ADMIN_USERNAME=${SUPERSET_ADMIN_USERNAME:-admin}" \
    "SUPERSET_ADMIN_PASSWORD=secretref:superset-admin-password" \
    "RESEND_API_KEY=secretref:resend-api-key" \
    "POWERSYNC_URL=${POWERSYNC_URL:-https://69d7e1b30e377e689729cf08.powersync.journeyapps.com}" \
    "POWERSYNC_JWT_KID=${POWERSYNC_JWT_KID:-vitora-hmis-1}" \
    "POWERSYNC_JWT_AUDIENCE=${POWERSYNC_JWT_AUDIENCE:-https://69d7e1b30e377e689729cf08.powersync.journeyapps.com}" \
    "VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY:-BK9Ze2ux8-t3w3r83bj7kOEcTuz3IfATjoyg5_TRYBVTAHaqvjRUHqpVHc6T0Ej0nbaDY5ZTVlJ7Mnle6h7ZesU}" \
    "VAPID_PRIVATE_KEY=secretref:vapid-private-key" \
    "VAPID_CLAIM_EMAIL=${VAPID_CLAIM_EMAIL:-mailto:info@nexora.africa}" \
    "LIS_STANDALONE_MODE=${LIS_STANDALONE_MODE:-false}" \
    "PHARMACY_STANDALONE_MODE=${PHARMACY_STANDALONE_MODE:-false}" \
    "IMAGING_STANDALONE_MODE=${IMAGING_STANDALONE_MODE:-false}" \
    "INSURANCE_ENABLED=${INSURANCE_ENABLED:-false}" \
    "DHIS2_BASE_URL=${DHIS2_BASE_URL:-}" \
    "DHIS2_USERNAME=secretref:dhis2-username" \
    "DHIS2_PASSWORD=secretref:dhis2-password" \
    "DHIS2_ORG_UNIT=${DHIS2_ORG_UNIT:-}" \
    "FACILITY_HAS_ICU=${FACILITY_HAS_ICU:-}" \
    "FACILITY_HAS_LABORATORY=${FACILITY_HAS_LABORATORY:-true}" \
    "FACILITY_HAS_IMAGING=${FACILITY_HAS_IMAGING:-}" \
    "FACILITY_HAS_PHARMACY=${FACILITY_HAS_PHARMACY:-true}" \
    "FACILITY_ADDRESS=${FACILITY_ADDRESS:-}" \
    "FACILITY_PHONE=${FACILITY_PHONE:-}" \
    "FACILITY_EMAIL=${FACILITY_EMAIL:-}" \
    "FACILITY_LICENSE=${FACILITY_LICENSE:-}" \
  --output none

echo ""
echo "============================================="
echo "  Environment updated!"
echo "============================================="
echo "  App:  https://${FQDN}"
echo ""
echo "  The container will restart with new env vars."
echo "  Check logs: az containerapp logs show -n $APP_NAME -g $RG --follow"
echo "============================================="

#!/usr/bin/env bash
set -euo pipefail

# File purpose:
#   Provision/update SA staging and production API Container Apps.
#   Imports latest API images into SA ACR and deploys them to target ACA env.
#
# Usage:
#   bash scripts/azure-provision-sa-api-apps.sh
#
# Supported env args (all optional):
#   TARGET_RG, TARGET_ENV, TARGET_ACR_NAME, SOURCE_ACR_NAME,
#   IMAGE_NAME, STAGING_APP_NAME, PROD_APP_NAME

TARGET_RG="${TARGET_RG:-vitora-rg-sa}"
TARGET_ENV="${TARGET_ENV:-vitora-env-sa}"
TARGET_ACR_NAME="${TARGET_ACR_NAME:-vitoraacrsa}"
SOURCE_ACR_NAME="${SOURCE_ACR_NAME:-vitoraacr}"
IMAGE_NAME="${IMAGE_NAME:-vitora-api}"

STAGING_APP_NAME="${STAGING_APP_NAME:-vitora-api-sa}"
PROD_APP_NAME="${PROD_APP_NAME:-vitora-api-prod-sa}"

import_tag() {
  local tag="$1"
  echo "==> Importing ${IMAGE_NAME}:${tag} into ${TARGET_ACR_NAME}"
  az acr import \
    --name "${TARGET_ACR_NAME}" \
    --source "${SOURCE_ACR_NAME}.azurecr.io/${IMAGE_NAME}:${tag}" \
    --image "${IMAGE_NAME}:${tag}" \
    --force >/dev/null
}

create_or_update_app() {
  local app_name="$1"
  local image_tag="$2"
  local deploy_env="$3"

  local image_ref="${TARGET_ACR_NAME}.azurecr.io/${IMAGE_NAME}:${image_tag}"
  local settings_module="hmis.settings.${deploy_env}"

  if az containerapp show --resource-group "${TARGET_RG}" --name "${app_name}" >/dev/null 2>&1; then
    echo "==> Updating existing app: ${app_name}"
    az containerapp update \
      --resource-group "${TARGET_RG}" \
      --name "${app_name}" \
      --image "${image_ref}" \
      --set-env-vars \
        "DJANGO_ENV=${deploy_env}" \
        "DJANGO_SETTINGS_MODULE=${settings_module}" \
        "DEBUG=false" \
        "PORT=8000" >/dev/null
  else
    echo "==> Creating app: ${app_name}"
    az containerapp create \
      --resource-group "${TARGET_RG}" \
      --name "${app_name}" \
      --environment "${TARGET_ENV}" \
      --image "${image_ref}" \
      --target-port 8000 \
      --ingress external \
      --min-replicas 0 \
      --max-replicas 2 \
      --cpu 0.5 \
      --memory 1.0Gi \
      --registry-server "${TARGET_ACR_NAME}.azurecr.io" \
      --env-vars \
        "DJANGO_ENV=${deploy_env}" \
        "DJANGO_SETTINGS_MODULE=${settings_module}" \
        "DEBUG=false" \
        "PORT=8000" >/dev/null
  fi

  local fqdn
  fqdn=$(az containerapp show \
    --resource-group "${TARGET_RG}" \
    --name "${app_name}" \
    --query "properties.configuration.ingress.fqdn" \
    -o tsv)

  echo "    ${app_name}: https://${fqdn}"
}

echo "==> Validating Azure CLI login"
az account show --output none

echo "==> Validating target resource group/env"
az group show --name "${TARGET_RG}" --output none
az containerapp env show --resource-group "${TARGET_RG}" --name "${TARGET_ENV}" --output none

echo "==> Ensuring ACR admin is enabled for ${TARGET_ACR_NAME}"
az acr update --name "${TARGET_ACR_NAME}" --admin-enabled true --output none

import_tag "staging-latest"
import_tag "prod-latest"

create_or_update_app "${STAGING_APP_NAME}" "staging-latest" "staging"
create_or_update_app "${PROD_APP_NAME}" "prod-latest" "production"

echo ""
echo "Done. SA API apps are provisioned in parallel:"
echo "- ${STAGING_APP_NAME}"
echo "- ${PROD_APP_NAME}"
echo ""
echo "Next: sync real secrets/env vars from your deployment pipeline before traffic cutover."

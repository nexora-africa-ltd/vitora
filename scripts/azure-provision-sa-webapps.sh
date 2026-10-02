#!/usr/bin/env bash
set -euo pipefail

# File purpose:
#   Build and deploy the production web app container image to South Africa North ACA.
#   Staging remains deployed on Vercel and is intentionally not provisioned here.
#
# Usage:
#   bash scripts/azure-provision-sa-webapps.sh <web_app_dir>
#
# Args:
#   web_app_dir: path to the web app directory used for docker build context.
#
# Supported env args (all optional):
#   TARGET_RG, TARGET_ENV, TARGET_ACR_NAME, WEB_IMAGE_NAME,
#   PROD_APP_NAME, PROD_API_URL, PROD_POWERSYNC_URL

TARGET_RG="${TARGET_RG:-vitora-rg-sa}"
TARGET_ENV="${TARGET_ENV:-vitora-env-private-sa}"
TARGET_ACR_NAME="${TARGET_ACR_NAME:-vitoraacrsa}"
WEB_IMAGE_NAME="${WEB_IMAGE_NAME:-vitora-webapp}"

PROD_APP_NAME="${PROD_APP_NAME:-vitora-webapp-prod-sa}"

PROD_API_URL="${PROD_API_URL:-https://api.vitora.digital}"
PROD_POWERSYNC_URL="${PROD_POWERSYNC_URL:-}"

build_and_push() {
  local deploy_env="$1"
  local api_url="$2"
  local web_app_dir="$3"

  local image_ref="${TARGET_ACR_NAME}.azurecr.io/${WEB_IMAGE_NAME}:${deploy_env}-latest"
  echo "==> Building ${image_ref}"
  docker build \
    --build-arg "NEXT_PUBLIC_API_URL=${api_url}" \
    --build-arg "NEXT_PUBLIC_APP_NAME=Vitora HMIS" \
    --build-arg "NEXT_PUBLIC_ENV=${deploy_env}" \
    --build-arg "NEXT_PUBLIC_DEMO_MODE=false" \
    --build-arg "NEXT_PUBLIC_ENABLE_BILLING=true" \
    --build-arg "NEXT_PUBLIC_ENABLE_LAB=true" \
    --build-arg "NEXT_PUBLIC_ENABLE_PHARMACY=true" \
    --build-arg "NEXT_PUBLIC_ENABLE_TRIAGE=true" \
    --build-arg "NEXT_PUBLIC_ENABLE_INPATIENT=true" \
    --build-arg "NEXT_PUBLIC_ENABLE_THEATRE=true" \
    --build-arg "NEXT_PUBLIC_ENABLE_AI=true" \
    --build-arg "NEXT_PUBLIC_POWERSYNC_URL=${PROD_POWERSYNC_URL}" \
    -t "${image_ref}" \
    "${web_app_dir}"

  echo "==> Pushing ${image_ref}"
  docker push "${image_ref}"
}

create_or_update_webapp() {
  local app_name="$1"
  local deploy_env="$2"
  local image_ref="${TARGET_ACR_NAME}.azurecr.io/${WEB_IMAGE_NAME}:${deploy_env}-latest"

  if az containerapp show --resource-group "${TARGET_RG}" --name "${app_name}" >/dev/null 2>&1; then
    echo "==> Updating existing app: ${app_name}"
    az containerapp update \
      --resource-group "${TARGET_RG}" \
      --name "${app_name}" \
      --image "${image_ref}" \
      --set-env-vars \
        "NODE_ENV=production" \
        "PORT=3000" >/dev/null
  else
    echo "==> Creating app: ${app_name}"
    az containerapp create \
      --resource-group "${TARGET_RG}" \
      --name "${app_name}" \
      --environment "${TARGET_ENV}" \
      --image "${image_ref}" \
      --target-port 3000 \
      --ingress external \
      --min-replicas 0 \
      --max-replicas 2 \
      --cpu 0.5 \
      --memory 1.0Gi \
      --registry-server "${TARGET_ACR_NAME}.azurecr.io" \
      --env-vars \
        "NODE_ENV=production" \
        "PORT=3000" >/dev/null
  fi

  local fqdn
  fqdn=$(az containerapp show \
    --resource-group "${TARGET_RG}" \
    --name "${app_name}" \
    --query "properties.configuration.ingress.fqdn" \
    -o tsv)
  echo "    ${app_name}: https://${fqdn}"
}

echo "==> Validating Azure resources"
az group show --name "${TARGET_RG}" --output none
az containerapp env show --resource-group "${TARGET_RG}" --name "${TARGET_ENV}" --output none

echo "==> Login to target ACR"
az acr login --name "${TARGET_ACR_NAME}" >/dev/null

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_APP_DIR="${1:-${SCRIPT_DIR}/../web-app}"

build_and_push "production" "${PROD_API_URL}" "${WEB_APP_DIR}"

create_or_update_webapp "${PROD_APP_NAME}" "production"

echo ""
echo "Done. Production SA web app provisioned:"
echo "- ${PROD_APP_NAME}"

#!/usr/bin/env bash
set -euo pipefail

# File purpose:
#   Execute Phase 2 private-access scaffolding for SA migration.
#
# What this script does:
#   1) Creates/ensures VNet, subnets, and PostgreSQL private DNS zone
#   2) Creates PostgreSQL private endpoints for staging/prod DB servers
#   3) Creates a VNet-integrated ACA environment for private cutover apps
#   4) Creates private staging/prod API apps in that environment
#   5) Syncs source app secrets/env to private apps
#   6) Re-points database-url secrets to SA Azure PostgreSQL
#   7) Optionally disables PostgreSQL public access
#
# Usage:
#   bash scripts/azure-phase2-private-access.sh
#
# Supported env args (all optional):
#   RG_NAME, LOCATION,
#   VNET_NAME, ACA_SUBNET_NAME, ACA_SUBNET_CIDR,
#   PE_SUBNET_NAME, PE_SUBNET_CIDR, VNET_CIDR,
#   POSTGRES_PRIVATE_DNS_ZONE, POSTGRES_STAGING_SERVER, POSTGRES_PROD_SERVER,
#   PRIVATE_ENV_NAME, PRIVATE_STAGING_APP, PRIVATE_PROD_APP,
#   TARGET_ACR_NAME, SOURCE_ACR_NAME,
#   LOCK_DOWN_PUBLIC (true/false; default false)

RG_NAME="${RG_NAME:-vitora-rg-sa}"
LOCATION="${LOCATION:-southafricanorth}"

VNET_NAME="${VNET_NAME:-vitora-vnet-sa}"
ACA_SUBNET_NAME="${ACA_SUBNET_NAME:-aca-infra-sa}"
ACA_SUBNET_CIDR="${ACA_SUBNET_CIDR:-10.70.0.0/23}"
PE_SUBNET_NAME="${PE_SUBNET_NAME:-private-endpoints-sa}"
PE_SUBNET_CIDR="${PE_SUBNET_CIDR:-10.70.2.0/24}"
VNET_CIDR="${VNET_CIDR:-10.70.0.0/16}"

POSTGRES_PRIVATE_DNS_ZONE="${POSTGRES_PRIVATE_DNS_ZONE:-privatelink.postgres.database.azure.com}"
POSTGRES_STAGING_SERVER="${POSTGRES_STAGING_SERVER:-vitora-staging-pg2-sa}"
POSTGRES_PROD_SERVER="${POSTGRES_PROD_SERVER:-vitora-prod-pg3-sa}"

PRIVATE_ENV_NAME="${PRIVATE_ENV_NAME:-vitora-env-private-sa}"
PRIVATE_STAGING_APP="${PRIVATE_STAGING_APP:-vitora-api-private-sa}"
PRIVATE_PROD_APP="${PRIVATE_PROD_APP:-vitora-api-prod-private-sa}"

TARGET_ACR_NAME="${TARGET_ACR_NAME:-vitoraacrsa}"
SOURCE_ACR_NAME="${SOURCE_ACR_NAME:-vitoraacr}"

LOCK_DOWN_PUBLIC="${LOCK_DOWN_PUBLIC:-false}"

echo "==> Validating Azure CLI login"
az account show -o none

echo "==> Ensuring VNet + subnets"
az network vnet create \
  -g "${RG_NAME}" \
  -n "${VNET_NAME}" \
  -l "${LOCATION}" \
  --address-prefixes "${VNET_CIDR}" \
  --subnet-name "${ACA_SUBNET_NAME}" \
  --subnet-prefixes "${ACA_SUBNET_CIDR}" \
  -o none

az network vnet subnet create \
  -g "${RG_NAME}" \
  --vnet-name "${VNET_NAME}" \
  -n "${PE_SUBNET_NAME}" \
  --address-prefixes "${PE_SUBNET_CIDR}" \
  -o none

az network vnet subnet update \
  -g "${RG_NAME}" \
  --vnet-name "${VNET_NAME}" \
  -n "${ACA_SUBNET_NAME}" \
  --delegations "Microsoft.App/environments" \
  -o none

echo "==> Ensuring private DNS zone + VNet link"
az network private-dns zone create \
  -g "${RG_NAME}" \
  -n "${POSTGRES_PRIVATE_DNS_ZONE}" \
  -o none

az network private-dns link vnet create \
  -g "${RG_NAME}" \
  -n "${VNET_NAME}-postgres-link" \
  -z "${POSTGRES_PRIVATE_DNS_ZONE}" \
  -v "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/${RG_NAME}/providers/Microsoft.Network/virtualNetworks/${VNET_NAME}" \
  --registration-enabled false \
  -o none || true

create_pe() {
  local server_name="$1"
  local pe_name="${server_name}-pe"
  local conn_name="${server_name}-pe-conn"

  if az network private-endpoint show -g "${RG_NAME}" -n "${pe_name}" -o none 2>/dev/null; then
    echo "    private endpoint exists: ${pe_name}"
  else
    az network private-endpoint create \
      -g "${RG_NAME}" \
      -n "${pe_name}" \
      -l "${LOCATION}" \
      --vnet-name "${VNET_NAME}" \
      --subnet "${PE_SUBNET_NAME}" \
      --private-connection-resource-id "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/${RG_NAME}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${server_name}" \
      --group-id "postgresqlServer" \
      --connection-name "${conn_name}" \
      -o none
  fi

  az network private-endpoint dns-zone-group create \
    -g "${RG_NAME}" \
    --endpoint-name "${pe_name}" \
    -n "postgres-zone-group" \
    --private-dns-zone "${POSTGRES_PRIVATE_DNS_ZONE}" \
    --zone-name "postgresql" \
    -o none || true
}

echo "==> Ensuring PostgreSQL private endpoints"
create_pe "${POSTGRES_STAGING_SERVER}"
create_pe "${POSTGRES_PROD_SERVER}"

echo "==> Ensuring VNet-integrated ACA environment"
if az containerapp env show -g "${RG_NAME}" -n "${PRIVATE_ENV_NAME}" -o none 2>/dev/null; then
  echo "    already exists: ${PRIVATE_ENV_NAME}"
else
  LOG_WORKSPACE_NAME="$(az monitor log-analytics workspace list -g "${RG_NAME}" --query "[0].name" -o tsv)"
  LOG_WORKSPACE_ID="$(az monitor log-analytics workspace list -g "${RG_NAME}" --query "[0].customerId" -o tsv)"
  LOG_WORKSPACE_KEY="$(az monitor log-analytics workspace get-shared-keys -g "${RG_NAME}" -n "${LOG_WORKSPACE_NAME}" --query primarySharedKey -o tsv)"

  az containerapp env create \
    -g "${RG_NAME}" \
    -n "${PRIVATE_ENV_NAME}" \
    -l "${LOCATION}" \
    --infrastructure-subnet-resource-id "/subscriptions/$(az account show --query id -o tsv)/resourceGroups/${RG_NAME}/providers/Microsoft.Network/virtualNetworks/${VNET_NAME}/subnets/${ACA_SUBNET_NAME}" \
    --logs-workspace-id "${LOG_WORKSPACE_ID}" \
    --logs-workspace-key "${LOG_WORKSPACE_KEY}" \
    -o none
fi

echo "==> Ensuring private API apps"
TARGET_RG="${RG_NAME}" \
TARGET_ENV="${PRIVATE_ENV_NAME}" \
TARGET_ACR_NAME="${TARGET_ACR_NAME}" \
SOURCE_ACR_NAME="${SOURCE_ACR_NAME}" \
STAGING_APP_NAME="${PRIVATE_STAGING_APP}" \
PROD_APP_NAME="${PRIVATE_PROD_APP}" \
bash scripts/azure-provision-sa-api-apps.sh

echo "==> Syncing source app secrets/env"
APP_MAPPINGS_JSON="[
  {\"source_rg\":\"vitora-rg\",\"source_app\":\"vitora-api\",\"target_rg\":\"${RG_NAME}\",\"target_app\":\"${PRIVATE_STAGING_APP}\"},
  {\"source_rg\":\"vitora-rg\",\"source_app\":\"vitora-api-prod\",\"target_rg\":\"${RG_NAME}\",\"target_app\":\"${PRIVATE_PROD_APP}\"}
]" \
python3 scripts/azure-sync-api-config.py

echo "==> Re-pointing DATABASE_URL to SA Azure PostgreSQL"
STAGING_DB_URL="$(az containerapp secret list -g "${RG_NAME}" -n "vitora-api-sa" --show-values --query "[?name=='database-url'].value | [0]" -o tsv)"
PROD_DB_URL="$(az containerapp secret list -g "${RG_NAME}" -n "vitora-api-prod-sa" --show-values --query "[?name=='database-url'].value | [0]" -o tsv)"

az containerapp secret set -g "${RG_NAME}" -n "${PRIVATE_STAGING_APP}" --secrets "database-url=${STAGING_DB_URL}" -o none
az containerapp secret set -g "${RG_NAME}" -n "${PRIVATE_PROD_APP}" --secrets "database-url=${PROD_DB_URL}" -o none

STAGING_REV="$(az containerapp show -g "${RG_NAME}" -n "${PRIVATE_STAGING_APP}" --query properties.latestRevisionName -o tsv)"
PROD_REV="$(az containerapp show -g "${RG_NAME}" -n "${PRIVATE_PROD_APP}" --query properties.latestRevisionName -o tsv)"
az containerapp revision restart -g "${RG_NAME}" -n "${PRIVATE_STAGING_APP}" --revision "${STAGING_REV}" -o none
az containerapp revision restart -g "${RG_NAME}" -n "${PRIVATE_PROD_APP}" --revision "${PROD_REV}" -o none

if [[ "${LOCK_DOWN_PUBLIC}" == "true" ]]; then
  echo "==> Disabling PostgreSQL public access"
  az postgres flexible-server update -g "${RG_NAME}" -n "${POSTGRES_STAGING_SERVER}" --public-access none -o none
  az postgres flexible-server update -g "${RG_NAME}" -n "${POSTGRES_PROD_SERVER}" --public-access none -o none
fi

echo ""
echo "Phase 2 private-access scaffolding complete."
echo "Private env: ${PRIVATE_ENV_NAME}"
echo "Private apps: ${PRIVATE_STAGING_APP}, ${PRIVATE_PROD_APP}"
echo "Lock down public DB access: ${LOCK_DOWN_PUBLIC}"

#!/usr/bin/env bash
set -euo pipefail

# File purpose:
#   Provision South Africa North foundation resources in parallel with East US.
#   Creates/ensures the SA resource group, ACR, ACA environment, and storage.
#
# Usage:
#   bash scripts/azure-provision-sa.sh
#
# Supported env args (all optional):
#   RG_NAME, LOCATION, ACR_NAME, ACA_ENV_NAME,
#   RELEASES_STORAGE, BACKUPS_STORAGE, MONITORING_STORAGE,
#   RELEASES_CONTAINER, BACKUPS_CONTAINER

RG_NAME="${RG_NAME:-vitora-rg-sa}"
LOCATION="${LOCATION:-southafricanorth}"
ACR_NAME="${ACR_NAME:-vitoraacrsa}"
ACA_ENV_NAME="${ACA_ENV_NAME:-vitora-env-sa}"

# Storage account names cannot contain hyphens and must be globally unique.
RELEASES_STORAGE="${RELEASES_STORAGE:-vitorareleasessa}"
BACKUPS_STORAGE="${BACKUPS_STORAGE:-vitorabackupssa}"
MONITORING_STORAGE="${MONITORING_STORAGE:-vitoramonitoringsa}"

RELEASES_CONTAINER="${RELEASES_CONTAINER:-releases}"
BACKUPS_CONTAINER="${BACKUPS_CONTAINER:-db-backups}"

echo "==> Validating Azure CLI login"
az account show --output table >/dev/null

echo "==> Provisioning resource group: ${RG_NAME} (${LOCATION})"
az group create \
  --name "${RG_NAME}" \
  --location "${LOCATION}" \
  --output none

echo "==> Ensuring Container Registry: ${ACR_NAME}"
if az acr show --name "${ACR_NAME}" --resource-group "${RG_NAME}" >/dev/null 2>&1; then
  echo "    already exists"
else
  az acr create \
    --name "${ACR_NAME}" \
    --resource-group "${RG_NAME}" \
    --location "${LOCATION}" \
    --sku Basic \
    --admin-enabled true \
    --output none
fi

echo "==> Ensuring Container Apps environment: ${ACA_ENV_NAME}"
if az containerapp env show --name "${ACA_ENV_NAME}" --resource-group "${RG_NAME}" >/dev/null 2>&1; then
  echo "    already exists"
else
  az containerapp env create \
    --name "${ACA_ENV_NAME}" \
    --resource-group "${RG_NAME}" \
    --location "${LOCATION}" \
    --output none
fi

create_storage_account() {
  local account_name="$1"
  echo "==> Ensuring storage account: ${account_name}"
  if az storage account show --name "${account_name}" --resource-group "${RG_NAME}" >/dev/null 2>&1; then
    echo "    already exists"
  else
    az storage account create \
      --name "${account_name}" \
      --resource-group "${RG_NAME}" \
      --location "${LOCATION}" \
      --sku Standard_LRS \
      --kind StorageV2 \
      --min-tls-version TLS1_2 \
      --allow-blob-public-access true \
      --output none
  fi
}

create_blob_container() {
  local account_name="$1"
  local container_name="$2"
  echo "==> Ensuring blob container: ${container_name} in ${account_name}"

  local conn
  conn=$(az storage account show-connection-string \
    --name "${account_name}" \
    --resource-group "${RG_NAME}" \
    --query connectionString \
    -o tsv)

  if az storage container show --name "${container_name}" --connection-string "${conn}" >/dev/null 2>&1; then
    echo "    already exists"
  else
    az storage container create \
      --name "${container_name}" \
      --connection-string "${conn}" \
      --public-access off \
      --output none
  fi
}

create_storage_account "${RELEASES_STORAGE}"
create_storage_account "${BACKUPS_STORAGE}"
create_storage_account "${MONITORING_STORAGE}"

create_blob_container "${RELEASES_STORAGE}" "${RELEASES_CONTAINER}"
create_blob_container "${BACKUPS_STORAGE}" "${BACKUPS_CONTAINER}"

echo ""
echo "Provisioning complete."
echo "Resource Group:    ${RG_NAME}"
echo "Location:          ${LOCATION}"
echo "ACR:               ${ACR_NAME}.azurecr.io"
echo "ACA Environment:   ${ACA_ENV_NAME}"
echo "Storage (releases):   ${RELEASES_STORAGE}"
echo "Storage (backups):    ${BACKUPS_STORAGE}"
echo "Storage (monitoring): ${MONITORING_STORAGE}"

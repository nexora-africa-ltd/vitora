#!/usr/bin/env bash
# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
# =============================================================================
# Provision Vitora's dedicated production database backup Container Apps Job.
# Run: bash scripts/azure-provision-backup-job.sh
# Optional inputs: BACKUP_JOB_NAME, ACA_RG, ACA_ENV, BACKUP_IMAGE,
#                  REGISTRY_NAME, STORAGE_ACCOUNT, STORAGE_CONTAINER.
# =============================================================================
set -euo pipefail

RG="${ACA_RG:-vitora-rg-sa}"
ENVIRONMENT="${ACA_ENV:-vitora-env-private-sa}"
JOB_NAME="${BACKUP_JOB_NAME:-vitora-db-backup-prod-sa}"
REGISTRY_NAME="${REGISTRY_NAME:-vitoraacrsa}"
REGISTRY_SERVER="${REGISTRY_NAME}.azurecr.io"
IMAGE="${BACKUP_IMAGE:-${REGISTRY_SERVER}/vitora-api-private-sa:latest}"
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-vitorabackupssa}"
STORAGE_CONTAINER="${STORAGE_CONTAINER:-db-backups}"
SOURCE_APP="${SOURCE_APP:-vitora-api-prod-private-sa}"
STORAGE_SCOPE="$(az storage account show --name "$STORAGE_ACCOUNT" --resource-group "$RG" --query id --output tsv)"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"

if [[ -z "$BACKUP_ENCRYPTION_KEY" ]]; then
  echo "ERROR: BACKUP_ENCRYPTION_KEY must be set to provision encrypted backups." >&2
  exit 1
fi

if az containerapp job show --name "$JOB_NAME" --resource-group "$RG" >/dev/null 2>&1; then
  echo "Backup job '$JOB_NAME' already exists; retaining its secret configuration."
else
  DATABASE_URL="$(az containerapp secret list \
    --name "$SOURCE_APP" \
    --resource-group "$RG" \
    --show-values \
    --query "[?name=='database-url'].value | [0]" \
    --output tsv)"
  if [[ -z "$DATABASE_URL" ]]; then
    echo "ERROR: The source app has no database-url secret." >&2
    exit 1
  fi

  REGISTRY_USERNAME="$(az acr credential show --name "$REGISTRY_NAME" --query username --output tsv)"
  REGISTRY_PASSWORD="$(az acr credential show --name "$REGISTRY_NAME" --query 'passwords[0].value' --output tsv)"

  az containerapp job create \
    --name "$JOB_NAME" \
    --resource-group "$RG" \
    --environment "$ENVIRONMENT" \
    --trigger-type Manual \
    --replica-timeout 3600 \
    --replica-retry-limit 0 \
    --replica-completion-count 1 \
    --parallelism 1 \
    --mi-system-assigned \
    --image "$IMAGE" \
    --cpu 1.0 \
    --memory 2Gi \
    --registry-server "$REGISTRY_SERVER" \
    --registry-username "$REGISTRY_USERNAME" \
    --registry-password "$REGISTRY_PASSWORD" \
    --secrets "database-url=$DATABASE_URL" "backup-encryption-key=$BACKUP_ENCRYPTION_KEY" \
    --env-vars \
      "DATABASE_URL=secretref:database-url" \
      "BACKUP_ENCRYPTION_KEY=secretref:backup-encryption-key" \
      "AZURE_STORAGE_ACCOUNT=$STORAGE_ACCOUNT" \
      "AZURE_STORAGE_CONTAINER=$STORAGE_CONTAINER" \
      "VITORA_ENV=production" \
      "PGAPPNAME=vitora-production-backup-job" \
    --command bash /app/scripts/backup-db.sh \
    --output none
fi

# Ensure both fresh and pre-existing jobs receive the mandatory encryption secret.
az containerapp job secret set \
  --name "$JOB_NAME" \
  --resource-group "$RG" \
  --secrets "backup-encryption-key=$BACKUP_ENCRYPTION_KEY" \
  --output none
az containerapp job update \
  --name "$JOB_NAME" \
  --resource-group "$RG" \
  --set-env-vars "BACKUP_ENCRYPTION_KEY=secretref:backup-encryption-key" \
  --output none

az containerapp job identity assign \
  --name "$JOB_NAME" \
  --resource-group "$RG" \
  --system-assigned \
  --output none
PRINCIPAL_ID="$(az containerapp job show --name "$JOB_NAME" --resource-group "$RG" --query identity.principalId --output tsv)"

if ! az role assignment list \
  --assignee-object-id "$PRINCIPAL_ID" \
  --scope "$STORAGE_SCOPE" \
  --query "[?roleDefinitionName=='Storage Blob Data Contributor'] | length(@)" \
  --output tsv | grep -qx '1'; then
  az role assignment create \
    --assignee-object-id "$PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal \
    --role "Storage Blob Data Contributor" \
    --scope "$STORAGE_SCOPE" \
    --output none
fi

echo "Configured backup job '$JOB_NAME' in '$ENVIRONMENT'."

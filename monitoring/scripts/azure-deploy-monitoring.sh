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
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-vitoramonitoring}"

# Passwords — override via env vars before running.
# IMPORTANT: For re-deploys, ALWAYS pass the same passwords that were used
# initially.  If you lose them, reset via the Umami/Grafana UI instead of
# generating new ones (the DB will still expect the old values).
GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)}"
UMAMI_DB_PASSWORD="${UMAMI_DB_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)}"
UMAMI_APP_SECRET="${UMAMI_APP_SECRET:-$(openssl rand -base64 32)}"

echo "========================================="
echo "  Vitora HMIS — Deploy Monitoring Stack"
echo "========================================="

# ─── 0. Persistent Storage (Azure Files) ──────────────────────────────────
# Umami PostgreSQL needs persistent storage so data survives container
# restarts and redeployments.
echo ""
echo "==> Setting up persistent storage..."

# Create storage account if it doesn't exist
az storage account show --name "$STORAGE_ACCOUNT" --resource-group "$RG" &>/dev/null || \
az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --output none

STORAGE_KEY=$(az storage account keys list \
  --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RG" \
  --query "[0].value" -o tsv)

# Create file share for Umami DB
az storage share-rm create \
  --storage-account "$STORAGE_ACCOUNT" \
  --name umami-db-data \
  --quota 5 \
  --output none 2>/dev/null || true

# Create file share for Grafana
az storage share-rm create \
  --storage-account "$STORAGE_ACCOUNT" \
  --name grafana-data \
  --quota 2 \
  --output none 2>/dev/null || true

# Link storage to Container Apps environment
az containerapp env storage set \
  --name "$ENV_NAME" \
  --resource-group "$RG" \
  --storage-name umamidbstorage \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name umami-db-data \
  --access-mode ReadWrite \
  --output none 2>/dev/null || true

az containerapp env storage set \
  --name "$ENV_NAME" \
  --resource-group "$RG" \
  --storage-name grafanastorage \
  --azure-file-account-name "$STORAGE_ACCOUNT" \
  --azure-file-account-key "$STORAGE_KEY" \
  --azure-file-share-name grafana-data \
  --access-mode ReadWrite \
  --output none 2>/dev/null || true

echo "    Storage configured."

# ─── 1. Umami PostgreSQL (internal TCP, not HTTP) ──────────────────────────
echo ""
echo "==> Deploying Umami PostgreSQL..."

# Template for volume mount — Azure Container Apps needs a YAML template
# to mount volumes (not supported via --env-vars alone).
UMAMI_DB_TEMPLATE=$(mktemp)
cat > "$UMAMI_DB_TEMPLATE" << YAML
properties:
  template:
    containers:
      - name: vitora-umami-db
        image: postgres:16-alpine
        resources:
          cpu: 0.25
          memory: 0.5Gi
        env:
          - name: POSTGRES_DB
            value: umami
          - name: POSTGRES_USER
            value: umami
          - name: POSTGRES_PASSWORD
            secretRef: postgres-password
          - name: PGDATA
            value: /var/lib/postgresql/data/pgdata
        volumeMounts:
          - volumeName: umamidbvol
            mountPath: /var/lib/postgresql/data
    scale:
      minReplicas: 1
      maxReplicas: 1
    volumes:
      - name: umamidbvol
        storageName: umamidbstorage
        storageType: AzureFile
  configuration:
    secrets:
      - name: postgres-password
        value: "$UMAMI_DB_PASSWORD"
    ingress:
      external: false
      transport: tcp
      targetPort: 5432
YAML

az containerapp show --name vitora-umami-db --resource-group "$RG" &>/dev/null 2>&1 && \
  az containerapp update \
    --name vitora-umami-db \
    --resource-group "$RG" \
    --yaml "$UMAMI_DB_TEMPLATE" \
    --output none || \
  az containerapp create \
    --name vitora-umami-db \
    --resource-group "$RG" \
    --environment "$ENV_NAME" \
    --yaml "$UMAMI_DB_TEMPLATE" \
    --output none

rm -f "$UMAMI_DB_TEMPLATE"
echo "    Done (persistent volume: umamidbstorage → /var/lib/postgresql/data)."

# ─── 2. Umami (external ingress) ──────────────────────────────────────────
echo "==> Deploying Umami..."

# Set secrets first, then reference them in env vars
az containerapp secret set \
  --name vitora-umami \
  --resource-group "$RG" \
  --secrets \
    "db-url=postgresql://umami:${UMAMI_DB_PASSWORD}@vitora-umami-db:5432/umami" \
    "app-secret=$UMAMI_APP_SECRET" \
  --output none 2>/dev/null || true

az containerapp create \
  --name vitora-umami \
  --resource-group "$RG" \
  --environment "$ENV_NAME" \
  --image ghcr.io/umami-software/umami:postgresql-v2.15.1 \
  --cpu 0.25 --memory 0.5Gi \
  --min-replicas 1 --max-replicas 2 \
  --ingress external --target-port 3000 \
  --secrets \
    "db-url=postgresql://umami:${UMAMI_DB_PASSWORD}@vitora-umami-db:5432/umami" \
    "app-secret=$UMAMI_APP_SECRET" \
  --env-vars \
    "DATABASE_URL=secretref:db-url" \
    "APP_SECRET=secretref:app-secret" \
    "DISABLE_TELEMETRY=1" \
  --output none 2>/dev/null || \
az containerapp update \
  --name vitora-umami \
  --resource-group "$RG" \
  --set-env-vars \
    "DATABASE_URL=secretref:db-url" \
    "APP_SECRET=secretref:app-secret" \
    "DISABLE_TELEMETRY=1" \
  --output none

UMAMI_FQDN=$(az containerapp show \
  --name vitora-umami \
  --resource-group "$RG" \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo "    Umami: https://${UMAMI_FQDN}"

# ─── 3. Grafana (external ingress) ────────────────────────────────────────
echo "==> Deploying Grafana..."

GRAFANA_TEMPLATE=$(mktemp)
cat > "$GRAFANA_TEMPLATE" << YAML
properties:
  template:
    containers:
      - name: vitora-grafana
        image: grafana/grafana:11.6.0
        resources:
          cpu: 0.25
          memory: 0.5Gi
        env:
          - name: GF_SECURITY_ADMIN_USER
            value: admin
          - name: GF_SECURITY_ADMIN_PASSWORD
            secretRef: admin-password
          - name: GF_SERVER_ROOT_URL
            value: "https://vitora-grafana.${ENV_NAME}.${LOCATION}.azurecontainerapps.io"
        volumeMounts:
          - volumeName: grafanavol
            mountPath: /var/lib/grafana
    scale:
      minReplicas: 1
      maxReplicas: 1
    volumes:
      - name: grafanavol
        storageName: grafanastorage
        storageType: AzureFile
  configuration:
    secrets:
      - name: admin-password
        value: "$GRAFANA_ADMIN_PASSWORD"
    ingress:
      external: true
      targetPort: 3000
YAML

az containerapp show --name vitora-grafana --resource-group "$RG" &>/dev/null 2>&1 && \
  az containerapp update \
    --name vitora-grafana \
    --resource-group "$RG" \
    --yaml "$GRAFANA_TEMPLATE" \
    --output none || \
  az containerapp create \
    --name vitora-grafana \
    --resource-group "$RG" \
    --environment "$ENV_NAME" \
    --yaml "$GRAFANA_TEMPLATE" \
    --output none

rm -f "$GRAFANA_TEMPLATE"

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
echo "  Persistent storage:"
echo "    Umami DB → Azure Files: ${STORAGE_ACCOUNT}/umami-db-data"
echo "    Grafana  → Azure Files: ${STORAGE_ACCOUNT}/grafana-data"
echo ""
echo "  Re-deploy note:"
echo "    Pass the same UMAMI_DB_PASSWORD and GRAFANA_ADMIN_PASSWORD"
echo "    from the initial deploy.  New random passwords will NOT"
echo "    match the existing database."
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

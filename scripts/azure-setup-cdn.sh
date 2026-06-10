#!/usr/bin/env bash
# =============================================================================
# Azure CDN + Storage — Setup for Hub & Desktop Release Distribution
# =============================================================================
# Creates (or verifies) the Azure Storage account, 'releases' container with
# public blob access, Azure Front Door CDN profile, and custom domain mapping:
#
#   https://get.vitora.digital  →  Azure Blob 'releases' container
#
# This script is idempotent — safe to re-run. It will skip resources that
# already exist.
#
# Prerequisites:
#   - Azure CLI installed: https://aka.ms/install-azure-cli
#   - Logged in: az login
#   - DNS: CNAME record for get.vitora.digital → <endpoint>.z01.azurefd.net
#
# Usage:
#   bash scripts/azure-setup-cdn.sh
#
# After running:
#   1. Add CNAME DNS record: get.vitora.digital → <endpoint>.z01.azurefd.net
#   2. Wait for DNS propagation (5-15 min)
#   3. Run with --enable-custom-domain to complete HTTPS provisioning
#   4. Copy the AZURE_STORAGE_CONNECTION_STRING to GitHub Secrets
# =============================================================================
set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────
RG="vitora-rg"
LOCATION="eastus"
STORAGE_ACCOUNT="vitorareleases"
CONTAINER_NAME="releases"
CDN_PROFILE="vitora-cdn"
CDN_ENDPOINT="vitora-releases"
CUSTOM_DOMAIN="get.vitora.digital"

ENABLE_CUSTOM_DOMAIN=false
if [[ "${1:-}" == "--enable-custom-domain" ]]; then
  ENABLE_CUSTOM_DOMAIN=true
fi

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║       Vitora CDN Infrastructure Setup                       ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Resource Group:   $RG"
echo "║  Storage Account:  $STORAGE_ACCOUNT"
echo "║  Container:        $CONTAINER_NAME"
echo "║  CDN Profile:      $CDN_PROFILE"
echo "║  CDN Endpoint:     $CDN_ENDPOINT"
echo "║  Custom Domain:    $CUSTOM_DOMAIN"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Resource Group ─────────────────────────────────────────────────
echo "==> [1/6] Ensuring resource group: $RG"
if az group show --name "$RG" &>/dev/null; then
  echo "    ✓ Already exists"
else
  az group create --name "$RG" --location "$LOCATION" --output none
  echo "    ✓ Created"
fi

# ─── Step 2: Storage Account ────────────────────────────────────────────────
echo "==> [2/6] Ensuring storage account: $STORAGE_ACCOUNT"
if az storage account show --name "$STORAGE_ACCOUNT" --resource-group "$RG" &>/dev/null; then
  echo "    ✓ Already exists"
else
  az storage account create \
    --name "$STORAGE_ACCOUNT" \
    --resource-group "$RG" \
    --location "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --min-tls-version TLS1_2 \
    --allow-blob-public-access true \
    --output none
  echo "    ✓ Created"
fi

# Get connection string for later use
CONN_STR=$(az storage account show-connection-string \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RG" \
  --query connectionString -o tsv)

# ─── Step 3: Blob Container ─────────────────────────────────────────────────
echo "==> [3/6] Ensuring blob container: $CONTAINER_NAME (public read)"
if az storage container show --name "$CONTAINER_NAME" --connection-string "$CONN_STR" &>/dev/null; then
  echo "    ✓ Already exists"
else
  az storage container create \
    --name "$CONTAINER_NAME" \
    --connection-string "$CONN_STR" \
    --public-access blob \
    --output none
  echo "    ✓ Created with public blob access"
fi

# Enable static website (for index document support)
az storage blob service-properties update \
  --account-name "$STORAGE_ACCOUNT" \
  --static-website \
  --index-document index.html \
  --404-document 404.html \
  --output none 2>/dev/null || true

# ─── Step 4: Front Door Profile ──────────────────────────────────────────────
echo "==> [4/6] Ensuring Front Door profile: $CDN_PROFILE"
if az cdn profile show --name "$CDN_PROFILE" --resource-group "$RG" &>/dev/null; then
  echo "    ✓ Already exists"
else
  az afd profile create \
    --profile-name "$CDN_PROFILE" \
    --resource-group "$RG" \
    --sku Standard_AzureFrontDoor \
    --output none
  echo "    ✓ Created (Standard_AzureFrontDoor SKU)"
fi

# ─── Step 5: AFD Endpoint + Origin ──────────────────────────────────────────
echo "==> [5/6] Ensuring AFD endpoint: $CDN_ENDPOINT"
ORIGIN_HOST="${STORAGE_ACCOUNT}.blob.core.windows.net"

if az afd endpoint show --endpoint-name "$CDN_ENDPOINT" --profile-name "$CDN_PROFILE" --resource-group "$RG" &>/dev/null; then
  ENDPOINT_HOST=$(az afd endpoint show \
    --endpoint-name "$CDN_ENDPOINT" \
    --profile-name "$CDN_PROFILE" \
    --resource-group "$RG" \
    --query hostName -o tsv)
  echo "    ✓ Already exists"
else
  az afd endpoint create \
    --endpoint-name "$CDN_ENDPOINT" \
    --profile-name "$CDN_PROFILE" \
    --resource-group "$RG" \
    --enabled-state Enabled \
    --output none

  # Create origin group
  az afd origin-group create \
    --origin-group-name "releases-origin-group" \
    --profile-name "$CDN_PROFILE" \
    --resource-group "$RG" \
    --probe-request-type HEAD \
    --probe-protocol Https \
    --probe-interval-in-seconds 100 \
    --sample-size 4 \
    --successful-samples-required 3 \
    --additional-latency-in-milliseconds 50 \
    --output none

  # Create origin
  az afd origin create \
    --origin-name "blob-origin" \
    --origin-group-name "releases-origin-group" \
    --profile-name "$CDN_PROFILE" \
    --resource-group "$RG" \
    --host-name "$ORIGIN_HOST" \
    --origin-host-header "$ORIGIN_HOST" \
    --http-port 80 \
    --https-port 443 \
    --priority 1 \
    --weight 1000 \
    --enabled-state Enabled \
    --output none

  # Create route
  az afd route create \
    --route-name "releases-route" \
    --endpoint-name "$CDN_ENDPOINT" \
    --profile-name "$CDN_PROFILE" \
    --resource-group "$RG" \
    --origin-group "releases-origin-group" \
    --origin-path "/$CONTAINER_NAME" \
    --supported-protocols Https Http \
    --https-redirect Enabled \
    --forwarding-protocol HttpsOnly \
    --link-to-default-domain Enabled \
    --output none

  ENDPOINT_HOST=$(az afd endpoint show \
    --endpoint-name "$CDN_ENDPOINT" \
    --profile-name "$CDN_PROFILE" \
    --resource-group "$RG" \
    --query hostName -o tsv)
  echo "    ✓ Created with origin and route"
fi
echo "    → AFD hostname: $ENDPOINT_HOST"

# ─── Step 6: Custom Domain ──────────────────────────────────────────────────
echo "==> [6/6] Custom domain: $CUSTOM_DOMAIN"
DOMAIN_NAME=$(echo "$CUSTOM_DOMAIN" | tr '.' '-')

if [[ "$ENABLE_CUSTOM_DOMAIN" == "true" ]]; then
  # Check if custom domain already exists
  if az afd custom-domain show \
    --custom-domain-name "$DOMAIN_NAME" \
    --profile-name "$CDN_PROFILE" \
    --resource-group "$RG" &>/dev/null; then
    echo "    ✓ Custom domain already configured"
    VALIDATION_STATE=$(az afd custom-domain show \
      --custom-domain-name "$DOMAIN_NAME" \
      --profile-name "$CDN_PROFILE" \
      --resource-group "$RG" \
      --query domainValidationState -o tsv)
    echo "    → Validation state: $VALIDATION_STATE"
  else
    # Create the custom domain (AFD managed certificate)
    echo "    Creating custom domain with managed HTTPS..."
    az afd custom-domain create \
      --custom-domain-name "$DOMAIN_NAME" \
      --profile-name "$CDN_PROFILE" \
      --resource-group "$RG" \
      --host-name "$CUSTOM_DOMAIN" \
      --certificate-type ManagedCertificate \
      --minimum-tls-version TLS12 \
      --output none
    echo "    ✓ Custom domain created"

    # Show DNS validation info
    echo ""
    VALIDATION_PROPS=$(az afd custom-domain show \
      --custom-domain-name "$DOMAIN_NAME" \
      --profile-name "$CDN_PROFILE" \
      --resource-group "$RG" \
      --query "validationProperties" -o json 2>/dev/null || echo "{}")
    echo "    DNS validation token (if CNAME validation needed):"
    echo "    $VALIDATION_PROPS"

    # Associate custom domain with endpoint route
    echo "    Associating with route..."
    az afd route update \
      --route-name "releases-route" \
      --endpoint-name "$CDN_ENDPOINT" \
      --profile-name "$CDN_PROFILE" \
      --resource-group "$RG" \
      --custom-domains "$DOMAIN_NAME" \
      --output none 2>/dev/null || echo "    (route association may need manual step)"
    echo "    ✓ Associated with releases-route"
  fi
else
  echo "    → Skipped (pass --enable-custom-domain after DNS is configured)"
  echo ""
  echo "    DNS setup required:"
  echo "    ┌────────────────────────────────────────────────────────────────┐"
  echo "    │  Type: CNAME                                                   │"
  echo "    │  Name: get                                                     │"
  echo "    │  Value: $ENDPOINT_HOST                                         │"
  echo "    │  TTL: 3600                                                     │"
  echo "    │                                                                │"
  echo "    │  Also add a TXT record for domain validation:                  │"
  echo "    │  Name: _dnsauth.get                                            │"
  echo "    │  Value: (shown after running --enable-custom-domain)            │"
  echo "    └────────────────────────────────────────────────────────────────┘"
fi

# ─── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ Infrastructure Ready                                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  CDN URL:     https://$ENDPOINT_HOST                         ║"
echo "║  Custom URL:  https://$CUSTOM_DOMAIN (after DNS + HTTPS)     ║"
echo "║                                                              ║"
echo "║  Blob paths:                                                 ║"
echo "║    /hub/latest.json           Hub version manifest           ║"
echo "║    /hub/vitora-hub-X.Y.Z.tar.gz  Hub release artifact       ║"
echo "║    /hub                       Linux installer script         ║"
echo "║    /hub.ps1                   Windows installer script       ║"
echo "║    /updates                   Desktop app updater manifest   ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "GitHub Secret to set:"
echo "  AZURE_STORAGE_CONNECTION_STRING=\"$CONN_STR\""
echo ""
echo "Next steps:"
echo "  1. Add CNAME DNS record: get.vitora.digital → $ENDPOINT_HOST"
echo "  2. Wait 5-15 min for propagation"
echo "  3. Re-run: bash scripts/azure-setup-cdn.sh --enable-custom-domain"
echo "  4. Copy connection string above to GitHub repo Secrets"

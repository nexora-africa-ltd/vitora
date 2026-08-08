#!/usr/bin/env bash
set -euo pipefail

# File purpose:
#   Run post-deploy maintenance inside a running ACA app instance.
#   This is a runbook helper for manual execution.
#
# Usage:
#   bash scripts/aca-run-postdeploy.sh <container-app-name> [resource-group]
#
# Args:
#   1) container-app-name (required)
#   2) resource-group (optional, default: vitora-rg)

APP_NAME="${1:-}"
RESOURCE_GROUP="${2:-vitora-rg}"

if [ -z "$APP_NAME" ]; then
  echo "Usage: bash scripts/aca-run-postdeploy.sh <container-app-name> [resource-group]"
  echo "Example: bash scripts/aca-run-postdeploy.sh vitora-api-prod vitora-rg"
  exit 1
fi

az containerapp update \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --min-replicas 1 \
  --output none

az containerapp exec \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --command "bash scripts/aca-postdeploy.sh"

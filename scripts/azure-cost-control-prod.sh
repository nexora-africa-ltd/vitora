#!/usr/bin/env bash
set -euo pipefail

# File purpose:
#   Cost-control and deprovision helper for Azure production resources.
#   Supports safe deallocation (stop DB + disable app ingress), resume, and destroy.
#
# Usage:
#   bash scripts/azure-cost-control-prod.sh
#
# Supported env args (all optional):
#   MODE=deallocate|resume|destroy        (default: deallocate)
#   PROFILE=sa-private|eastus-legacy      (default: sa-private)
#   INCLUDE_STAGING=true|false            (default: false)
#   DRY_RUN=true|false                    (default: true)
#   CONFIRM_DESTROY=yes                   (required when MODE=destroy)
#   DELETE_RESOURCE_GROUP=true|false      (default: false; only for MODE=destroy)
#
#   Manual overrides (if needed):
#   RG_NAME, PROD_APP_NAME, STAGING_APP_NAME, PROD_DB_NAME, STAGING_DB_NAME

MODE="${MODE:-deallocate}"
PROFILE="${PROFILE:-sa-private}"
INCLUDE_STAGING="${INCLUDE_STAGING:-false}"
DRY_RUN="${DRY_RUN:-true}"
CONFIRM_DESTROY="${CONFIRM_DESTROY:-}"
DELETE_RESOURCE_GROUP="${DELETE_RESOURCE_GROUP:-false}"

if [[ "$PROFILE" == "sa-private" ]]; then
  RG_NAME="${RG_NAME:-vitora-rg-sa}"
  PROD_APP_NAME="${PROD_APP_NAME:-vitora-api-prod-private-sa}"
  STAGING_APP_NAME="${STAGING_APP_NAME:-vitora-api-private-sa}"
  PROD_DB_NAME="${PROD_DB_NAME:-vitora-prod-pg3-sa}"
  STAGING_DB_NAME="${STAGING_DB_NAME:-vitora-staging-pg2-sa}"
elif [[ "$PROFILE" == "eastus-legacy" ]]; then
  RG_NAME="${RG_NAME:-vitora-rg}"
  PROD_APP_NAME="${PROD_APP_NAME:-vitora-api-prod}"
  STAGING_APP_NAME="${STAGING_APP_NAME:-vitora-api}"
  PROD_DB_NAME="${PROD_DB_NAME:-}"
  STAGING_DB_NAME="${STAGING_DB_NAME:-}"
else
  echo "ERROR: Unsupported PROFILE: $PROFILE"
  exit 1
fi

run_cmd() {
  local cmd="$1"
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "DRY_RUN: $cmd"
  else
    echo "RUN: $cmd"
    eval "$cmd"
  fi
}

app_deallocate() {
  local app_name="$1"
  run_cmd "az containerapp ingress disable -g \"$RG_NAME\" -n \"$app_name\""
  run_cmd "az containerapp update -g \"$RG_NAME\" -n \"$app_name\" --min-replicas 0"
}

app_resume() {
  local app_name="$1"
  run_cmd "az containerapp ingress enable -g \"$RG_NAME\" -n \"$app_name\" --type external --target-port 8000"
  run_cmd "az containerapp update -g \"$RG_NAME\" -n \"$app_name\" --min-replicas 0"
}

db_stop() {
  local db_name="$1"
  if [[ -z "$db_name" ]]; then
    return
  fi
  run_cmd "az postgres flexible-server stop -g \"$RG_NAME\" -n \"$db_name\""
}

db_start() {
  local db_name="$1"
  if [[ -z "$db_name" ]]; then
    return
  fi
  run_cmd "az postgres flexible-server start -g \"$RG_NAME\" -n \"$db_name\""
}

app_destroy() {
  local app_name="$1"
  run_cmd "az containerapp delete -g \"$RG_NAME\" -n \"$app_name\" -y"
}

db_destroy() {
  local db_name="$1"
  if [[ -z "$db_name" ]]; then
    return
  fi
  run_cmd "az postgres flexible-server delete -g \"$RG_NAME\" -n \"$db_name\" -y"
}

echo "==> Azure prod cost control"
echo "Mode: $MODE"
echo "Profile: $PROFILE"
echo "Resource group: $RG_NAME"
echo "Include staging: $INCLUDE_STAGING"
echo "Dry run: $DRY_RUN"

case "$MODE" in
  deallocate)
    app_deallocate "$PROD_APP_NAME"
    db_stop "$PROD_DB_NAME"
    if [[ "$INCLUDE_STAGING" == "true" ]]; then
      app_deallocate "$STAGING_APP_NAME"
      db_stop "$STAGING_DB_NAME"
    fi
    ;;
  resume)
    db_start "$PROD_DB_NAME"
    app_resume "$PROD_APP_NAME"
    if [[ "$INCLUDE_STAGING" == "true" ]]; then
      db_start "$STAGING_DB_NAME"
      app_resume "$STAGING_APP_NAME"
    fi
    ;;
  destroy)
    if [[ "$CONFIRM_DESTROY" != "yes" ]]; then
      echo "ERROR: MODE=destroy requires CONFIRM_DESTROY=yes"
      exit 2
    fi

    app_destroy "$PROD_APP_NAME"
    db_destroy "$PROD_DB_NAME"

    if [[ "$INCLUDE_STAGING" == "true" ]]; then
      app_destroy "$STAGING_APP_NAME"
      db_destroy "$STAGING_DB_NAME"
    fi

    if [[ "$DELETE_RESOURCE_GROUP" == "true" ]]; then
      run_cmd "az group delete -n \"$RG_NAME\" -y"
    fi
    ;;
  *)
    echo "ERROR: Unsupported MODE: $MODE"
    exit 1
    ;;
esac

echo "Done."

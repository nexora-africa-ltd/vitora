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
WAIT_ATTEMPTS="${WAIT_ATTEMPTS:-18}"
WAIT_SLEEP_SECONDS="${WAIT_SLEEP_SECONDS:-10}"
EXEC_ATTEMPTS="${EXEC_ATTEMPTS:-5}"
EXEC_SLEEP_SECONDS="${EXEC_SLEEP_SECONDS:-20}"

run_postdeploy_exec() {
  local output

  if [ -t 0 ]; then
    az containerapp exec \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --command "bash scripts/aca-postdeploy.sh"
    return $?
  fi

  if command -v script >/dev/null 2>&1; then
    output="$(script -q -e -c "az containerapp exec --name \"$APP_NAME\" --resource-group \"$RESOURCE_GROUP\" --command \"bash scripts/aca-postdeploy.sh\"" /dev/null 2>&1)"
    local exit_code=$?
    printf '%s\n' "$output"
    return $exit_code
  fi

  az containerapp exec \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --command "bash scripts/aca-postdeploy.sh"
}

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

echo "==> Waiting for a replica to become available..."
for attempt in $(seq 1 "$WAIT_ATTEMPTS"); do
  replica_count="$(az containerapp replica list \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "length(@)" \
    -o tsv 2>/dev/null || echo "0")"

  if [ "${replica_count:-0}" -gt 0 ]; then
    echo "==> Replica count: $replica_count"
    break
  fi

  if [ "$attempt" -eq "$WAIT_ATTEMPTS" ]; then
    echo "ERROR: No replicas found after $WAIT_ATTEMPTS attempts."
    echo "==> Latest revision state (for debugging):"
    az containerapp revision list \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --query "[].{name:name,active:properties.active,health:properties.healthState,provisioning:properties.provisioningState,running:properties.runningState}" \
      -o table || true
    exit 1
  fi

  echo "Replica not available yet (attempt $attempt/$WAIT_ATTEMPTS), retrying in ${WAIT_SLEEP_SECONDS}s..."
  sleep "$WAIT_SLEEP_SECONDS"
done

for attempt in $(seq 1 "$EXEC_ATTEMPTS"); do
  exec_output="$(run_postdeploy_exec 2>&1)" && {
      echo "$exec_output"
      echo "==> Post-deploy maintenance completed"
      exit 0
    }

  echo "$exec_output"

  if [ "$attempt" -eq "$EXEC_ATTEMPTS" ]; then
    echo "ERROR: Post-deploy maintenance failed after $EXEC_ATTEMPTS attempts."
    echo "==> Latest revision state (for debugging):"
    az containerapp revision list \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --query "[].{name:name,active:properties.active,health:properties.healthState,provisioning:properties.provisioningState,running:properties.runningState}" \
      -o table || true
    exit 1
  fi

  echo "Post-deploy maintenance attempt ${attempt} failed, retrying in ${EXEC_SLEEP_SECONDS}s..."
  sleep "$EXEC_SLEEP_SECONDS"
done

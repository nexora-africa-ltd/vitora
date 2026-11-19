# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
#
# Measures an approved production Superset scale-to-zero cold start.
#
# Use: cd backend && bash scripts/check-superset-cold-start-sa.sh
# Inputs: SS_COLD_CONFIRM=1 (skip prompt), ACA_RG, ACA_NAME, and COLD_TIMEOUT_SECONDS.
# The script restores the app's original minimum-replica count before exiting.
#!/usr/bin/env bash
set -euo pipefail

ACA_RG="${ACA_RG:-vitora-rg-sa}"
ACA_NAME="${ACA_NAME:-vitora-superset-sa}"
COLD_TIMEOUT_SECONDS="${COLD_TIMEOUT_SECONDS:-900}"

if [[ "${SS_COLD_CONFIRM:-}" != "1" ]]; then
  echo "This temporarily scales ${ACA_NAME} to zero and measures its first health response."
  read -r -p "Continue during an approved analytics maintenance window? [y/N] " confirmation
  if [[ "${confirmation}" != "y" && "${confirmation}" != "Y" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

az account show -o none
az containerapp show -g "${ACA_RG}" -n "${ACA_NAME}" -o none

SUPERSET_FQDN="$(az containerapp show -g "${ACA_RG}" -n "${ACA_NAME}" --query "properties.configuration.ingress.fqdn" -o tsv)"
if ! curl --fail --silent --show-error --max-time 10 "https://${SUPERSET_FQDN}/health" >/dev/null; then
  echo "ERROR: ${ACA_NAME} is not healthy; refusing a cold-start measurement." >&2
  exit 1
fi

ORIGINAL_MIN_REPLICAS="$(az containerapp show -g "${ACA_RG}" -n "${ACA_NAME}" --query "properties.template.scale.minReplicas" -o tsv)"
ORIGINAL_MIN_REPLICAS="${ORIGINAL_MIN_REPLICAS:-0}"

restore_scale() {
  az containerapp update \
    -g "${ACA_RG}" \
    -n "${ACA_NAME}" \
    --min-replicas "${ORIGINAL_MIN_REPLICAS}" \
    -o none || true
}
trap restore_scale EXIT

echo "==> Scaling ${ACA_NAME} to zero"
az containerapp update -g "${ACA_RG}" -n "${ACA_NAME}" --min-replicas 0 -o none

deadline=$(( $(date +%s) + COLD_TIMEOUT_SECONDS ))
while true; do
  replica_count="$(az containerapp replica list -g "${ACA_RG}" -n "${ACA_NAME}" --query "length([])" -o tsv)"
  if [[ "${replica_count}" == "0" ]]; then
    break
  fi
  if (( $(date +%s) >= deadline )); then
    echo "ERROR: ${ACA_NAME} did not scale to zero within ${COLD_TIMEOUT_SECONDS}s." >&2
    exit 1
  fi
  sleep 10
done

echo "==> Measuring first health response"
started_at="$(date +%s%3N)"
while true; do
  if curl --fail --silent --show-error --max-time 10 "https://${SUPERSET_FQDN}/health" >/dev/null; then
    finished_at="$(date +%s%3N)"
    elapsed_ms=$((finished_at - started_at))
    echo "✅ Cold start completed in ${elapsed_ms} ms."
    break
  fi
  if (( $(date +%s) >= deadline )); then
    echo "ERROR: Superset did not become healthy within ${COLD_TIMEOUT_SECONDS}s." >&2
    exit 1
  fi
  sleep 2
done

echo "==> Restoring minimum replicas to ${ORIGINAL_MIN_REPLICAS}"
restore_scale
trap - EXIT

# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
#
# Deploys the production-only Superset service in South Africa North Container Apps.
#
# Use: cd backend && bash scripts/deploy-superset-sa.sh
# Inputs: DEPLOY_TAG (optional immutable image tag), SS_ASSUME_YES=1 (skip prompt),
# SS_MIGRATE_ONLY=1 (run the current image's migration job only), ACA_RG, ACA_ENV,
# ACA_NAME, ACA_JOB, ACR_NAME, and IMAGE_REPOSITORY.
#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ACA_RG="${ACA_RG:-vitora-rg-sa}"
ACA_ENV="${ACA_ENV:-vitora-env-private-sa}"
ACA_NAME="${ACA_NAME:-vitora-superset-sa}"
ACA_JOB="${ACA_JOB:-vitora-superset-migrate-sa}"
ACR_NAME="${ACR_NAME:-vitoraacrsa}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-vitora-superset}"

if [[ -n "${DEPLOY_TAG:-}" ]]; then
  IMAGE_TAG="${DEPLOY_TAG}"
else
  IMAGE_TAG="$(git -C "${REPOSITORY_ROOT}" rev-parse --short HEAD)"
  if [[ -n "$(git -C "${REPOSITORY_ROOT}" status --porcelain)" ]]; then
    IMAGE_TAG="${IMAGE_TAG}-dirty-$(date -u +%Y%m%d%H%M%S)"
  fi
fi

IMAGE_REF="${ACR_NAME}.azurecr.io/${IMAGE_REPOSITORY}:${IMAGE_TAG}"
DEPLOY_STARTED_AT="$(date +%s)"
IMAGE_SIZE_BYTES=""
IMAGE_DIGEST=""

format_bytes() {
  # Format an image size without adding a Python runtime dependency.
  numfmt --to=iec-i --suffix=B "$1" 2>/dev/null || printf "%s bytes" "$1"
}

print_deploy_summary() {
  # Print the immutable image and active Container Apps rollout state.
  local completed_at elapsed_seconds revision replica_count health_state min_replicas max_replicas
  completed_at="$(date +%s)"
  elapsed_seconds=$((completed_at - DEPLOY_STARTED_AT))
  revision="$(az containerapp show -g "${ACA_RG}" -n "${ACA_NAME}" \
    --query "properties.latestRevisionName" -o tsv)"
  replica_count="$(az containerapp replica list -g "${ACA_RG}" -n "${ACA_NAME}" \
    --query "length([])" -o tsv)"
  health_state="$(az containerapp revision show -g "${ACA_RG}" -n "${ACA_NAME}" \
    --revision "${revision}" --query "properties.healthState" -o tsv)"
  min_replicas="$(az containerapp show -g "${ACA_RG}" -n "${ACA_NAME}" \
    --query "properties.template.scale.minReplicas" -o tsv)"
  max_replicas="$(az containerapp show -g "${ACA_RG}" -n "${ACA_NAME}" \
    --query "properties.template.scale.maxReplicas" -o tsv)"

  cat <<EOF

=== Superset Deployment Summary ===
Application:    ${ACA_NAME}
Image tag:      ${IMAGE_REF}
Image digest:   ${IMAGE_DIGEST}
Image size:     $(format_bytes "${IMAGE_SIZE_BYTES}")
Migration job:  ${JOB_EXECUTION:-not-run}
Revision:       ${revision}
Health:         ${health_state}
Replicas:       ${replica_count} (min ${min_replicas}, max ${max_replicas})
Elapsed:        ${elapsed_seconds}s
URL:            https://${SUPERSET_FQDN}
==================================
EOF
}

print_migration_logs() {
  # Print retained console output for the current migration execution.
  echo "==> Migration job console output"
  az containerapp job logs show \
    -g "${ACA_RG}" -n "${ACA_JOB}" --execution "${JOB_EXECUTION}" \
    --container "${ACA_JOB}" --tail 100 --format text || true
}

print_migration_diagnostics() {
  # Surface the failed job execution and any retained console logs.
  az containerapp job execution show \
    -g "${ACA_RG}" -n "${ACA_JOB}" --job-execution-name "${JOB_EXECUTION}" \
    --query "{execution:name,status:properties.status,start:properties.startTime}" -o table || true
  print_migration_logs
}

if [[ "${SS_ASSUME_YES:-}" != "1" ]]; then
  echo "This deploys Superset to ${ACA_NAME} in ${ACA_RG}."
  read -r -p "Continue? [y/N] " confirmation
  if [[ "${confirmation}" != "y" && "${confirmation}" != "Y" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "==> Validating Azure resources"
az account show -o none
az group show -n "${ACA_RG}" -o none
az containerapp env show -g "${ACA_RG}" -n "${ACA_ENV}" -o none
az containerapp show -g "${ACA_RG}" -n "${ACA_NAME}" -o none

if [[ "${SS_MIGRATE_ONLY:-}" == "1" ]]; then
  IMAGE_REF="$(az containerapp show -g "${ACA_RG}" -n "${ACA_NAME}" \
    --query "properties.template.containers[0].image" -o tsv)"
  echo "==> Running migrations against deployed image ${IMAGE_REF}"
else
  echo "==> Building Superset image ${IMAGE_REF}"
  docker build \
    -f "${REPOSITORY_ROOT}/docker/superset/Dockerfile.production" \
    -t "${IMAGE_REF}" \
    -t "${ACR_NAME}.azurecr.io/${IMAGE_REPOSITORY}:sa-latest" \
    "${REPOSITORY_ROOT}/docker/superset"
  IMAGE_SIZE_BYTES="$(docker image inspect "${IMAGE_REF}" --format '{{.Size}}')"

  echo "==> Pushing Superset image"
  az acr login --name "${ACR_NAME}"
  docker push "${IMAGE_REF}"
  docker push "${ACR_NAME}.azurecr.io/${IMAGE_REPOSITORY}:sa-latest"
  IMAGE_DIGEST="$(az acr repository show -n "${ACR_NAME}" \
    --image "${IMAGE_REPOSITORY}:${IMAGE_TAG}" --query digest -o tsv)"
fi

echo "==> Reading existing Superset deployment secrets"
SUPERSET_SECRET_KEY="$(az containerapp secret list -g "${ACA_RG}" -n "${ACA_NAME}" --show-values --query "[?name=='superset-secret-key'].value | [0]" -o tsv)"
SUPERSET_META_DB_URL="$(az containerapp secret list -g "${ACA_RG}" -n "${ACA_NAME}" --show-values --query "[?name=='superset-meta-db-url'].value | [0]" -o tsv)"
SUPERSET_ADMIN_PASSWORD="$(az containerapp secret list -g "${ACA_RG}" -n "${ACA_NAME}" --show-values --query "[?name=='superset-admin-password'].value | [0]" -o tsv)"

if [[ -z "${SUPERSET_SECRET_KEY}" || -z "${SUPERSET_META_DB_URL}" || -z "${SUPERSET_ADMIN_PASSWORD}" ]]; then
  echo "ERROR: ${ACA_NAME} is missing required Superset secrets." >&2
  exit 1
fi

ACR_USERNAME="$(az acr credential show -n "${ACR_NAME}" --query username -o tsv)"
ACR_PASSWORD="$(az acr credential show -n "${ACR_NAME}" --query "passwords[0].value" -o tsv)"
JOB_ENV=(
  "SUPERSET_SECRET_KEY=secretref:superset-key"
  "SUPERSET_META_DB_URL=secretref:superset-db-url"
  "SUPERSET_ADMIN_PASSWORD=secretref:superset-admin"
  "SUPERSET_REDIS_URL="
  "SUPERSET_CORS_ORIGINS=https://vitora-navy.vercel.app,https://staging.vitora.digital,https://app.vitora.digital"
  "SUPERSET_FRAME_ANCESTORS=https://vitora-navy.vercel.app https://staging.vitora.digital https://app.vitora.digital"
)

if az containerapp job show -g "${ACA_RG}" -n "${ACA_JOB}" -o none >/dev/null 2>&1; then
  az containerapp job secret set \
    -g "${ACA_RG}" -n "${ACA_JOB}" \
    --secrets \
      "superset-key=${SUPERSET_SECRET_KEY}" \
      "superset-db-url=${SUPERSET_META_DB_URL}" \
      "superset-admin=${SUPERSET_ADMIN_PASSWORD}" \
    -o none
  az containerapp job update \
    -g "${ACA_RG}" -n "${ACA_JOB}" \
    --image "${IMAGE_REF}" \
    --command "/bin/bash" "/app/migrate-superset.sh" \
    --replace-env-vars "${JOB_ENV[@]}" \
    -o none
else
  az containerapp job create \
    -g "${ACA_RG}" -n "${ACA_JOB}" \
    --environment "${ACA_ENV}" \
    --trigger-type Manual \
    --replica-timeout 900 \
    --replica-retry-limit 1 \
    --image "${IMAGE_REF}" \
    --registry-server "${ACR_NAME}.azurecr.io" \
    --registry-username "${ACR_USERNAME}" \
    --registry-password "${ACR_PASSWORD}" \
    --cpu 1.0 \
    --memory 2.0Gi \
    --command "/bin/bash" "/app/migrate-superset.sh" \
    --secrets \
      "superset-key=${SUPERSET_SECRET_KEY}" \
      "superset-db-url=${SUPERSET_META_DB_URL}" \
      "superset-admin=${SUPERSET_ADMIN_PASSWORD}" \
    --env-vars "${JOB_ENV[@]}" \
    -o none
fi

echo "==> Running Superset migration job"
JOB_EXECUTION="$(az containerapp job start -g "${ACA_RG}" -n "${ACA_JOB}" --query name -o tsv)"
if [[ -z "${JOB_EXECUTION}" ]]; then
  echo "ERROR: Migration job did not return an execution name." >&2
  exit 1
fi
echo "    Migration execution: ${JOB_EXECUTION}"

for attempt in $(seq 1 90); do
  JOB_STATUS="$(az containerapp job execution show \
    -g "${ACA_RG}" -n "${ACA_JOB}" --job-execution-name "${JOB_EXECUTION}" \
    --query properties.status -o tsv)"
  echo "    [$(date -u +%H:%M:%SZ)] Migration job status: ${JOB_STATUS:-Pending} (check ${attempt}/90)"
  case "${JOB_STATUS}" in
    Succeeded)
      echo "    Migration job completed."
      print_migration_logs
      break
      ;;
    Failed)
      echo "ERROR: Migration job failed: ${JOB_EXECUTION}" >&2
      print_migration_diagnostics
      exit 1
      ;;
    *)
      if [[ "${attempt}" == "90" ]]; then
        echo "ERROR: Timed out waiting for migration job: ${JOB_EXECUTION}" >&2
        print_migration_diagnostics
        exit 1
      fi
      sleep 10
      ;;
  esac
done

if [[ "${SS_MIGRATE_ONLY:-}" == "1" ]]; then
  echo "✅ Superset migration completed for ${IMAGE_REF} in $(( $(date +%s) - DEPLOY_STARTED_AT ))s."
  exit 0
fi

echo "==> Deploying Superset web image"
az containerapp update \
  -g "${ACA_RG}" \
  -n "${ACA_NAME}" \
  --image "${IMAGE_REF}" \
  -o none

SUPERSET_FQDN="$(az containerapp show -g "${ACA_RG}" -n "${ACA_NAME}" --query "properties.configuration.ingress.fqdn" -o tsv)"
echo "==> Waiting for Superset health check"
for attempt in $(seq 1 36); do
  if curl --fail --silent --show-error --max-time 10 "https://${SUPERSET_FQDN}/health" >/dev/null; then
    print_deploy_summary
    echo "✅ Superset deployed and healthy."
    exit 0
  fi
  sleep 5
done

echo "ERROR: Superset did not become healthy within three minutes." >&2
exit 1

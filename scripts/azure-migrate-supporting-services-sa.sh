#!/usr/bin/env bash
set -euo pipefail

# File purpose:
#   Provision supporting services in South Africa private ACA environment and
#   patch API app environment variables to use SA-local dependencies.
#
# What this script provisions/updates:
#   - HL7 mock service (internal): vitora-hl7-mock-sa
#   - HAPI FHIR service (internal): vitora-hapi-fhir-sa
#   - Superset service (external): vitora-superset-sa
#   - Tibabot service (external): tibabot-sa
#
# What this script patches in API apps:
#   - MLLP_HOST -> SA HL7 mock internal FQDN
#   - HAPI_FHIR_BASE_URL -> SA HAPI FHIR internal URL
#   - SUPERSET_URL -> SA Superset URL
#   - METABASE_SITE_URL / METABASE_API_URL -> blank (Metabase decommissioned)
#
# Usage:
#   bash scripts/azure-migrate-supporting-services-sa.sh
#
# Supported env args (all optional):
#   SOURCE_RG=vitora-rg
#   TARGET_RG=vitora-rg-sa
#   TARGET_ENV=vitora-env-private-sa
#   SOURCE_ACR_NAME=vitoraacr
#   TARGET_ACR_NAME=vitoraacrsa
#
#   SOURCE_HL7_APP=vitora-hl7-mock
#   SOURCE_HAPI_APP=vitora-hapi-fhir
#   SOURCE_SUPERSET_APP=vitora-superset
#
#   TARGET_HL7_APP=vitora-hl7-mock-sa
#   TARGET_HAPI_APP=vitora-hapi-fhir-sa
#   TARGET_SUPERSET_APP=vitora-superset-sa
#   SOURCE_TIBABOT_APP=tibabot
#   TARGET_TIBABOT_APP=tibabot-sa
#   TARGET_TIBABOT_STORAGE_ACCOUNT=tibabotdatasa
#   TARGET_TIBABOT_STORAGE_SHARE=tibabot-data
#   TARGET_TIBABOT_STORAGE_NAME=tibabot-storage
#   TIBABOT_PUBLIC_BASE_URL=https://tibabot.vitora.nexora.africa
#
#   TARGET_STAGING_API_APP=vitora-api-private-sa
#   TARGET_PROD_API_APP=vitora-api-prod-private-sa

SOURCE_RG="${SOURCE_RG:-vitora-rg}"
TARGET_RG="${TARGET_RG:-vitora-rg-sa}"
TARGET_ENV="${TARGET_ENV:-vitora-env-private-sa}"

SOURCE_ACR_NAME="${SOURCE_ACR_NAME:-vitoraacr}"
TARGET_ACR_NAME="${TARGET_ACR_NAME:-vitoraacrsa}"

SOURCE_HL7_APP="${SOURCE_HL7_APP:-vitora-hl7-mock}"
SOURCE_HAPI_APP="${SOURCE_HAPI_APP:-vitora-hapi-fhir}"
SOURCE_SUPERSET_APP="${SOURCE_SUPERSET_APP:-vitora-superset}"
SOURCE_TIBABOT_APP="${SOURCE_TIBABOT_APP:-tibabot}"

TARGET_HL7_APP="${TARGET_HL7_APP:-vitora-hl7-mock-sa}"
TARGET_HAPI_APP="${TARGET_HAPI_APP:-vitora-hapi-fhir-sa}"
TARGET_SUPERSET_APP="${TARGET_SUPERSET_APP:-vitora-superset-sa}"
TARGET_TIBABOT_APP="${TARGET_TIBABOT_APP:-tibabot-sa}"
TARGET_TIBABOT_STORAGE_ACCOUNT="${TARGET_TIBABOT_STORAGE_ACCOUNT:-tibabotdatasa}"
TARGET_TIBABOT_STORAGE_SHARE="${TARGET_TIBABOT_STORAGE_SHARE:-tibabot-data}"
TARGET_TIBABOT_STORAGE_NAME="${TARGET_TIBABOT_STORAGE_NAME:-tibabot-storage}"
TIBABOT_PUBLIC_BASE_URL="${TIBABOT_PUBLIC_BASE_URL:-https://tibabot.vitora.nexora.africa}"

TARGET_STAGING_API_APP="${TARGET_STAGING_API_APP:-vitora-api-private-sa}"
TARGET_PROD_API_APP="${TARGET_PROD_API_APP:-vitora-api-prod-private-sa}"

echo "==> Validating Azure CLI login"
az account show -o none

echo "==> Validating target resource group and environment"
az group show -n "${TARGET_RG}" -o none
az containerapp env show -g "${TARGET_RG}" -n "${TARGET_ENV}" -o none

containerapp_exists() {
  local rg="$1"
  local app="$2"
  az containerapp show -g "$rg" -n "$app" -o none >/dev/null 2>&1
}

import_image_from_source_app() {
  local source_app="$1"
  local target_repo_tag="$2"

  local source_image
  source_image="$(az containerapp show -g "${SOURCE_RG}" -n "${source_app}" --query "properties.template.containers[0].image" -o tsv)"

  if [[ -z "$source_image" ]]; then
    echo "ERROR: Could not resolve image from source app ${source_app}"
    exit 1
  fi

  echo "==> Importing ${source_image} into ${TARGET_ACR_NAME} as ${target_repo_tag}"
  az acr import \
    --name "${TARGET_ACR_NAME}" \
    --source "${source_image}" \
    --image "${target_repo_tag}" \
    --force \
    -o none
}

echo "==> Ensuring ACR admin is enabled for ${TARGET_ACR_NAME}"
az acr update --name "${TARGET_ACR_NAME}" --admin-enabled true -o none

import_image_from_source_app "${SOURCE_HL7_APP}" "hl7-mock:sa-latest"
import_image_from_source_app "${SOURCE_SUPERSET_APP}" "vitora-superset:sa-latest"
import_image_from_source_app "${SOURCE_TIBABOT_APP}" "tibabot:sa-latest"

echo "==> Provisioning HL7 mock (internal TCP)"
if containerapp_exists "${TARGET_RG}" "${TARGET_HL7_APP}"; then
  az containerapp update \
    -g "${TARGET_RG}" \
    -n "${TARGET_HL7_APP}" \
    --image "${TARGET_ACR_NAME}.azurecr.io/hl7-mock:sa-latest" \
    --cpu 0.25 \
    --memory 0.5Gi \
    --min-replicas 0 \
    --max-replicas 1 \
    -o none

  az containerapp ingress update \
    -g "${TARGET_RG}" \
    -n "${TARGET_HL7_APP}" \
    --type internal \
    --target-port 2575 \
    --transport tcp \
    -o none
else
  az containerapp create \
    -g "${TARGET_RG}" \
    -n "${TARGET_HL7_APP}" \
    --environment "${TARGET_ENV}" \
    --image "${TARGET_ACR_NAME}.azurecr.io/hl7-mock:sa-latest" \
    --ingress internal \
    --target-port 2575 \
    --transport tcp \
    --min-replicas 0 \
    --max-replicas 1 \
    --cpu 0.25 \
    --memory 0.5Gi \
    --registry-server "${TARGET_ACR_NAME}.azurecr.io" \
    -o none
fi

echo "==> Provisioning HAPI FHIR (internal HTTP)"
HAPI_ENV_ARGS=(
  "hapi.fhir.fhir_version=R4"
  "hapi.fhir.allow_external_references=true"
  "hapi.fhir.allow_multiple_delete=true"
  "hapi.fhir.allow_cascading_deletes=true"
  "hapi.fhir.expunge_enabled=true"
  "hapi.fhir.validation.enabled=true"
  "hapi.fhir.validation.requests_enabled=true"
  "hapi.fhir.validation.responses_enabled=false"
  "hapi.fhir.default_page_size=20"
  "hapi.fhir.max_page_size=200"
  "spring.datasource.url=jdbc:h2:mem:hapi;DB_CLOSE_DELAY=-1"
  "spring.datasource.username=sa"
  "spring.datasource.password="
)

if containerapp_exists "${TARGET_RG}" "${TARGET_HAPI_APP}"; then
  az containerapp update \
    -g "${TARGET_RG}" \
    -n "${TARGET_HAPI_APP}" \
    --image "hapiproject/hapi:v7.4.0" \
    --cpu 0.5 \
    --memory 1.0Gi \
    --min-replicas 0 \
    --max-replicas 1 \
    --set-env-vars "${HAPI_ENV_ARGS[@]}" \
    -o none

  az containerapp ingress update \
    -g "${TARGET_RG}" \
    -n "${TARGET_HAPI_APP}" \
    --type internal \
    --target-port 8080 \
    -o none
else
  az containerapp create \
    -g "${TARGET_RG}" \
    -n "${TARGET_HAPI_APP}" \
    --environment "${TARGET_ENV}" \
    --image "hapiproject/hapi:v7.4.0" \
    --ingress internal \
    --target-port 8080 \
    --min-replicas 0 \
    --max-replicas 1 \
    --cpu 0.5 \
    --memory 1.0Gi \
    --env-vars "${HAPI_ENV_ARGS[@]}" \
    -o none
fi

echo "==> Syncing Superset secrets from source app"
SUPERSET_SECRET_KEY="$(az containerapp secret list -g "${SOURCE_RG}" -n "${SOURCE_SUPERSET_APP}" --show-values --query "[?name=='superset-secret-key'].value | [0]" -o tsv)"
SUPERSET_META_DB_URL="$(az containerapp secret list -g "${SOURCE_RG}" -n "${SOURCE_SUPERSET_APP}" --show-values --query "[?name=='superset-meta-db-url'].value | [0]" -o tsv)"
SUPERSET_ADMIN_PASSWORD="$(az containerapp secret list -g "${SOURCE_RG}" -n "${SOURCE_SUPERSET_APP}" --show-values --query "[?name=='superset-admin-password'].value | [0]" -o tsv)"

if [[ -z "${SUPERSET_SECRET_KEY}" || -z "${SUPERSET_META_DB_URL}" || -z "${SUPERSET_ADMIN_PASSWORD}" ]]; then
  echo "ERROR: Missing required Superset secrets from source app ${SOURCE_SUPERSET_APP}"
  exit 1
fi

if containerapp_exists "${TARGET_RG}" "${TARGET_SUPERSET_APP}"; then
  az containerapp secret set \
    -g "${TARGET_RG}" \
    -n "${TARGET_SUPERSET_APP}" \
    --secrets \
      "superset-secret-key=${SUPERSET_SECRET_KEY}" \
      "superset-meta-db-url=${SUPERSET_META_DB_URL}" \
      "superset-admin-password=${SUPERSET_ADMIN_PASSWORD}" \
    -o none

  az containerapp update \
    -g "${TARGET_RG}" \
    -n "${TARGET_SUPERSET_APP}" \
    --image "${TARGET_ACR_NAME}.azurecr.io/vitora-superset:sa-latest" \
    --cpu 1.0 \
    --memory 2.0Gi \
    --min-replicas 1 \
    --max-replicas 2 \
    --set-env-vars \
      "SUPERSET_SECRET_KEY=secretref:superset-secret-key" \
      "SUPERSET_META_DB_URL=secretref:superset-meta-db-url" \
      "SUPERSET_ADMIN_PASSWORD=secretref:superset-admin-password" \
      "SUPERSET_REDIS_URL=" \
      "SUPERSET_CORS_ORIGINS=https://vitora-navy.vercel.app,https://staging.vitora.digital,https://app.vitora.digital" \
      "SUPERSET_FRAME_ANCESTORS=https://vitora-navy.vercel.app https://staging.vitora.digital https://app.vitora.digital" \
    -o none

  az containerapp ingress update \
    -g "${TARGET_RG}" \
    -n "${TARGET_SUPERSET_APP}" \
    --type external \
    --target-port 8088 \
    -o none
else
  az containerapp create \
    -g "${TARGET_RG}" \
    -n "${TARGET_SUPERSET_APP}" \
    --environment "${TARGET_ENV}" \
    --image "${TARGET_ACR_NAME}.azurecr.io/vitora-superset:sa-latest" \
    --ingress external \
    --target-port 8088 \
    --min-replicas 1 \
    --max-replicas 2 \
    --cpu 1.0 \
    --memory 2.0Gi \
    --registry-server "${TARGET_ACR_NAME}.azurecr.io" \
    --secrets \
      "superset-secret-key=${SUPERSET_SECRET_KEY}" \
      "superset-meta-db-url=${SUPERSET_META_DB_URL}" \
      "superset-admin-password=${SUPERSET_ADMIN_PASSWORD}" \
    --env-vars \
      "SUPERSET_SECRET_KEY=secretref:superset-secret-key" \
      "SUPERSET_META_DB_URL=secretref:superset-meta-db-url" \
      "SUPERSET_ADMIN_PASSWORD=secretref:superset-admin-password" \
      "SUPERSET_REDIS_URL=" \
      "SUPERSET_CORS_ORIGINS=https://vitora-navy.vercel.app,https://staging.vitora.digital,https://app.vitora.digital" \
      "SUPERSET_FRAME_ANCESTORS=https://vitora-navy.vercel.app https://staging.vitora.digital https://app.vitora.digital" \
    -o none
fi

echo "==> Resolving new service endpoints"
HL7_INTERNAL_FQDN="$(az containerapp show -g "${TARGET_RG}" -n "${TARGET_HL7_APP}" --query "properties.configuration.ingress.fqdn" -o tsv)"
HAPI_INTERNAL_FQDN="$(az containerapp show -g "${TARGET_RG}" -n "${TARGET_HAPI_APP}" --query "properties.configuration.ingress.fqdn" -o tsv)"
SUPERSET_FQDN="$(az containerapp show -g "${TARGET_RG}" -n "${TARGET_SUPERSET_APP}" --query "properties.configuration.ingress.fqdn" -o tsv)"

if [[ -z "${HL7_INTERNAL_FQDN}" || -z "${HAPI_INTERNAL_FQDN}" || -z "${SUPERSET_FQDN}" ]]; then
  echo "ERROR: Could not resolve one or more target service FQDNs"
  exit 1
fi

patch_api_app_env() {
  local app_name="$1"
  echo "==> Patching API env vars for ${app_name}"
  az containerapp update \
    -g "${TARGET_RG}" \
    -n "${app_name}" \
    --set-env-vars \
      "MLLP_HOST=${HL7_INTERNAL_FQDN}" \
      "HAPI_FHIR_BASE_URL=http://${HAPI_INTERNAL_FQDN}/fhir" \
      "SUPERSET_URL=https://${SUPERSET_FQDN}" \
      "METABASE_SITE_URL=" \
      "METABASE_API_URL=" \
    -o none
}

patch_api_app_env "${TARGET_STAGING_API_APP}"
patch_api_app_env "${TARGET_PROD_API_APP}"

echo "==> Ensuring Tibabot storage account and file share in SA"
if az storage account show -g "${TARGET_RG}" -n "${TARGET_TIBABOT_STORAGE_ACCOUNT}" -o none 2>/dev/null; then
  echo "    storage account exists: ${TARGET_TIBABOT_STORAGE_ACCOUNT}"
else
  az storage account create \
    -g "${TARGET_RG}" \
    -n "${TARGET_TIBABOT_STORAGE_ACCOUNT}" \
    -l "southafricanorth" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --min-tls-version TLS1_2 \
    --allow-blob-public-access false \
    -o none
fi

if az storage share-rm exists -g "${TARGET_RG}" --storage-account "${TARGET_TIBABOT_STORAGE_ACCOUNT}" -n "${TARGET_TIBABOT_STORAGE_SHARE}" --query exists -o tsv | grep -q true; then
  echo "    file share exists: ${TARGET_TIBABOT_STORAGE_SHARE}"
else
  az storage share-rm create \
    -g "${TARGET_RG}" \
    --storage-account "${TARGET_TIBABOT_STORAGE_ACCOUNT}" \
    -n "${TARGET_TIBABOT_STORAGE_SHARE}" \
    --quota 100 \
    -o none
fi

echo "==> Binding Tibabot storage to ACA environment"
TARGET_TIBABOT_STORAGE_KEY="$(az storage account keys list -g "${TARGET_RG}" -n "${TARGET_TIBABOT_STORAGE_ACCOUNT}" --query "[0].value" -o tsv)"
az containerapp env storage set \
  -g "${TARGET_RG}" \
  -n "${TARGET_ENV}" \
  --storage-name "${TARGET_TIBABOT_STORAGE_NAME}" \
  --access-mode ReadWrite \
  --azure-file-account-name "${TARGET_TIBABOT_STORAGE_ACCOUNT}" \
  --azure-file-account-key "${TARGET_TIBABOT_STORAGE_KEY}" \
  --azure-file-share-name "${TARGET_TIBABOT_STORAGE_SHARE}" \
  -o none

echo "==> Ensuring Tibabot app"
if containerapp_exists "${TARGET_RG}" "${TARGET_TIBABOT_APP}"; then
  az containerapp update \
    -g "${TARGET_RG}" \
    -n "${TARGET_TIBABOT_APP}" \
    --image "${TARGET_ACR_NAME}.azurecr.io/tibabot:sa-latest" \
    --cpu 4.0 \
    --memory 8.0Gi \
    --min-replicas 1 \
    --max-replicas 3 \
    -o none
else
  az containerapp create \
    -g "${TARGET_RG}" \
    -n "${TARGET_TIBABOT_APP}" \
    --environment "${TARGET_ENV}" \
    --image "${TARGET_ACR_NAME}.azurecr.io/tibabot:sa-latest" \
    --ingress external \
    --target-port 8000 \
    --min-replicas 1 \
    --max-replicas 3 \
    --cpu 4.0 \
    --memory 8.0Gi \
    --registry-server "${TARGET_ACR_NAME}.azurecr.io" \
    -o none
fi

echo "==> Syncing Tibabot secrets from source app"
python3 - <<PY
import json
import subprocess

source_rg = "${SOURCE_RG}"
source_app = "${SOURCE_TIBABOT_APP}"
target_rg = "${TARGET_RG}"
target_app = "${TARGET_TIBABOT_APP}"

secrets = json.loads(
    subprocess.check_output(
        [
            "az",
            "containerapp",
            "secret",
            "list",
            "-g",
            source_rg,
            "-n",
            source_app,
            "--show-values",
            "-o",
            "json",
        ],
        text=True,
    )
)

pairs = [f"{s['name']}={s.get('value','')}" for s in secrets]
for idx in range(0, len(pairs), 20):
    chunk = pairs[idx : idx + 20]
    subprocess.run(
        [
            "az",
            "containerapp",
            "secret",
            "set",
            "-g",
            target_rg,
            "-n",
            target_app,
            "--secrets",
            *chunk,
            "-o",
            "none",
        ],
        check=True,
    )
PY

echo "==> Syncing Tibabot env vars from source app (with SA overrides)"
python3 - <<PY
import json
import subprocess

source_rg = "${SOURCE_RG}"
source_app = "${SOURCE_TIBABOT_APP}"
target_rg = "${TARGET_RG}"
target_app = "${TARGET_TIBABOT_APP}"

env_items = json.loads(
    subprocess.check_output(
        [
            "az",
            "containerapp",
            "show",
            "-g",
            source_rg,
            "-n",
            source_app,
            "--query",
            "properties.template.containers[0].env",
            "-o",
            "json",
        ],
        text=True,
    )
)

env_map = {}
for item in env_items:
    name = item["name"]
    if "secretRef" in item:
        env_map[name] = f"secretref:{item['secretRef']}"
    else:
        env_map[name] = item.get("value", "")

env_map["TIBABOT_JWT_JWKS_URI"] = "https://api.vitora.digital/.well-known/jwks.json"

cors = [v.strip() for v in env_map.get("TIBABOT_CORS_ORIGINS", "").split(",") if v.strip()]
cors = [v for v in cors if "agreeabledune-6cc420cc.eastus.azurecontainerapps.io" not in v]
if "https://api.vitora.digital" not in cors:
    cors.append("https://api.vitora.digital")
if "${TIBABOT_PUBLIC_BASE_URL}" not in cors:
    cors.append("${TIBABOT_PUBLIC_BASE_URL}")
env_map["TIBABOT_CORS_ORIGINS"] = ",".join(cors)

pairs = [f"{k}={v}" for k, v in env_map.items()]
for idx in range(0, len(pairs), 20):
    chunk = pairs[idx : idx + 20]
    subprocess.run(
        [
            "az",
            "containerapp",
            "update",
            "-g",
            target_rg,
            "-n",
            target_app,
            "--set-env-vars",
            *chunk,
            "-o",
            "none",
        ],
        check=True,
    )
PY

echo "==> Ensuring Tibabot storage volume mount"
python3 - <<PY
import json
import subprocess
from pathlib import Path
import yaml

target_rg = "${TARGET_RG}"
target_app = "${TARGET_TIBABOT_APP}"
storage_name = "${TARGET_TIBABOT_STORAGE_NAME}"

app = json.loads(
    subprocess.check_output(
        ["az", "containerapp", "show", "-g", target_rg, "-n", target_app, "-o", "json"],
        text=True,
    )
)

container = app["properties"]["template"]["containers"][0]
volume_mounts = container.get("volumeMounts") or []
if not any(vm.get("volumeName") == storage_name for vm in volume_mounts):
    volume_mounts.append({"volumeName": storage_name, "mountPath": "/mnt/data"})
container["volumeMounts"] = volume_mounts

volumes = app["properties"]["template"].get("volumes") or []
if not any(v.get("name") == storage_name for v in volumes):
    volumes.append({"name": storage_name, "storageType": "AzureFile", "storageName": storage_name})
app["properties"]["template"]["volumes"] = volumes

doc = {
    "name": target_app,
    "type": "Microsoft.App/containerApps",
    "location": app["location"],
    "properties": {
        "managedEnvironmentId": app["properties"]["managedEnvironmentId"],
        "configuration": {
            "ingress": app["properties"]["configuration"].get("ingress"),
            "registries": app["properties"]["configuration"].get("registries"),
            "secrets": app["properties"]["configuration"].get("secrets"),
            "activeRevisionsMode": app["properties"]["configuration"].get("activeRevisionsMode", "Single"),
        },
        "template": app["properties"]["template"],
    },
}

tmp_path = Path("/tmp/opencode/tibabot-sa-update.yaml")
tmp_path.parent.mkdir(parents=True, exist_ok=True)
tmp_path.write_text(yaml.safe_dump(doc, sort_keys=False), encoding="utf-8")

subprocess.run(
    [
        "az",
        "containerapp",
        "update",
        "-g",
        target_rg,
        "-n",
        target_app,
        "--yaml",
        str(tmp_path),
        "-o",
        "none",
    ],
    check=True,
)
PY

TIBABOT_SA_FQDN="$(az containerapp show -g "${TARGET_RG}" -n "${TARGET_TIBABOT_APP}" --query "properties.configuration.ingress.fqdn" -o tsv)"

echo ""
echo "Supporting services migration complete."
echo "HL7 mock:  ${HL7_INTERNAL_FQDN}"
echo "HAPI FHIR: ${HAPI_INTERNAL_FQDN}"
echo "Superset:  ${SUPERSET_FQDN}"
echo "Tibabot:   ${TIBABOT_SA_FQDN}"
echo "API apps patched: ${TARGET_STAGING_API_APP}, ${TARGET_PROD_API_APP}"
echo "NOTE: Update Cloudflare CNAME for tibabot.vitora.nexora.africa to ${TIBABOT_SA_FQDN} when ready to cut over."

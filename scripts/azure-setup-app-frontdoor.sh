# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
#
# File purpose:
#   Provision the production web application's isolated endpoint inside the existing
#   Azure Front Door Standard profile. It creates an endpoint, origin group, ACA web
#   origin, and HTTPS route without changing the release-download endpoint.
#
# Usage:
#   bash scripts/azure-setup-app-frontdoor.sh
#
# Supported environment variables:
#   RG_NAME, PROFILE_NAME, ENDPOINT_NAME, ORIGIN_GROUP_NAME, ORIGIN_NAME,
#   ROUTE_NAME, WEB_ORIGIN_HOST. The script does not manage DNS, custom domains, or WAF policy binding.
set -euo pipefail

RG_NAME="${RG_NAME:-vitora-rg}"
PROFILE_NAME="${PROFILE_NAME:-vitora-cdn}"
ENDPOINT_NAME="${ENDPOINT_NAME:-vitoraappsa}"
ORIGIN_GROUP_NAME="${ORIGIN_GROUP_NAME:-web-origin-group}"
ORIGIN_NAME="${ORIGIN_NAME:-webapp-origin}"
ROUTE_NAME="${ROUTE_NAME:-webapp-route}"
WEB_ORIGIN_HOST="${WEB_ORIGIN_HOST:-vitora-webapp-prod-sa.wittysmoke-66276dae.southafricanorth.azurecontainerapps.io}"

ensure_profile() {
  if ! az afd profile show --resource-group "${RG_NAME}" --profile-name "${PROFILE_NAME}" >/dev/null 2>&1; then
    echo "ERROR: Expected existing Front Door profile '${PROFILE_NAME}' was not found in '${RG_NAME}'." >&2
    exit 1
  fi
}

ensure_endpoint() {
  if az afd endpoint show --resource-group "${RG_NAME}" --profile-name "${PROFILE_NAME}" --endpoint-name "${ENDPOINT_NAME}" >/dev/null 2>&1; then
    return
  fi

  az afd endpoint create \
    --resource-group "${RG_NAME}" \
    --profile-name "${PROFILE_NAME}" \
    --endpoint-name "${ENDPOINT_NAME}" \
    --enabled-state Enabled \
    --output none
}

ensure_origin_group() {
  if az afd origin-group show --resource-group "${RG_NAME}" --profile-name "${PROFILE_NAME}" --origin-group-name "${ORIGIN_GROUP_NAME}" >/dev/null 2>&1; then
    return
  fi

  az afd origin-group create \
    --resource-group "${RG_NAME}" \
    --profile-name "${PROFILE_NAME}" \
    --origin-group-name "${ORIGIN_GROUP_NAME}" \
    --probe-path "/login" \
    --probe-request-type GET \
    --probe-protocol Https \
    --probe-interval-in-seconds 100 \
    --sample-size 4 \
    --successful-samples-required 3 \
    --additional-latency-in-milliseconds 50 \
    --output none
}

ensure_origin() {
  if az afd origin show --resource-group "${RG_NAME}" --profile-name "${PROFILE_NAME}" --origin-group-name "${ORIGIN_GROUP_NAME}" --origin-name "${ORIGIN_NAME}" >/dev/null 2>&1; then
    return
  fi

  az afd origin create \
    --resource-group "${RG_NAME}" \
    --profile-name "${PROFILE_NAME}" \
    --origin-group-name "${ORIGIN_GROUP_NAME}" \
    --origin-name "${ORIGIN_NAME}" \
    --host-name "${WEB_ORIGIN_HOST}" \
    --origin-host-header "${WEB_ORIGIN_HOST}" \
    --https-port 443 \
    --priority 1 \
    --weight 1000 \
    --enabled-state Enabled \
    --output none
}

ensure_route() {
  if az afd route show --resource-group "${RG_NAME}" --profile-name "${PROFILE_NAME}" --endpoint-name "${ENDPOINT_NAME}" --route-name "${ROUTE_NAME}" >/dev/null 2>&1; then
    return
  fi

  az afd route create \
    --resource-group "${RG_NAME}" \
    --profile-name "${PROFILE_NAME}" \
    --endpoint-name "${ENDPOINT_NAME}" \
    --route-name "${ROUTE_NAME}" \
    --origin-group "${ORIGIN_GROUP_NAME}" \
    --patterns-to-match "/*" \
    --supported-protocols Http Https \
    --https-redirect Enabled \
    --forwarding-protocol HttpsOnly \
    --link-to-default-domain Enabled \
    --output none
}

az account show --output none
ensure_profile
ensure_endpoint
ensure_origin_group
ensure_origin
ensure_route

ENDPOINT_HOST=$(az afd endpoint show \
  --resource-group "${RG_NAME}" \
  --profile-name "${PROFILE_NAME}" \
  --endpoint-name "${ENDPOINT_NAME}" \
  --query hostName \
  --output tsv)

printf 'Front Door endpoint: https://%s\n' "${ENDPOINT_HOST}"
printf 'Release endpoint vitorareleases is unchanged.\n'
printf 'Next step: add app.vitora.digital as an AFD custom domain, validate DNS, then cut over the external DNS record.\n'

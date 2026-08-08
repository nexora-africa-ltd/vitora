#!/usr/bin/env bash
set -euo pipefail

# File purpose:
#   Run an automated go/no-go preflight before disabling PostgreSQL public access
#   and decommissioning old SA container app sets.
#
# Usage:
#   bash scripts/azure-phase2-preflight.sh
#
# Supported env args (all optional):
#   RG_NAME=vitora-rg-sa
#   PRIVATE_STAGING_APP=vitora-api-private-sa
#   PRIVATE_PROD_APP=vitora-api-prod-private-sa
#   OLD_STAGING_APP=vitora-api-sa
#   OLD_PROD_APP=vitora-api-prod-sa
#   STAGING_DB_HOST=vitora-staging-pg2-sa.postgres.database.azure.com
#   PROD_DB_HOST=vitora-prod-pg3-sa.postgres.database.azure.com
#   PRIVATE_DNS_ZONE=privatelink.postgres.database.azure.com
#   STAGING_DB_RECORD=vitora-staging-pg2-sa
#   PROD_DB_RECORD=vitora-prod-pg3-sa
#   SOAK_MINUTES=60
#   REQUIRE_OLD_APPS_ZERO_TRAFFIC=true

RG_NAME="${RG_NAME:-vitora-rg-sa}"
PRIVATE_STAGING_APP="${PRIVATE_STAGING_APP:-vitora-api-private-sa}"
PRIVATE_PROD_APP="${PRIVATE_PROD_APP:-vitora-api-prod-private-sa}"
OLD_STAGING_APP="${OLD_STAGING_APP:-vitora-api-sa}"
OLD_PROD_APP="${OLD_PROD_APP:-vitora-api-prod-sa}"

STAGING_DB_HOST="${STAGING_DB_HOST:-vitora-staging-pg2-sa.postgres.database.azure.com}"
PROD_DB_HOST="${PROD_DB_HOST:-vitora-prod-pg3-sa.postgres.database.azure.com}"

PRIVATE_DNS_ZONE="${PRIVATE_DNS_ZONE:-privatelink.postgres.database.azure.com}"
STAGING_DB_RECORD="${STAGING_DB_RECORD:-vitora-staging-pg2-sa}"
PROD_DB_RECORD="${PROD_DB_RECORD:-vitora-prod-pg3-sa}"

SOAK_MINUTES="${SOAK_MINUTES:-60}"
REQUIRE_OLD_APPS_ZERO_TRAFFIC="${REQUIRE_OLD_APPS_ZERO_TRAFFIC:-true}"

PASS_COUNT=0
FAIL_COUNT=0

pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  echo "PASS: $1"
}

fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  echo "FAIL: $1"
}

check_cmds() {
  for cmd in az curl python3; do
    if command -v "$cmd" >/dev/null 2>&1; then
      pass "command available: $cmd"
    else
      fail "missing command: $cmd"
    fi
  done
}

check_app_health_and_soak() {
  local app_name="$1"
  local fqdn
  local health
  local created
  local age_minutes
  local status

  if ! az containerapp show -g "$RG_NAME" -n "$app_name" -o none 2>/dev/null; then
    fail "container app missing: $app_name"
    return
  fi

  health="$(az containerapp revision list -g "$RG_NAME" -n "$app_name" --query '[?properties.active].properties.healthState | [0]' -o tsv)"
  created="$(az containerapp revision list -g "$RG_NAME" -n "$app_name" --query '[?properties.active].properties.createdTime | [0]' -o tsv)"

  if [[ "$health" == "Healthy" ]]; then
    pass "$app_name active revision is healthy"
  else
    fail "$app_name active revision health is '$health'"
  fi

  if [[ -n "$created" ]]; then
    age_minutes="$(python3 - <<PY
from datetime import datetime, timezone
created = "${created}"
created = created.replace('Z', '+00:00')
dt = datetime.fromisoformat(created)
if dt.tzinfo is None:
    dt = dt.replace(tzinfo=timezone.utc)
age = datetime.now(timezone.utc) - dt.astimezone(timezone.utc)
print(int(age.total_seconds() // 60))
PY
)"
    if [[ "$age_minutes" =~ ^[0-9]+$ ]] && (( age_minutes >= SOAK_MINUTES )); then
      pass "$app_name soak time ${age_minutes}m >= ${SOAK_MINUTES}m"
    else
      fail "$app_name soak time ${age_minutes:-unknown}m < ${SOAK_MINUTES}m"
    fi
  else
    fail "$app_name active revision creation time unavailable"
  fi

  fqdn="$(az containerapp show -g "$RG_NAME" -n "$app_name" --query properties.configuration.ingress.fqdn -o tsv)"
  if [[ -z "$fqdn" ]]; then
    fail "$app_name ingress FQDN missing"
    return
  fi

  status="$(curl -sS -m 60 -o /tmp/opencode/preflight-${app_name}.out -w "%{http_code}" "https://${fqdn}/" || true)"
  if [[ "$status" == "200" ]]; then
    pass "$app_name smoke curl returned HTTP 200"
  else
    fail "$app_name smoke curl returned HTTP ${status:-none}"
  fi
}

check_db_url_host() {
  local app_name="$1"
  local expected_host="$2"
  local db_url
  local actual_host

  db_url="$(az containerapp secret list -g "$RG_NAME" -n "$app_name" --show-values --query "[?name=='database-url'].value | [0]" -o tsv)"
  if [[ -z "$db_url" ]]; then
    fail "$app_name missing database-url secret"
    return
  fi

  actual_host="$(python3 - <<PY
from urllib.parse import urlparse
print(urlparse("""${db_url}""").hostname or "")
PY
)"

  if [[ "$actual_host" == "$expected_host" ]]; then
    pass "$app_name database-url host matches ${expected_host}"
  else
    fail "$app_name database-url host '${actual_host}' does not match '${expected_host}'"
  fi
}

check_private_dns_record() {
  local record_name="$1"
  local ip
  ip="$(az network private-dns record-set a show -g "$RG_NAME" -z "$PRIVATE_DNS_ZONE" -n "$record_name" --query "aRecords[0].ipv4Address" -o tsv 2>/dev/null || true)"
  if [[ -n "$ip" ]]; then
    pass "private DNS record exists: ${record_name}.${PRIVATE_DNS_ZONE} -> ${ip}"
  else
    fail "private DNS record missing: ${record_name}.${PRIVATE_DNS_ZONE}"
  fi
}

check_private_endpoint() {
  local pe_name="$1"
  if az network private-endpoint show -g "$RG_NAME" -n "$pe_name" -o none 2>/dev/null; then
    pass "private endpoint exists: $pe_name"
  else
    fail "private endpoint missing: $pe_name"
  fi
}

check_old_app_traffic_gate() {
  local app_name="$1"
  local total_weight
  local has_ingress

  if ! az containerapp show -g "$RG_NAME" -n "$app_name" -o none 2>/dev/null; then
    pass "legacy app absent (ok): $app_name"
    return
  fi

  has_ingress="$(az containerapp show -g "$RG_NAME" -n "$app_name" --query "properties.configuration.ingress != null" -o tsv)"
  if [[ "$has_ingress" == "false" ]]; then
    pass "legacy app ingress disabled (no external traffic): $app_name"
    return
  fi

  total_weight="$(az containerapp revision list -g "$RG_NAME" -n "$app_name" --query "sum([].properties.trafficWeight)" -o tsv 2>/dev/null || true)"
  total_weight="${total_weight:-0}"

  if [[ "$REQUIRE_OLD_APPS_ZERO_TRAFFIC" == "true" ]]; then
    if [[ "$total_weight" == "0" || "$total_weight" == "0.0" ]]; then
      pass "legacy app has zero traffic weight: $app_name"
    else
      fail "legacy app still has traffic weight ${total_weight}: $app_name"
    fi
  else
    pass "legacy app traffic gate skipped by REQUIRE_OLD_APPS_ZERO_TRAFFIC=false"
  fi
}

echo "==> Phase 2 DB private preflight"
echo "Resource group: $RG_NAME"
echo "Soak requirement: ${SOAK_MINUTES} minutes"
echo ""

check_cmds
check_app_health_and_soak "$PRIVATE_STAGING_APP"
check_app_health_and_soak "$PRIVATE_PROD_APP"
check_db_url_host "$PRIVATE_STAGING_APP" "$STAGING_DB_HOST"
check_db_url_host "$PRIVATE_PROD_APP" "$PROD_DB_HOST"
check_private_endpoint "${STAGING_DB_RECORD}-pe"
check_private_endpoint "${PROD_DB_RECORD}-pe"
check_private_dns_record "$STAGING_DB_RECORD"
check_private_dns_record "$PROD_DB_RECORD"
check_old_app_traffic_gate "$OLD_STAGING_APP"
check_old_app_traffic_gate "$OLD_PROD_APP"

echo ""
echo "Checks complete: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"

if (( FAIL_COUNT > 0 )); then
  echo "RESULT: NO-GO"
  exit 2
fi

echo "RESULT: GO"
exit 0

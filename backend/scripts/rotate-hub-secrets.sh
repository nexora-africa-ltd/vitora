# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
#!/usr/bin/env bash
#
# Rotates Vitora Hub secrets stored in .env on Linux installations.
#
# Usage:
#   sudo bash /opt/vitora/scripts/rotate-hub-secrets.sh --restart
#   sudo bash /opt/vitora/scripts/rotate-hub-secrets.sh \
#     --django-secret-key "..." --encryption-key "..." --pii-hmac-key "..." --restart
#
# Inputs:
#   - CLI flags (highest priority)
#   - Current process environment (fallback)
#   - Existing .env values (fallback)
#
# Notes:
#   - This script updates only secret keys by default.
#   - It keeps file permissions at 600.
#
set -euo pipefail

APP_DIR="/opt/vitora"
ENV_FILE=""
SERVICE_NAME="vitora-hub"
RESTART_SERVICE="false"

DJANGO_SECRET_KEY=""
ENCRYPTION_KEY=""
PII_HMAC_KEY=""
LICENSE_TOKEN=""
TIBABOT_API_KEY=""
TIBABOT_JWT_PRIVATE_KEY=""
TIBABOT_JWT_SECRET=""
TIBABOT_ADMIN_KEY=""

info()  { echo "[INFO] $*"; }
warn()  { echo "[WARN] $*"; }
error() { echo "[ERROR] $*" >&2; }

mask_secret() {
  local value="${1:-}"
  local len=${#value}
  if [[ -z "$value" ]]; then
    printf '(empty)'
    return
  fi
  if (( len <= 8 )); then
    printf '%*s' "$len" '' | tr ' ' '*'
    return
  fi
  printf '%s...%s' "${value:0:4}" "${value:len-4:4}"
}

usage() {
  cat <<'USAGE'
Usage:
  rotate-hub-secrets.sh [options]

Options:
  --app-dir <path>                 Hub install directory (default: /opt/vitora)
  --env-file <path>                Env file path (default: <app-dir>/.env)
  --service-name <name>            systemd service name (default: vitora-hub)
  --django-secret-key <value>      Set DJANGO_SECRET_KEY
  --encryption-key <value>         Set ENCRYPTION_KEY
  --pii-hmac-key <value>           Set PII_HMAC_KEY
  --license-token <value>          Set LICENSE_TOKEN
  --tibabot-api-key <value>        Set TIBABOT_API_KEY
  --tibabot-jwt-private-key <v>    Set TIBABOT_JWT_PRIVATE_KEY
  --tibabot-jwt-secret <value>     Set TIBABOT_JWT_SECRET
  --tibabot-admin-key <value>      Set TIBABOT_ADMIN_KEY
  --restart                        Restart service after writing .env
  --help                           Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir) APP_DIR="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --service-name) SERVICE_NAME="$2"; shift 2 ;;
    --django-secret-key) DJANGO_SECRET_KEY="$2"; shift 2 ;;
    --encryption-key) ENCRYPTION_KEY="$2"; shift 2 ;;
    --pii-hmac-key) PII_HMAC_KEY="$2"; shift 2 ;;
    --license-token) LICENSE_TOKEN="$2"; shift 2 ;;
    --tibabot-api-key) TIBABOT_API_KEY="$2"; shift 2 ;;
    --tibabot-jwt-private-key) TIBABOT_JWT_PRIVATE_KEY="$2"; shift 2 ;;
    --tibabot-jwt-secret) TIBABOT_JWT_SECRET="$2"; shift 2 ;;
    --tibabot-admin-key) TIBABOT_ADMIN_KEY="$2"; shift 2 ;;
    --restart) RESTART_SERVICE="true"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) error "Unknown option: $1"; usage; exit 1 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  error "Run as root (use sudo)."
  exit 1
fi

if [[ -z "$ENV_FILE" ]]; then
  ENV_FILE="$APP_DIR/.env"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  error "Env file not found: $ENV_FILE"
  exit 1
fi

get_env_value() {
  local key="$1"
  awk -F= -v k="$key" '$1==k {print substr($0, index($0, "=")+1); exit}' "$ENV_FILE"
}

resolve_value() {
  local key="$1"
  local explicit="$2"
  if [[ -n "$explicit" ]]; then
    printf '%s' "$explicit"
    return
  fi

  local envv="${!key:-}"
  if [[ -n "$envv" ]]; then
    printf '%s' "$envv"
    return
  fi

  printf '%s' "$(get_env_value "$key")"
}

upsert_key() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"

  awk -v k="$key" -v v="$value" -F= '
    BEGIN { found=0 }
    $1==k { print k "=" v; found=1; next }
    { print $0 }
    END { if (!found) print k "=" v }
  ' "$ENV_FILE" > "$tmp"

  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

resolved_django_secret_key="$(resolve_value "DJANGO_SECRET_KEY" "$DJANGO_SECRET_KEY")"
resolved_encryption_key="$(resolve_value "ENCRYPTION_KEY" "$ENCRYPTION_KEY")"
resolved_pii_hmac_key="$(resolve_value "PII_HMAC_KEY" "$PII_HMAC_KEY")"
resolved_license_token="$(resolve_value "LICENSE_TOKEN" "$LICENSE_TOKEN")"
resolved_tibabot_api_key="$(resolve_value "TIBABOT_API_KEY" "$TIBABOT_API_KEY")"
resolved_tibabot_jwt_private_key="$(resolve_value "TIBABOT_JWT_PRIVATE_KEY" "$TIBABOT_JWT_PRIVATE_KEY")"
resolved_tibabot_jwt_secret="$(resolve_value "TIBABOT_JWT_SECRET" "$TIBABOT_JWT_SECRET")"
resolved_tibabot_admin_key="$(resolve_value "TIBABOT_ADMIN_KEY" "$TIBABOT_ADMIN_KEY")"

upsert_key "DJANGO_SECRET_KEY" "$resolved_django_secret_key"
upsert_key "ENCRYPTION_KEY" "$resolved_encryption_key"
upsert_key "PII_HMAC_KEY" "$resolved_pii_hmac_key"
upsert_key "LICENSE_TOKEN" "$resolved_license_token"
upsert_key "TIBABOT_API_KEY" "$resolved_tibabot_api_key"
upsert_key "TIBABOT_JWT_PRIVATE_KEY" "$resolved_tibabot_jwt_private_key"
upsert_key "TIBABOT_JWT_SECRET" "$resolved_tibabot_jwt_secret"
upsert_key "TIBABOT_ADMIN_KEY" "$resolved_tibabot_admin_key"

chmod 600 "$ENV_FILE"

info "Updated secret keys in $ENV_FILE"
info "DJANGO_SECRET_KEY=$(mask_secret "$resolved_django_secret_key")"
info "ENCRYPTION_KEY=$(mask_secret "$resolved_encryption_key")"
info "PII_HMAC_KEY=$(mask_secret "$resolved_pii_hmac_key")"
info "LICENSE_TOKEN=$(mask_secret "$resolved_license_token")"
info "TIBABOT_API_KEY=$(mask_secret "$resolved_tibabot_api_key")"
info "TIBABOT_JWT_PRIVATE_KEY=$(mask_secret "$resolved_tibabot_jwt_private_key")"
info "TIBABOT_JWT_SECRET=$(mask_secret "$resolved_tibabot_jwt_secret")"
info "TIBABOT_ADMIN_KEY=$(mask_secret "$resolved_tibabot_admin_key")"

if [[ "$RESTART_SERVICE" == "true" ]]; then
  info "Restarting service: $SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    info "Service status: active"
  else
    warn "Service is not active after restart. Check: journalctl -u $SERVICE_NAME -n 100"
  fi
fi

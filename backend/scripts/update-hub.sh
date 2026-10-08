#!/usr/bin/env bash
# ============================================================================
# Vitora HMIS — Hub Update Script
#
# Updates an existing hub installation to the latest (or specified) version.
# Preserves database, configuration, and service settings.
# Keeps a single rolling pre-update backup at /opt/vitora/backup/pre-update-current.
#
# Usage:
#   sudo bash /opt/vitora/scripts/update-hub.sh
#   sudo bash /opt/vitora/scripts/update-hub.sh --version 0.4.0
# ============================================================================

set -euo pipefail

CDN_BASE_URL="https://get.vitora.digital"
APP_DIR="/opt/vitora"
VENV_DIR="${APP_DIR}/venv"
SERVICE_NAME="vitora-hub"
SYNC_SERVICE_NAME="vitora-hub-sync"
VERSION=""
BACKUP_DIR="${APP_DIR}/backup"
BACKUP_PATH="${BACKUP_DIR}/pre-update-current"
HUB_RELEASE_BASE=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

fetch_latest_version() {
    local manifest_url manifest_json parsed_version
    local candidates=(
        "${CDN_BASE_URL}/hub/latest.json"
        "${CDN_BASE_URL}/releases/hub/latest.json"
    )

    for manifest_url in "${candidates[@]}"; do
        manifest_json=$(curl -fsSL "$manifest_url" 2>/dev/null || true)
        if [[ -z "$manifest_json" ]]; then
            continue
        fi
        parsed_version=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('version',''))" <<<"$manifest_json" 2>/dev/null || true)
        if [[ -n "$parsed_version" ]]; then
            HUB_RELEASE_BASE="${manifest_url%/latest.json}"
            echo "$parsed_version"
            return 0
        fi
    done

    return 1
}

resolve_artifact_url() {
    local artifact_name="$1"
    local url
    local candidates=()

    if [[ -n "$HUB_RELEASE_BASE" ]]; then
        candidates+=("${HUB_RELEASE_BASE}/${artifact_name}")
    fi
    candidates+=(
        "${CDN_BASE_URL}/hub/${artifact_name}"
        "${CDN_BASE_URL}/releases/hub/${artifact_name}"
    )

    for url in "${candidates[@]}"; do
        if curl -fsSL "$url" -o "$TEMP"; then
            echo "$url"
            return 0
        fi
    done

    return 1
}

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --version|-v) VERSION="$2"; shift 2 ;;
        *) shift ;;
    esac
done

if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (use sudo)."
    exit 1
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
    error "No hub installation found at $APP_DIR. Run install-hub.sh first."
    exit 1
fi

# Current version
CURRENT_VERSION=$(cat "$APP_DIR/VERSION" 2>/dev/null || echo "unknown")
info "Current version: $CURRENT_VERSION"

# Resolve target version
if [[ -z "$VERSION" ]]; then
    info "Fetching latest release..."
    VERSION=$(fetch_latest_version || true)
    if [[ -z "$VERSION" ]]; then
        error "Failed to fetch latest version manifest. Tried:"
        error "  ${CDN_BASE_URL}/hub/latest.json"
        error "  ${CDN_BASE_URL}/releases/hub/latest.json"
        exit 1
    fi
fi

if [[ "$VERSION" == "$CURRENT_VERSION" ]]; then
    info "Already on version $VERSION. Nothing to do."
    exit 0
fi

info "Updating to version: $VERSION"

# Download
ARTIFACT="vitora-hub-${VERSION}.tar.gz"
TEMP="/tmp/${ARTIFACT}"

URL=$(resolve_artifact_url "$ARTIFACT" || true)
if [[ -z "$URL" ]]; then
    error "Failed to download. Tried:"
    error "  ${CDN_BASE_URL}/hub/${ARTIFACT}"
    error "  ${CDN_BASE_URL}/releases/hub/${ARTIFACT}"
    exit 1
fi
info "Downloading ${URL}..."

# Stop services before migrating SQLite schema.
info "Stopping hub API and sync services..."
for job in vitora-hub-backup vitora-hub-backup-upload vitora-hub-backup-verify; do
    if systemctl list-unit-files "${job}.timer" --no-legend 2>/dev/null | grep -q "$job"; then
        systemctl stop "${job}.timer" "${job}.service"
    fi
done
if systemctl list-unit-files "${SYNC_SERVICE_NAME}.service" --no-legend 2>/dev/null | grep -q "${SYNC_SERVICE_NAME}"; then
    systemctl stop "$SYNC_SERVICE_NAME" || true
fi
systemctl stop "$SERVICE_NAME"

# Backup current code (not data — that's in /var/lib/vitora)
info "Creating rolling pre-update backup..."
mkdir -p "$BACKUP_DIR"
rm -rf "$BACKUP_PATH"
mkdir -p "$BACKUP_PATH"

BACKUP_ITEMS=("hmis" "manage.py" "requirements-hub.txt" "VERSION" "scripts")
for item in "${BACKUP_ITEMS[@]}"; do
    if [[ -e "$APP_DIR/$item" ]]; then
        mv "$APP_DIR/$item" "$BACKUP_PATH/$item"
    fi
done
info "Rolling pre-update backup stored at: $BACKUP_PATH"

# Extract new code
info "Extracting new version..."
tar -xzf "$TEMP" -C "$APP_DIR" --strip-components=1
rm -f "$TEMP"

# Update dependencies
info "Updating Python dependencies..."
source "$VENV_DIR/bin/activate"
pip install --quiet --upgrade pip
if [[ -f "$APP_DIR/requirements-hub.txt" ]]; then
    pip install --quiet --require-hashes -r "$APP_DIR/requirements-hub.txt"
fi

# Run migrations
info "Running database migrations..."
source "$APP_DIR/.env" 2>/dev/null || true
HUB_SECRETS_FILE="${HUB_SECRETS_FILE:-/var/lib/vitora/secrets/hub-secrets.cred}"
LEGACY_HUB_SECRETS_FILE="/var/lib/vitora/secrets/hub-secrets.env"
if [[ -f "$HUB_SECRETS_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source <(systemd-creds decrypt "$HUB_SECRETS_FILE" -)
    set +a
elif [[ -f "$LEGACY_HUB_SECRETS_FILE" ]]; then
    # One-time migration path for hubs released before protected credentials.
    set -a
    # shellcheck disable=SC1090
    source "$LEGACY_HUB_SECRETS_FILE"
    set +a
fi

if [[ -z "${CLOUD_API_BASE_URL:-}" && -n "${SYNC_SERVER_URL:-}" ]]; then
    CLOUD_API_BASE_URL="${SYNC_SERVER_URL%/api/sync}"
    if [[ "$CLOUD_API_BASE_URL" == "$SYNC_SERVER_URL" ]]; then
        CLOUD_API_BASE_URL="${SYNC_SERVER_URL%/}"
    fi
    if grep -q '^CLOUD_API_BASE_URL=' "$APP_DIR/.env"; then
        sed -i "s|^CLOUD_API_BASE_URL=.*|CLOUD_API_BASE_URL=${CLOUD_API_BASE_URL}|" "$APP_DIR/.env"
    else
        printf '\nCLOUD_API_BASE_URL=%s\n' "$CLOUD_API_BASE_URL" >> "$APP_DIR/.env"
    fi
    export CLOUD_API_BASE_URL
fi
export DJANGO_ENV=hub
export DJANGO_SETTINGS_MODULE=hmis.settings

# Snapshot the current database encryption epoch and its protected key bundle
# together, before re-enrollment or conversion can change either one.
HUB_DATABASE_PATH="${HUB_DB_PATH:-${APP_DIR}/data/hub.sqlite3}"
RUNTIME_SNAPSHOT="$BACKUP_PATH/runtime-state"
RUNTIME_HELPER="$BACKUP_PATH/hub-update-state.py"
cp "$APP_DIR/scripts/hub-update-state.py" "$RUNTIME_HELPER"
"$VENV_DIR/bin/python" "$RUNTIME_HELPER" capture --snapshot "$RUNTIME_SNAPSHOT" \
    --database "$HUB_DATABASE_PATH" \
    --sync-state "${HUB_DATA_DIR:-$(dirname "$HUB_DATABASE_PATH")}/.hub_sync_state.json" \
    --secrets "$HUB_SECRETS_FILE" --env "$APP_DIR/.env" \
    --device-key "/var/lib/vitora/secrets/device-x25519.pem"

rollback_update() {
    trap - ERR
    systemctl stop "$SERVICE_NAME" "$SYNC_SERVICE_NAME" || true
    for item in "${BACKUP_ITEMS[@]}"; do
        rm -rf "$APP_DIR/$item"
        if [[ -e "$BACKUP_PATH/$item" ]]; then
            cp -a "$BACKUP_PATH/$item" "$APP_DIR/$item"
        fi
    done
    "$VENV_DIR/bin/python" "$RUNTIME_HELPER" restore --snapshot "$RUNTIME_SNAPSHOT"
    error "Previous database and protected credentials restored; services remain stopped for verification."
    exit 1
}
trap rollback_update ERR

# Protocol-v2 migration for existing hubs. The current license JWT authorizes
# only its own Installation, so no admin password or activation code is kept
# on disk. Generate to a temporary file and replace the key only after the
# cloud has returned an envelope that decrypts successfully.
if [[ -z "${LICENSE_TOKEN:-}" || -z "${HUB_ID:-}" || -z "${HUB_ORGANIZATION_ID:-}" || -z "${HUB_FACILITY_ID:-}" ]]; then
    error "Cannot re-enroll this hub: LICENSE_TOKEN, HUB_ID, HUB_ORGANIZATION_ID, and HUB_FACILITY_ID are required."
    exit 1
fi
info "Re-enrolling existing hub device key with the cloud..."
DEVICE_KEY_DIR="/var/lib/vitora/secrets"
DEVICE_PRIVATE_KEY="${DEVICE_KEY_DIR}/device-x25519.pem"
mkdir -p "$DEVICE_KEY_DIR"
chmod 700 "$DEVICE_KEY_DIR"
TEMP_DEVICE_PRIVATE_KEY=$(mktemp "${DEVICE_KEY_DIR}/device-x25519.XXXXXX.pem")
REENROLL_RESPONSE=$(mktemp)
trap 'rm -f "$TEMP_DEVICE_PRIVATE_KEY" "$REENROLL_RESPONSE"' EXIT
DEVICE_PUBLIC_KEY=$("$VENV_DIR/bin/python" - "$TEMP_DEVICE_PRIVATE_KEY" <<'PY'
import base64
import sys
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat, PublicFormat

key = X25519PrivateKey.generate()
with open(sys.argv[1], "wb") as output:
    output.write(key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()))
print(base64.b64encode(key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode("ascii"))
PY
)
REENROLL_PAYLOAD=$("$VENV_DIR/bin/python" - "$DEVICE_PUBLIC_KEY" "$HUB_ID" <<'PY'
import json
import sys
print(json.dumps({"protocol_version": 2, "device_public_key": sys.argv[1], "installation_id": sys.argv[2]}))
PY
)
curl -fsS -o "$REENROLL_RESPONSE" -X POST "${CLOUD_API_BASE_URL%/}/api/licensing/re-enroll/" \
    -H "Content-Type: application/json" -H "X-License-Token: ${LICENSE_TOKEN}" -d "$REENROLL_PAYLOAD"
HUB_SECRETS_PLAINTEXT=$(mktemp "${DEVICE_KEY_DIR}/hub-secrets.XXXXXX.env")
PII_KEY_PACKAGE_B64=$("$VENV_DIR/bin/python" - "$REENROLL_RESPONSE" "$TEMP_DEVICE_PRIVATE_KEY" "$HUB_SECRETS_PLAINTEXT" "$HUB_ID" "$HUB_ORGANIZATION_ID" "$HUB_FACILITY_ID" <<'PY'
import base64
import json
import os
import secrets as stdlib_secrets
import sys
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from hmis.apps.licensing.activation_secrets import decrypt_activation_secrets

response, private_path, output, installation_id, organization_id, facility_id = sys.argv[1:]
with open(private_path, "rb") as key_file, open(response, encoding="utf-8") as response_file:
    secrets = decrypt_activation_secrets(json.load(response_file)["secrets_envelope"], load_pem_private_key(key_file.read(), password=None), installation_id=installation_id, organization_id=int(organization_id), facility_id=int(facility_id))
package = secrets.pop("organization_pii_key_package")
# Re-enrollment refreshes cloud-issued secrets only. The per-hub SQLCipher key
# stays local and must never rotate as a side effect of an update. Keep
# encryption disabled in this temporary bundle until an older plaintext DB has
# been converted and the key has been verified below.
secrets["hub_database_encryption_required"] = "false"
secrets["hub_database_encryption_key"] = os.environ.get("HUB_DATABASE_ENCRYPTION_KEY") or ""
temporary = f"{output}.new"
with open(temporary, "w", encoding="utf-8") as secret_file:
    for name, value in secrets.items():
        secret_file.write(f"{name.upper()}={value}\n")
os.chmod(temporary, 0o600)
os.replace(temporary, output)
print(base64.b64encode(json.dumps(package, separators=(",", ":")).encode("utf-8")).decode("ascii"))
PY
)
mv -f "$TEMP_DEVICE_PRIVATE_KEY" "$DEVICE_PRIVATE_KEY"
chmod 600 "$DEVICE_PRIVATE_KEY" "$HUB_SECRETS_PLAINTEXT"
LICENSE_TOKEN=$("$VENV_DIR/bin/python" - "$REENROLL_RESPONSE" <<'PY'
import json
import sys
print(json.load(open(sys.argv[1], encoding="utf-8"))["license_token"])
PY
)
printf 'LICENSE_TOKEN=%s\n' "$LICENSE_TOKEN" >> "$HUB_SECRETS_PLAINTEXT"
printf 'DJANGO_SECRET_KEY=%s\n' "$DJANGO_SECRET_KEY" >> "$HUB_SECRETS_PLAINTEXT"

# Existing hubs may have a plaintext SQLite database. Use the newly available
# bundle key to verify an already encrypted DB, or convert a plaintext one,
# before persisting the required flag and allowing services to restart.
set -a
# shellcheck disable=SC1090
source "$HUB_SECRETS_PLAINTEXT"
set +a
HUB_DATABASE_ENCRYPTION_REQUIRED=false
export HUB_DATABASE_ENCRYPTION_REQUIRED HUB_DATABASE_ENCRYPTION_KEY
HUB_DATABASE_PATH="${HUB_DB_PATH:-${APP_DIR}/data/hub.sqlite3}"
if [[ -z "$HUB_DATABASE_ENCRYPTION_KEY" ]]; then
    if [[ -f "$HUB_DATABASE_PATH" ]]; then
        info "Local SQLCipher key is absent; requesting cloud recovery..."
        if ! HUB_DATABASE_ENCRYPTION_KEY=$("$VENV_DIR/bin/python" "$APP_DIR/scripts/hub_database_key_escrow.py" recover); then
            error "Cloud database-key recovery failed; this encrypted database cannot be opened and remains unavailable."
            rollback_update
        fi
        export HUB_DATABASE_ENCRYPTION_KEY
        sed -i "s|^HUB_DATABASE_ENCRYPTION_KEY=.*|HUB_DATABASE_ENCRYPTION_KEY=${HUB_DATABASE_ENCRYPTION_KEY}|" "$HUB_SECRETS_PLAINTEXT"
        info "Cloud database-key recovery completed."
    else
        HUB_DATABASE_ENCRYPTION_KEY=$("$VENV_DIR/bin/python" -c 'import secrets; print(secrets.token_urlsafe(64))')
        export HUB_DATABASE_ENCRYPTION_KEY
        sed -i "s|^HUB_DATABASE_ENCRYPTION_KEY=.*|HUB_DATABASE_ENCRYPTION_KEY=${HUB_DATABASE_ENCRYPTION_KEY}|" "$HUB_SECRETS_PLAINTEXT"
    fi
fi
if [[ -f "$HUB_DATABASE_PATH" ]]; then
    info "Verifying hub database encryption..."
    HUB_DATABASE_KEY_STATUS=$("$VENV_DIR/bin/python" "$APP_DIR/manage.py" hub_database_key_status --database "$HUB_DATABASE_PATH")
    if ! "$VENV_DIR/bin/python" - "$HUB_DATABASE_KEY_STATUS" <<'PY'
import json
import sys
sys.exit(0 if json.loads(sys.argv[1]).get("status") == "valid" else 1)
PY
    then
        if ! "$VENV_DIR/bin/python" - "$HUB_DATABASE_KEY_STATUS" <<'PY'
import json
import sys
sys.exit(0 if json.loads(sys.argv[1]).get("status") == "plaintext" else 1)
PY
        then
            error "Database is not verified plaintext and the key is invalid; refusing conversion."
            rollback_update
        fi
        info "Converting plaintext hub database to SQLCipher..."
        "$VENV_DIR/bin/python" "$APP_DIR/manage.py" hub_encrypt_database --database "$HUB_DATABASE_PATH"
        HUB_DATABASE_KEY_STATUS=$("$VENV_DIR/bin/python" "$APP_DIR/manage.py" hub_database_key_status --database "$HUB_DATABASE_PATH")
        if ! "$VENV_DIR/bin/python" - "$HUB_DATABASE_KEY_STATUS" <<'PY'
import json
import sys
sys.exit(0 if json.loads(sys.argv[1]).get("status") == "valid" else 1)
PY
        then
            error "SQLCipher key verification failed after database conversion."
            rollback_update
        fi
    fi
else
    info "No existing hub database found; a new encrypted database will be created by migrations."
fi
sed -i 's/^HUB_DATABASE_ENCRYPTION_REQUIRED=.*/HUB_DATABASE_ENCRYPTION_REQUIRED=true/' "$HUB_SECRETS_PLAINTEXT"
HUB_DATABASE_ENCRYPTION_REQUIRED=true
export HUB_DATABASE_ENCRYPTION_REQUIRED
if ! command -v systemd-creds &>/dev/null; then
    error "systemd-creds is required for protected hub secret storage."
    rollback_update
fi
systemd-creds encrypt --with-key=host "$HUB_SECRETS_PLAINTEXT" "$HUB_SECRETS_FILE"
rm -f "$HUB_SECRETS_PLAINTEXT"
rm -f "$LEGACY_HUB_SECRETS_FILE"
chmod 600 "$DEVICE_PRIVATE_KEY" "$HUB_SECRETS_FILE"
chown vitora:vitora "$DEVICE_PRIVATE_KEY" "$HUB_SECRETS_FILE"
if "$VENV_DIR/bin/python" "$APP_DIR/scripts/hub_database_key_escrow.py" submit; then
    info "Cloud database-key escrow enrollment completed."
else
    warn "Cloud database-key escrow enrollment failed; this hub is not cloud-recoverable until enrollment succeeds."
fi
sed -i '/^\(DJANGO_SECRET_KEY\|ENCRYPTION_KEY\|PII_HMAC_KEY\|LICENSE_TOKEN\)=/d' "$APP_DIR/.env"
chmod 750 "$APP_DIR/scripts/start-hub-linux.sh"
chown root:vitora "$APP_DIR/scripts/start-hub-linux.sh"

install_backup_schedule() {
    local unit_name="$1"
    local launcher_mode="$2"
    local timer_config="$3"
    cat > "/etc/systemd/system/${unit_name}.service" <<EOF
[Unit]
Description=Vitora HMIS Hub ${unit_name#vitora-hub-}
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=vitora
Group=vitora
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
LoadCredentialEncrypted=hub-secrets:${HUB_SECRETS_FILE}
ExecStart=${APP_DIR}/scripts/start-hub-linux.sh ${launcher_mode}
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/vitora /var/log/vitora
PrivateTmp=true
StandardOutput=append:/var/log/vitora/${unit_name}.log
StandardError=append:/var/log/vitora/${unit_name}-error.log
EOF

    cat > "/etc/systemd/system/${unit_name}.timer" <<EOF
[Unit]
Description=Schedule ${unit_name}

[Timer]
${timer_config}
Persistent=true
Unit=${unit_name}.service

[Install]
WantedBy=timers.target
EOF
}

# Recreate schedule units on update so their launcher and encrypted credential
# context stay aligned with the updated hub service.
install_backup_schedule "vitora-hub-backup" "backup" "OnCalendar=daily"
install_backup_schedule "vitora-hub-backup-upload" "backup-upload" "OnUnitActiveSec=30min"
install_backup_schedule "vitora-hub-backup-verify" "backup-verify" "OnCalendar=weekly"
HUB_PORT="${HUB_PORT:-9088}"
mkdir -p "/etc/systemd/system/${SERVICE_NAME}.service.d" "/etc/systemd/system/${SYNC_SERVICE_NAME}.service.d"
cat > "/etc/systemd/system/${SERVICE_NAME}.service.d/credentials.conf" <<EOF
[Service]
EnvironmentFile=${APP_DIR}/.env
LoadCredentialEncrypted=hub-secrets:${HUB_SECRETS_FILE}
ExecStart=
ExecStart=${APP_DIR}/scripts/start-hub-linux.sh api
EOF
cat > "/etc/systemd/system/${SYNC_SERVICE_NAME}.service.d/credentials.conf" <<EOF
[Service]
EnvironmentFile=${APP_DIR}/.env
LoadCredentialEncrypted=hub-secrets:${HUB_SECRETS_FILE}
ExecStart=
ExecStart=${APP_DIR}/scripts/start-hub-linux.sh sync
EOF
systemctl daemon-reload
"$VENV_DIR/bin/python" "$APP_DIR/manage.py" migrate --no-input
printf '%s' "$PII_KEY_PACKAGE_B64" | base64 --decode | "$VENV_DIR/bin/python" "$APP_DIR/manage.py" seed_from_activation --response-file="$REENROLL_RESPONSE" --skip-locations --pii-key-package-stdin
rm -f "$REENROLL_RESPONSE"
trap - EXIT
"$VENV_DIR/bin/python" manage.py collectstatic --no-input 2>/dev/null || true

# Restart service
info "Starting hub service..."
if command -v ufw &>/dev/null; then
    ufw allow 19088/udp comment "Vitora Hub Discovery" 2>/dev/null || true
fi
systemctl start "$SERVICE_NAME"
if systemctl list-unit-files "${SYNC_SERVICE_NAME}.service" --no-legend 2>/dev/null | grep -q "${SYNC_SERVICE_NAME}"; then
    systemctl start "$SYNC_SERVICE_NAME"
fi

# Verify
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    trap - ERR
    systemctl enable --now vitora-hub-backup.timer
    systemctl enable --now vitora-hub-backup-upload.timer
    systemctl enable --now vitora-hub-backup-verify.timer
    info "Update complete! Now running version $VERSION"
else
    error "Service failed to start after update."
    rollback_update
fi

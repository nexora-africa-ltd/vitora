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

# Stop service
info "Stopping hub service..."
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
export DJANGO_ENV=hub
export DJANGO_SETTINGS_MODULE=hmis.settings
"$VENV_DIR/bin/python" manage.py migrate --no-input
"$VENV_DIR/bin/python" manage.py collectstatic --no-input 2>/dev/null || true

# Restart service
info "Starting hub service..."
systemctl start "$SERVICE_NAME"

# Verify
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    info "Update complete! Now running version $VERSION"
else
    error "Service failed to start after update."
    warn "Restoring previous version..."
    if [[ -d "$BACKUP_PATH" ]]; then
        for item in "${BACKUP_ITEMS[@]}"; do
            rm -rf "$APP_DIR/$item"
            if [[ -e "$BACKUP_PATH/$item" ]]; then
                mv "$BACKUP_PATH/$item" "$APP_DIR/$item"
            fi
        done
        systemctl start "$SERVICE_NAME" || true
        warn "Rolled back from $BACKUP_PATH. Check logs: journalctl -u $SERVICE_NAME -n 50"
    fi
    exit 1
fi

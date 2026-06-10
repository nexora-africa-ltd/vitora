#!/usr/bin/env bash
# ============================================================================
# Vitora HMIS — Hub Update Script
#
# Updates an existing hub installation to the latest (or specified) version.
# Preserves database, configuration, and service settings.
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

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

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
    VERSION=$(curl -fsSL "${CDN_BASE_URL}/hub/latest.json" \
        | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])" 2>/dev/null)
fi

if [[ "$VERSION" == "$CURRENT_VERSION" ]]; then
    info "Already on version $VERSION. Nothing to do."
    exit 0
fi

info "Updating to version: $VERSION"

# Download
ARTIFACT="vitora-hub-${VERSION}.tar.gz"
URL="${CDN_BASE_URL}/hub/${ARTIFACT}"
TEMP="/tmp/${ARTIFACT}"

info "Downloading ${URL}..."
curl -fsSL "$URL" -o "$TEMP" || {
    error "Failed to download. Check version exists."
    exit 1
}

# Stop service
info "Stopping hub service..."
systemctl stop "$SERVICE_NAME"

# Backup current code (not data — that's in /var/lib/vitora)
if [[ -d "$APP_DIR/hmis" ]]; then
    mv "$APP_DIR/hmis" "$APP_DIR/hmis.bak.$(date +%Y%m%d%H%M%S)"
fi

# Extract new code
info "Extracting new version..."
tar -xzf "$TEMP" -C "$APP_DIR" --strip-components=1
rm -f "$TEMP"

# Update dependencies
info "Updating Python dependencies..."
source "$VENV_DIR/bin/activate"
pip install --quiet --upgrade pip
if [[ -f "$APP_DIR/requirements-hub.txt" ]]; then
    pip install --quiet -r "$APP_DIR/requirements-hub.txt"
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

# Clean old backups (keep last 3)
ls -dt "$APP_DIR"/hmis.bak.* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true

# Verify
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    info "Update complete! Now running version $VERSION"
else
    error "Service failed to start after update."
    warn "Restoring previous version..."
    LATEST_BACKUP=$(ls -dt "$APP_DIR"/hmis.bak.* 2>/dev/null | head -1)
    if [[ -n "$LATEST_BACKUP" ]]; then
        rm -rf "$APP_DIR/hmis"
        mv "$LATEST_BACKUP" "$APP_DIR/hmis"
        systemctl start "$SERVICE_NAME"
        warn "Rolled back. Check logs: journalctl -u $SERVICE_NAME -n 50"
    fi
    exit 1
fi

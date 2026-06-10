#!/usr/bin/env bash
# ============================================================================
# Vitora HMIS — Facility Hub Installer
#
# Installs and configures the Django backend as a local facility hub.
# Designed for Ubuntu/Debian on a Raspberry Pi or dedicated facility PC.
#
# Downloads a pre-built release artifact from GitHub Releases — no repo clone needed.
#
# Usage:
#   curl -sSL https://get.vitora.digital/hub | sudo bash
#   # or with a specific version:
#   curl -sSL https://get.vitora.digital/hub | sudo bash -s -- --version 0.3.1
#   # or locally:
#   sudo bash scripts/install-hub.sh --version 0.3.1
#
# Prerequisites:
#   - Ubuntu 22.04+ or Debian 12+
#   - Python 3.11+
#   - 2GB+ RAM recommended
#   - curl or wget
# ============================================================================

set -euo pipefail

# --- Configuration ---
CDN_BASE_URL="https://get.vitora.digital"
APP_USER="vitora"
APP_DIR="/opt/vitora"
VENV_DIR="${APP_DIR}/venv"
SERVICE_NAME="vitora-hub"
HUB_PORT="${HUB_PORT:-9088}"
LOG_DIR="/var/log/vitora"
DB_DIR="/var/lib/vitora"
VERSION=""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
step()  { echo -e "${CYAN}[STEP]${NC} $*"; }

# --- Parse arguments ---
while [[ $# -gt 0 ]]; do
    case $1 in
        --version|-v) VERSION="$2"; shift 2 ;;
        --port|-p) HUB_PORT="$2"; shift 2 ;;
        --non-interactive) NON_INTERACTIVE=true; shift ;;
        --help|-h)
            echo "Usage: install-hub.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --version, -v    Specify release version (default: latest)"
            echo "  --port, -p       Hub port (default: 9088)"
            echo "  --non-interactive  Skip prompts (use env vars for config)"
            echo "  --help, -h       Show this help"
            exit 0
            ;;
        *) error "Unknown option: $1"; exit 1 ;;
    esac
done

NON_INTERACTIVE="${NON_INTERACTIVE:-false}"

# --- Pre-checks ---
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (use sudo)."
    exit 1
fi

# Check for curl or wget
if command -v curl &>/dev/null; then
    DOWNLOADER="curl"
elif command -v wget &>/dev/null; then
    DOWNLOADER="wget"
else
    error "curl or wget is required. Install with: apt install curl"
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    error "Python 3 is required. Install with: apt install python3 python3-venv python3-pip"
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
if [[ "$PYTHON_MAJOR" -lt 3 ]] || [[ "$PYTHON_MAJOR" -eq 3 && "$PYTHON_MINOR" -lt 11 ]]; then
    error "Python 3.11+ required (found $PYTHON_VERSION)."
    exit 1
fi

# --- Download helper ---
download() {
    local url="$1"
    local dest="$2"
    if [[ "$DOWNLOADER" == "curl" ]]; then
        curl -fsSL "$url" -o "$dest"
    else
        wget -q "$url" -O "$dest"
    fi
}

# --- Resolve version ---
resolve_version() {
    if [[ -n "$VERSION" ]]; then
        echo "$VERSION"
        return
    fi

    info "Fetching latest release version..."
    local latest_url="${CDN_BASE_URL}/hub/latest.json"
    local ver

    if [[ "$DOWNLOADER" == "curl" ]]; then
        ver=$(curl -fsSL "$latest_url" | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])" 2>/dev/null)
    else
        ver=$(wget -qO- "$latest_url" | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])" 2>/dev/null)
    fi

    if [[ -z "$ver" ]]; then
        error "Could not determine latest version. Use --version to specify manually."
        exit 1
    fi

    echo "$ver"
}

# --- Banner ---
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║        Vitora HMIS — Facility Hub Installer      ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# --- Resolve version and download URL ---
VERSION=$(resolve_version)
ARTIFACT_NAME="vitora-hub-${VERSION}.tar.gz"
DOWNLOAD_URL="${CDN_BASE_URL}/hub/${ARTIFACT_NAME}"

info "Version: ${VERSION}"
info "Download: ${DOWNLOAD_URL}"
echo ""

# --- Interactive Setup ---
if [[ "$NON_INTERACTIVE" == "true" ]]; then
    # Use environment variables in non-interactive mode
    HUB_ID="${HUB_ID:?HUB_ID environment variable required in non-interactive mode}"
    HUB_FACILITY_ID="${HUB_FACILITY_ID:?HUB_FACILITY_ID environment variable required}"
    HUB_ORGANIZATION_ID="${HUB_ORGANIZATION_ID:?HUB_ORGANIZATION_ID environment variable required}"
    SYNC_URL="${SYNC_URL:-https://api.vitora.digital/api/sync}"
    ENCRYPTION_KEY="${ENCRYPTION_KEY:?ENCRYPTION_KEY environment variable required}"
else
    echo "Enter the configuration values from your Vitora cloud admin panel."
    echo "(These are found at: Settings → Facilities → Hub Setup)"
    echo ""

    read -rp "  Hub ID (unique name for this hub, e.g. 'reception-hub-1'): " HUB_ID
    read -rp "  Facility ID (from cloud admin): " HUB_FACILITY_ID
    read -rp "  Organization ID (from cloud admin): " HUB_ORGANIZATION_ID
    read -rp "  Cloud Sync URL [https://api.vitora.digital/api/sync]: " SYNC_URL
    SYNC_URL="${SYNC_URL:-https://api.vitora.digital/api/sync}"
    read -rsp "  Encryption Key (must match cloud — hidden): " ENCRYPTION_KEY
    echo ""

    echo ""
    info "Configuration summary:"
    echo "  Hub ID:          $HUB_ID"
    echo "  Facility:        $HUB_FACILITY_ID"
    echo "  Organization:    $HUB_ORGANIZATION_ID"
    echo "  Cloud Sync URL:  $SYNC_URL"
    echo "  Port:            $HUB_PORT"
    echo ""
    read -rp "Proceed with installation? [y/N]: " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || { info "Cancelled."; exit 0; }
fi

# --- System Setup ---
step "1/7 Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq python3-venv python3-pip python3-dev \
    build-essential libffi-dev libssl-dev sqlite3

# Create application user
if ! id -u "$APP_USER" &>/dev/null; then
    info "Creating system user: $APP_USER"
    useradd --system --home-dir "$APP_DIR" --shell /bin/false "$APP_USER"
fi

# Create directories
mkdir -p "$APP_DIR" "$LOG_DIR" "$DB_DIR"
chown "$APP_USER:$APP_USER" "$LOG_DIR" "$DB_DIR"

# --- Download Release Artifact ---
step "2/7 Downloading Vitora Hub v${VERSION}..."
TEMP_ARCHIVE="/tmp/${ARTIFACT_NAME}"

download "$DOWNLOAD_URL" "$TEMP_ARCHIVE" || {
    error "Failed to download release artifact."
    error "URL: $DOWNLOAD_URL"
    error "Check that version '${VERSION}' is published at:"
    error "  ${CDN_BASE_URL}/hub/latest.json"
    exit 1
}

info "Extracting to ${APP_DIR}..."
tar -xzf "$TEMP_ARCHIVE" -C "$APP_DIR" --strip-components=1
rm -f "$TEMP_ARCHIVE"

# Verify extraction
if [[ ! -f "$APP_DIR/manage.py" ]]; then
    error "Extraction failed: manage.py not found in $APP_DIR"
    exit 1
fi

# --- Python Environment ---
step "3/7 Setting up Python environment..."
python3 -m venv "$VENV_DIR"
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

pip install --quiet --upgrade pip

# Install from pre-built wheel or requirements
if [[ -f "$APP_DIR/requirements-hub.txt" ]]; then
    pip install --quiet -r "$APP_DIR/requirements-hub.txt"
elif [[ -f "$APP_DIR/requirements.txt" ]]; then
    pip install --quiet -r "$APP_DIR/requirements.txt"
fi

# Production ASGI server
pip install --quiet daphne whitenoise

# --- Environment File ---
step "4/7 Writing configuration..."
cat > "$APP_DIR/.env" <<EOF
# Vitora Hub Configuration — generated by install-hub.sh
DJANGO_ENV=hub
DJANGO_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")
ENCRYPTION_KEY=${ENCRYPTION_KEY}
HUB_ID=${HUB_ID}
HUB_FACILITY_ID=${HUB_FACILITY_ID}
HUB_ORGANIZATION_ID=${HUB_ORGANIZATION_ID}
HUB_PORT=${HUB_PORT}
HUB_DB_PATH=${DB_DIR}/hub.sqlite3
HUB_LOG_FILE=${LOG_DIR}/hub.log
SYNC_SERVER_URL=${SYNC_URL}
ALLOWED_HOSTS=*
HUB_VERSION=${VERSION}
EOF

chmod 600 "$APP_DIR/.env"
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"

# --- Database Setup ---
step "5/7 Initializing database..."
cd "$APP_DIR"
export DJANGO_ENV=hub
export DJANGO_SETTINGS_MODULE=hmis.settings
export HUB_DB_PATH="${DB_DIR}/hub.sqlite3"
export HUB_ID="$HUB_ID"
export HUB_FACILITY_ID="$HUB_FACILITY_ID"
export HUB_ORGANIZATION_ID="$HUB_ORGANIZATION_ID"
export DJANGO_SECRET_KEY="temporary-for-migration"

"$VENV_DIR/bin/python" manage.py migrate --no-input
"$VENV_DIR/bin/python" manage.py collectstatic --no-input 2>/dev/null || true

chown -R "$APP_USER:$APP_USER" "$DB_DIR" "$APP_DIR/staticfiles" 2>/dev/null || true

# Create superuser (skip in non-interactive mode)
if [[ "$NON_INTERACTIVE" != "true" ]]; then
    echo ""
    info "Create an admin account for this hub:"
    "$VENV_DIR/bin/python" manage.py createsuperuser || warn "Superuser creation skipped."
fi

# --- Systemd Service ---
step "6/7 Installing system service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Vitora HMIS Facility Hub
After=network.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${VENV_DIR}/bin/daphne -b 0.0.0.0 -p ${HUB_PORT} hmis.asgi:application
Restart=on-failure
RestartSec=10

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${DB_DIR} ${LOG_DIR}
PrivateTmp=true

# Logging
StandardOutput=append:${LOG_DIR}/hub.log
StandardError=append:${LOG_DIR}/hub-error.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

# --- Firewall ---
step "7/7 Configuring network..."
if command -v ufw &>/dev/null; then
    ufw allow "$HUB_PORT"/tcp comment "Vitora Hub" 2>/dev/null || true
fi

# --- Verify ---
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
    HUB_STATUS="running"
else
    HUB_STATUS="failed"
    warn "Service did not start. Check: journalctl -u $SERVICE_NAME -n 50"
fi

# --- Done ---
LAN_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Vitora Hub v${VERSION} installed!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Status:    ${HUB_STATUS}"
echo "  Service:   systemctl status $SERVICE_NAME"
echo "  Logs:      journalctl -u $SERVICE_NAME -f"
echo "  Health:    curl http://localhost:${HUB_PORT}/api/hub/health/"
echo ""
echo "  ┌─────────────────────────────────────────────────┐"
echo "  │ LAN clients connect to:                          │"
echo "  │   http://${LAN_IP}:${HUB_PORT}                   │"
echo "  └─────────────────────────────────────────────────┘"
echo ""
echo "  Desktop app setup:"
echo "    1. Choose 'Facility Workstation' mode"
echo "    2. Enter hub URL: http://${LAN_IP}:${HUB_PORT}"
echo "    3. Or choose 'Facility Server (Hub)' if this is the only PC"
echo ""
echo "  Manage:"
echo "    sudo systemctl restart $SERVICE_NAME"
echo "    sudo systemctl stop $SERVICE_NAME"
echo "    sudo bash /opt/vitora/scripts/update-hub.sh     # Update to latest"
echo ""

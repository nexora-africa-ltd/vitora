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
#   - Python 3.12 (EXACT version - the hub binaries are compiled for cp312 ABI)
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
DELIVERY_MODE="native"  # native | container

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
        --mode|-m) DELIVERY_MODE="$2"; shift 2 ;;
        --non-interactive) NON_INTERACTIVE=true; shift ;;
        --help|-h)
            echo "Usage: install-hub.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --version, -v    Specify release version (default: latest)"
            echo "  --port, -p       Hub port (default: 9088)"
            echo "  --mode, -m       Delivery mode: native or container (default: native)"
            echo "  --non-interactive  Skip prompts (use env vars for config)"
            echo "  --help, -h       Show this help"
            exit 0
            ;;
        *) error "Unknown option: $1"; exit 1 ;;
    esac
done

NON_INTERACTIVE="${NON_INTERACTIVE:-false}"

# --- Detect Raspberry Pi ---
IS_RASPBERRY_PI=false
if [[ -f /sys/firmware/devicetree/base/model ]]; then
    PI_MODEL=$(cat /sys/firmware/devicetree/base/model 2>/dev/null | tr -d '\0')
    if [[ "$PI_MODEL" == *"Raspberry Pi"* ]]; then
        IS_RASPBERRY_PI=true
    fi
elif grep -qi "raspberry" /proc/cpuinfo 2>/dev/null; then
    IS_RASPBERRY_PI=true
fi

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

# --- Ensure Python 3.12 (EXACT version) ---
# The hub ships pre-compiled .so files tagged for the cp312 ABI. Other
# Python minor versions silently cannot load them, causing 'cannot import
# name' errors at startup. We resolve PYTHON_BIN to the python3.12
# interpreter and use it explicitly throughout the rest of the script.
PYTHON_BIN=""
ensure_python() {
    # Look for python3.12 directly first (most reliable).
    if command -v python3.12 &>/dev/null; then
        PYTHON_BIN="$(command -v python3.12)"
        info "Python 3.12 found at $PYTHON_BIN"
        return 0
    fi
    # Fall back to checking if generic python3 happens to be 3.12.
    if command -v python3 &>/dev/null; then
        local ver
        ver=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
        if [[ "$ver" == "3.12" ]]; then
            PYTHON_BIN="$(command -v python3)"
            info "Python 3.12 found at $PYTHON_BIN"
            return 0
        fi
        warn "Python $ver found but EXACTLY 3.12 is required. Attempting install..."
    else
        warn "Python 3 not found. Attempting install..."
    fi

    # Detect distro
    if [[ -f /etc/os-release ]]; then
        # shellcheck disable=SC1091
        . /etc/os-release
    fi

    case "${ID:-}" in
        debian|raspbian)
            # Debian 13+ (Trixie) has Python 3.12 in main repos.
            if [[ "${VERSION_ID:-0}" -ge 13 ]]; then
                apt-get update -qq
                apt-get install -y -qq python3.12 python3.12-venv python3.12-dev
            else
                # Older Debian — build from source.
                warn "Debian ${VERSION_ID} detected. Installing Python 3.12 from source..."
                apt-get update -qq
                apt-get install -y -qq build-essential zlib1g-dev libncurses5-dev \
                    libgdbm-dev libnss3-dev libssl-dev libreadline-dev libffi-dev \
                    libsqlite3-dev wget
                local py_src="/tmp/Python-3.12.7"
                download "https://www.python.org/ftp/python/3.12.7/Python-3.12.7.tgz" "/tmp/Python-3.12.7.tgz"
                tar -xzf /tmp/Python-3.12.7.tgz -C /tmp
                cd "$py_src"
                ./configure --enable-optimizations --prefix=/usr/local 2>&1 | tail -5
                make -j"$(nproc)" 2>&1 | tail -3
                make altinstall 2>&1 | tail -3
                cd /
                rm -rf "$py_src" /tmp/Python-3.12.7.tgz
            fi
            ;;
        ubuntu)
            # Ubuntu 24.04+ ships Python 3.12. Older versions use deadsnakes PPA.
            if ! command -v python3.12 &>/dev/null; then
                apt-get update -qq
                apt-get install -y -qq software-properties-common
                add-apt-repository -y ppa:deadsnakes/ppa
                apt-get update -qq
                apt-get install -y -qq python3.12 python3.12-venv python3.12-dev
            fi
            ;;
        *)
            error "Unsupported distro: ${ID:-unknown}. Install Python 3.12 manually."
            exit 1
            ;;
    esac

    # Verify
    if command -v python3.12 &>/dev/null; then
        PYTHON_BIN="$(command -v python3.12)"
        info "Python 3.12 installed successfully at $PYTHON_BIN"
    else
        error "Python 3.12 installation failed. Install manually."
        exit 1
    fi
}

ensure_python

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
    # Non-interactive requires activation code as env var
    ACTIVATION_CODE="${ACTIVATION_CODE:?ACTIVATION_CODE environment variable required in non-interactive mode}"
    CLOUD_URL="${CLOUD_URL:-https://api.vitora.digital}"
else
    echo "This installer will activate a hub by connecting to the Vitora cloud."
    echo "You need an activation code from your cloud admin panel."
    echo "(Found at: Settings → Facilities → Hub Setup → Generate Code)"
    echo ""

    read -rp "  Activation Code: " ACTIVATION_CODE
    read -rp "  Cloud URL [https://api.vitora.digital]: " CLOUD_URL
    CLOUD_URL="${CLOUD_URL:-https://api.vitora.digital}"

    echo ""
    read -rp "Proceed with activation and installation? [y/N]: " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || { info "Cancelled."; exit 0; }
fi

# --- Activate with Cloud ---
step "Activating hub with cloud..."
INSTALLATION_ID="hub-$(hostname)-$(date +%s)"

ACTIVATION_RESPONSE=$(mktemp)
HTTP_CODE=$($DOWNLOADER == "curl" && \
    curl -sf -o "$ACTIVATION_RESPONSE" -w "%{http_code}" \
        -X POST "${CLOUD_URL}/api/licensing/activate/" \
        -H "Content-Type: application/json" \
        -d "{\"activation_code\": \"${ACTIVATION_CODE}\", \"installation_id\": \"${INSTALLATION_ID}\"}" \
    || wget -q -O "$ACTIVATION_RESPONSE" --server-response \
        --header="Content-Type: application/json" \
        --post-data="{\"activation_code\": \"${ACTIVATION_CODE}\", \"installation_id\": \"${INSTALLATION_ID}\"}" \
        "${CLOUD_URL}/api/licensing/activate/" 2>&1 | awk '/^  HTTP/{print $2}' | tail -1
)

if [[ ! -s "$ACTIVATION_RESPONSE" ]] || ! python3 -c "import json; json.load(open('$ACTIVATION_RESPONSE'))" 2>/dev/null; then
    error "Activation failed. Check your activation code and internet connection."
    error "Cloud URL: ${CLOUD_URL}/api/licensing/activate/"
    rm -f "$ACTIVATION_RESPONSE"
    exit 1
fi

# Parse activation response
LICENSE_TOKEN=$(python3 -c "import json; d=json.load(open('$ACTIVATION_RESPONSE')); print(d['license_token'])")
HUB_ORGANIZATION_ID=$(python3 -c "import json; d=json.load(open('$ACTIVATION_RESPONSE')); print(d['organization']['id'])")
HUB_FACILITY_ID=$(python3 -c "import json; d=json.load(open('$ACTIVATION_RESPONSE')); print(d['facility']['id'])")
SYNC_URL=$(python3 -c "import json; d=json.load(open('$ACTIVATION_RESPONSE')); print(d.get('sync_url', '${CLOUD_URL}/api/sync'))")
ORG_NAME=$(python3 -c "import json; d=json.load(open('$ACTIVATION_RESPONSE')); print(d['organization']['name'])")
FACILITY_NAME=$(python3 -c "import json; d=json.load(open('$ACTIVATION_RESPONSE')); print(d['facility']['name'])")
ENCRYPTION_KEY=$(python3 -c "import json; d=json.load(open('$ACTIVATION_RESPONSE')); print(d.get('encryption_key', ''))")
HUB_ID="$INSTALLATION_ID"

info "Activation successful!"
echo ""
echo "  Organization:  $ORG_NAME (ID: $HUB_ORGANIZATION_ID)"
echo "  Facility:      $FACILITY_NAME (ID: $HUB_FACILITY_ID)"
echo "  Hub ID:        $HUB_ID"
echo "  Sync URL:      $SYNC_URL"
echo ""

# --- System Setup ---
step "1/7 Installing system dependencies..."
apt-get update -qq
# Note: python3.12-venv is needed because we run "$PYTHON_BIN -m venv".
# The generic python3-venv only provides the venv module for the default
# python3, which may not be 3.12.
apt-get install -y -qq python3.12-venv python3-pip python3-dev \
    build-essential libffi-dev libssl-dev sqlite3

# --- Raspberry Pi Optimizations ---
if [[ "$IS_RASPBERRY_PI" == "true" ]]; then
    info "Raspberry Pi detected: $PI_MODEL"
    info "Applying Pi-specific optimizations..."

    # Install avahi for mDNS discovery (vitora-hub.local)
    apt-get install -y -qq avahi-daemon avahi-utils

    # Set hostname for mDNS
    CURRENT_HOSTNAME=$(hostname)
    if [[ "$CURRENT_HOSTNAME" != "vitora-hub" ]]; then
        info "Setting hostname to 'vitora-hub' for LAN discovery (vitora-hub.local)"
        hostnamectl set-hostname vitora-hub 2>/dev/null || echo "vitora-hub" > /etc/hostname
        sed -i "s/127\.0\.1\.1.*$/127.0.1.1\tvitora-hub/" /etc/hosts 2>/dev/null || true
    fi

    # Configure avahi to advertise the hub service
    mkdir -p /etc/avahi/services
    cat > /etc/avahi/services/vitora-hub.service <<AVAHI_EOF
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name>Vitora HMIS Hub</name>
  <service>
    <type>_http._tcp</type>
    <port>${HUB_PORT}</port>
    <txt-record>path=/api/hub/health/</txt-record>
    <txt-record>version=${VERSION}</txt-record>
  </service>
</service-group>
AVAHI_EOF

    # Enable and start avahi
    systemctl enable avahi-daemon 2>/dev/null || true
    systemctl restart avahi-daemon 2>/dev/null || true

    # SD card write optimization — reduce journal writes
    if [[ -d /etc/systemd/journald.conf.d ]]; then
        mkdir -p /etc/systemd/journald.conf.d
    fi
    cat > /etc/systemd/journald.conf.d/vitora-sdcard.conf <<JOURNAL_EOF
[Journal]
# Reduce SD card writes for Vitora Hub
Storage=volatile
RuntimeMaxUse=50M
Compress=yes
JOURNAL_EOF
    systemctl restart systemd-journald 2>/dev/null || true

    # Optimize SQLite for SD card (set at DB creation time via Django settings)
    info "Pi optimizations applied: mDNS (vitora-hub.local), reduced journaling"
fi

# Create application user
if ! id -u "$APP_USER" &>/dev/null; then
    info "Creating system user: $APP_USER"
    useradd --system --home-dir "$APP_DIR" --shell /bin/false "$APP_USER"
fi

# Create directories
mkdir -p "$APP_DIR" "$LOG_DIR" "$DB_DIR"
chown "$APP_USER:$APP_USER" "$LOG_DIR" "$DB_DIR"

# ==========================================================================
# Container Mode — pull signed OCI image + docker compose
# ==========================================================================
if [[ "$DELIVERY_MODE" == "container" ]]; then
    step "2/7 Installing Docker (container mode)..."

    # Ensure Docker is installed
    if ! command -v docker &>/dev/null; then
        info "Installing Docker..."
        curl -fsSL https://get.docker.com | sh
        systemctl enable --now docker
        usermod -aG docker "$APP_USER" || true
    fi

    step "3/7 Pulling Vitora Hub container v${VERSION}..."
    REGISTRY="registry.vitora.digital"
    IMAGE="${REGISTRY}/hub:${VERSION}"

    docker pull "$IMAGE" || {
        error "Failed to pull container image: $IMAGE"
        exit 1
    }

    # Verify image signature with cosign (if available)
    if command -v cosign &>/dev/null; then
        info "Verifying container signature..."
        cosign verify --key "${APP_DIR}/keys/cosign.pub" "$IMAGE" 2>/dev/null || \
            warn "Image signature verification failed (continuing — install cosign for enforcement)"
    fi

    step "4/7 Generating docker-compose.yml..."
    cat > "${APP_DIR}/docker-compose.yml" <<COMPOSE
version: "3.8"
services:
  hub:
    image: ${IMAGE}
    container_name: vitora-hub
    restart: unless-stopped
    ports:
      - "${HUB_PORT}:9088"
    volumes:
      - vitora-data:/data
      - ${APP_DIR}/.env:/opt/vitora-hub/.env:ro
    env_file:
      - ${APP_DIR}/.env
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9088/api/health/"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

volumes:
  vitora-data:
COMPOSE

    step "5/7 Starting container..."
    cd "$APP_DIR" && docker compose up -d

    step "6/7 Verifying health..."
    sleep 10
    if curl -sf "http://127.0.0.1:${HUB_PORT}/api/health/" >/dev/null 2>&1; then
        info "Health check passed."
    else
        warn "Health check did not pass immediately — container may still be starting."
    fi

    step "7/7 Container deployment complete!"
    echo ""
    info "Vitora Hub (container mode) is running at: http://$(hostname -I | awk '{print $1}'):${HUB_PORT}"
    info "Manage with: cd ${APP_DIR} && docker compose [logs|restart|stop]"
    exit 0
fi

# ==========================================================================
# Native Mode — tarball extraction + venv + systemd
# ==========================================================================

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

# Stop the service first if upgrading. On Linux, open files can be unlinked,
# but stopping the service avoids stale .so files in the running process and
# guarantees a clean restart with the new code.
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    info "Stopping existing ${SERVICE_NAME} service..."
    systemctl stop "$SERVICE_NAME" || warn "Could not stop ${SERVICE_NAME} (continuing anyway)"
    # Brief pause so the service fully releases handles before we overwrite files
    sleep 2
fi

tar -xzf "$TEMP_ARCHIVE" -C "$APP_DIR" --strip-components=1
rm -f "$TEMP_ARCHIVE"

# Harden directory permissions: root-owned, group-readable by service user only
chown -R root:"$APP_USER" "$APP_DIR"
chmod -R 750 "$APP_DIR"

# Verify extraction
if [[ ! -f "$APP_DIR/manage.py" ]]; then
    error "Extraction failed: manage.py not found in $APP_DIR"
    exit 1
fi

# --- Python Environment ---
step "3/7 Setting up Python environment..."
"$PYTHON_BIN" -m venv "$VENV_DIR"
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
# Vitora Hub Configuration — generated by install-hub.sh (activation-driven)
DJANGO_ENV=hub
DJANGO_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")
ENCRYPTION_KEY=${ENCRYPTION_KEY}
PII_HMAC_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
HUB_ID=${HUB_ID}
HUB_FACILITY_ID=${HUB_FACILITY_ID}
HUB_ORGANIZATION_ID=${HUB_ORGANIZATION_ID}
HUB_PORT=${HUB_PORT}
HUB_DB_PATH=${DB_DIR}/hub.sqlite3
HUB_DATA_DIR=${DB_DIR}
HUB_LOG_FILE=${LOG_DIR}/hub.log
SYNC_SERVER_URL=${SYNC_URL}
LICENSE_TOKEN=${LICENSE_TOKEN}
ALLOWED_HOSTS=*
HUB_VERSION=${VERSION}
EOF

chmod 600 "$APP_DIR/.env"
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"

# --- Hub Shell Wrapper ---
# Convenience script that loads .env and invokes any manage.py command
# (defaults to `shell`). Lets admins run Django commands without having to
# manually export environment variables every time.
cat > "$APP_DIR/hub-shell.sh" <<'WRAPPER_EOF'
#!/usr/bin/env bash
#
# Vitora Hub management shell — loads .env and runs a Django manage.py command.
#
# Usage:
#   sudo ./hub-shell.sh                          # Opens Django shell
#   sudo ./hub-shell.sh createsuperuser          # Creates a superuser
#   sudo ./hub-shell.sh changepassword admin     # Changes a user's password
#   sudo ./hub-shell.sh migrate                  # Runs migrations
#
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$APP_DIR/.env"
VENV_PY="$APP_DIR/venv/bin/python"

if [[ -f "$ENV_FILE" ]]; then
    # Export every non-comment KEY=VALUE line from .env
    set -a
    # shellcheck disable=SC1090
    source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE")
    set +a
else
    echo "WARNING: No .env file at $ENV_FILE — hub may not start correctly." >&2
fi

cd "$APP_DIR"
if [[ $# -eq 0 ]]; then
    exec "$VENV_PY" manage.py shell
else
    exec "$VENV_PY" manage.py "$@"
fi
WRAPPER_EOF

chmod 750 "$APP_DIR/hub-shell.sh"
chown "root:$APP_USER" "$APP_DIR/hub-shell.sh"
info "Hub management wrapper installed at $APP_DIR/hub-shell.sh"

# --- Database Setup ---
step "5/7 Initializing database..."
cd "$APP_DIR"
export DJANGO_ENV=hub
export DJANGO_SETTINGS_MODULE=hmis.settings
export HUB_DB_PATH="${DB_DIR}/hub.sqlite3"
export HUB_DATA_DIR="${DB_DIR}"
export HUB_ID="$HUB_ID"
export HUB_FACILITY_ID="$HUB_FACILITY_ID"
export HUB_ORGANIZATION_ID="$HUB_ORGANIZATION_ID"
export DJANGO_SECRET_KEY="temporary-for-migration"

"$VENV_DIR/bin/python" manage.py migrate --no-input

# Load Kenya location data (counties, sub-counties, wards)
if [[ -f "$APP_DIR/data/kenya_locations.csv" ]]; then
    info "Loading Kenya location data..."
    "$VENV_DIR/bin/python" manage.py import_kenya_locations "data/kenya_locations.csv" || warn "import_kenya_locations failed"
fi

# Initialize all production reference data (subscription plans, RBAC roles,
# ICD-10, LOINC, drugs, CDS rules, KEPI schedule, notifiable diseases, etc).
# Idempotent — safe to re-run on upgrade.
info "Initializing reference data (this may take a few minutes)..."
"$VENV_DIR/bin/python" manage.py initialize_hub || warn "initialize_hub completed with errors; some reference data may be missing"

# Seed org/facility from activation data
info "Seeding organization and facility from activation data..."
"$VENV_DIR/bin/python" manage.py seed_from_activation --response-file="$ACTIVATION_RESPONSE" --skip-locations
rm -f "$ACTIVATION_RESPONSE"

# Collect static files (Django admin CSS, etc.).  Don't swallow errors —
# if this fails the admin page will be unstyled.
if ! "$VENV_DIR/bin/python" manage.py collectstatic --no-input; then
    warn "collectstatic failed.  Django admin will be unstyled until this is resolved."
fi

chown -R "$APP_USER:$APP_USER" "$DB_DIR" 2>/dev/null || true

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
MDNS_NAME=$(hostname).local
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
if [[ "$IS_RASPBERRY_PI" == "true" ]]; then
echo "  │   http://${MDNS_NAME}:${HUB_PORT}  (mDNS)       │"
fi
echo "  └─────────────────────────────────────────────────┘"
echo ""
echo "  Desktop app setup:"
echo "    1. Choose 'Facility Workstation' mode"
if [[ "$IS_RASPBERRY_PI" == "true" ]]; then
echo "    2. Enter hub URL: http://${MDNS_NAME}:${HUB_PORT}"
echo "       (or by IP: http://${LAN_IP}:${HUB_PORT})"
else
echo "    2. Enter hub URL: http://${LAN_IP}:${HUB_PORT}"
fi
echo "    3. Or choose 'Facility Server (Hub)' if this is the only PC"
echo ""
echo "  Manage:"
echo "    sudo systemctl restart $SERVICE_NAME"
echo "    sudo systemctl stop $SERVICE_NAME"
echo "    sudo bash /opt/vitora/scripts/update-hub.sh     # Update to latest"
echo ""
echo "  Django shell / commands (loads .env automatically):"
echo "    sudo $APP_DIR/hub-shell.sh                       # Open Django shell"
echo "    sudo $APP_DIR/hub-shell.sh createsuperuser       # Create a superuser"
echo "    sudo $APP_DIR/hub-shell.sh changepassword admin  # Reset a password"
echo ""

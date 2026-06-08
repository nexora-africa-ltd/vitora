#!/usr/bin/env bash
# ============================================================================
# Vitora HMIS — Facility Hub Installer
#
# Installs and configures the Django backend as a local facility hub.
# Designed for Ubuntu/Debian on a Raspberry Pi or dedicated facility PC.
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/.../install-hub.sh | sudo bash
#   # or:
#   sudo bash scripts/install-hub.sh
#
# Prerequisites:
#   - Ubuntu 22.04+ or Debian 12+
#   - Python 3.11+
#   - 2GB+ RAM recommended
# ============================================================================

set -euo pipefail

# --- Configuration ---
APP_USER="vitora"
APP_DIR="/opt/vitora"
VENV_DIR="${APP_DIR}/venv"
SERVICE_NAME="vitora-hub"
HUB_PORT="${HUB_PORT:-9088}"
LOG_DIR="/var/log/vitora"
DB_DIR="/var/lib/vitora"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# --- Pre-checks ---
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (use sudo)."
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    error "Python 3 is required. Install with: apt install python3 python3-venv python3-pip"
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
if [[ "$(echo "$PYTHON_VERSION < 3.11" | bc)" == "1" ]]; then
    error "Python 3.11+ required (found $PYTHON_VERSION)."
    exit 1
fi

# --- Interactive Setup ---
echo ""
echo "=== Vitora HMIS — Facility Hub Setup ==="
echo ""

read -rp "Enter Hub ID (unique identifier for this hub): " HUB_ID
read -rp "Enter Facility ID (from cloud admin): " HUB_FACILITY_ID
read -rp "Enter Organization ID (from cloud admin): " HUB_ORGANIZATION_ID
read -rp "Enter Cloud Sync URL [https://api.vitora.digital/api/sync]: " SYNC_URL
SYNC_URL="${SYNC_URL:-https://api.vitora.digital/api/sync}"
read -rp "Enter Encryption Key (must match cloud): " ENCRYPTION_KEY

echo ""
info "Configuration:"
echo "  Hub ID:          $HUB_ID"
echo "  Facility:        $HUB_FACILITY_ID"
echo "  Organization:    $HUB_ORGANIZATION_ID"
echo "  Cloud Sync URL:  $SYNC_URL"
echo "  Port:            $HUB_PORT"
echo ""
read -rp "Proceed? [y/N]: " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { info "Cancelled."; exit 0; }

# --- System Setup ---
info "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq python3-venv python3-pip python3-dev \
    build-essential libffi-dev libssl-dev sqlite3

# Create application user
if ! id -u "$APP_USER" &>/dev/null; then
    info "Creating system user: $APP_USER"
    useradd --system --home-dir "$APP_DIR" --shell /bin/false "$APP_USER"
fi

# Create directories
info "Creating directories..."
mkdir -p "$APP_DIR" "$LOG_DIR" "$DB_DIR"
chown "$APP_USER:$APP_USER" "$LOG_DIR" "$DB_DIR"

# --- Application Setup ---
info "Setting up application in $APP_DIR..."

# Copy backend code (assumes script is run from repo root or APP_DIR exists)
if [[ -d "backend" ]]; then
    cp -r backend/* "$APP_DIR/"
elif [[ -d "$APP_DIR/hmis" ]]; then
    info "Application code already in place."
else
    error "Cannot find backend code. Run from repo root or copy to $APP_DIR first."
    exit 1
fi

# Create virtual environment
info "Creating Python virtual environment..."
python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

# Install dependencies
info "Installing Python dependencies..."
pip install --quiet --upgrade pip
if [[ -f "$APP_DIR/pyproject.toml" ]]; then
    pip install --quiet "$APP_DIR"
elif [[ -f "$APP_DIR/requirements.txt" ]]; then
    pip install --quiet -r "$APP_DIR/requirements.txt"
fi

# Install production extras
pip install --quiet daphne whitenoise gunicorn

# --- Environment File ---
info "Writing environment configuration..."
cat > "$APP_DIR/.env" <<EOF
DJANGO_ENV=hub
DJANGO_SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))")
ENCRYPTION_KEY=${ENCRYPTION_KEY}
HUB_ID=${HUB_ID}
HUB_FACILITY_ID=${HUB_FACILITY_ID}
HUB_ORGANIZATION_ID=${HUB_ORGANIZATION_ID}
HUB_DB_PATH=${DB_DIR}/hub.sqlite3
HUB_LOG_FILE=${LOG_DIR}/hub.log
SYNC_SERVER_URL=${SYNC_URL}
ALLOWED_HOSTS=*
EOF

chmod 600 "$APP_DIR/.env"
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"

# --- Database Setup ---
info "Running database migrations..."
cd "$APP_DIR"
export DJANGO_ENV=hub
export DJANGO_SETTINGS_MODULE=hmis.settings
export HUB_DB_PATH="${DB_DIR}/hub.sqlite3"
export HUB_ID="$HUB_ID"
export HUB_FACILITY_ID="$HUB_FACILITY_ID"
export HUB_ORGANIZATION_ID="$HUB_ORGANIZATION_ID"
export DJANGO_SECRET_KEY="temporary-for-migration"

"$VENV_DIR/bin/python" manage.py migrate --no-input
"$VENV_DIR/bin/python" manage.py collectstatic --no-input

# Create superuser
info "Creating admin user..."
echo ""
"$VENV_DIR/bin/python" manage.py createsuperuser || warn "Superuser creation skipped."

chown -R "$APP_USER:$APP_USER" "$DB_DIR" "$APP_DIR/staticfiles"

# --- Systemd Service ---
info "Installing systemd service..."
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

# Reload and enable
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

# --- Firewall ---
if command -v ufw &>/dev/null; then
    info "Opening port $HUB_PORT in firewall..."
    ufw allow "$HUB_PORT"/tcp comment "Vitora Hub"
fi

# --- Done ---
echo ""
echo "============================================="
info "Vitora Hub installed successfully!"
echo "============================================="
echo ""
echo "  Service:   systemctl status $SERVICE_NAME"
echo "  Logs:      journalctl -u $SERVICE_NAME -f"
echo "  Health:    curl http://localhost:${HUB_PORT}/api/hub/health/"
echo "  Admin:     http://localhost:${HUB_PORT}/admin/"
echo ""
echo "  LAN clients connect to: http://$(hostname -I | awk '{print $1}'):${HUB_PORT}"
echo ""
echo "  Manage:"
echo "    systemctl restart $SERVICE_NAME"
echo "    systemctl stop $SERVICE_NAME"
echo ""

#!/usr/bin/env bash
# ============================================================================
# Vitora HMIS — Raspberry Pi First-Boot Setup
#
# Optional script to prepare a fresh Raspberry Pi OS installation for
# the Vitora Hub before running the main installer. Handles:
#   - System update
#   - Static IP configuration (optional)
#   - Hostname setting
#   - Swap file optimization for SD card
#   - USB boot preference (if SSD attached)
#   - Automatic installer execution
#
# This script is designed to run ONCE after first SSH into a fresh Pi.
# It can be placed on the boot partition as a firstrun script, or run manually.
#
# Usage:
#   # On a fresh Pi (after SSH in):
#   curl -sSL https://get.vitora.digital/pi-setup | sudo bash
#
#   # Or with static IP:
#   curl -sSL https://get.vitora.digital/pi-setup | sudo bash -s -- \
#     --static-ip 192.168.1.100/24 --gateway 192.168.1.1 --dns 8.8.8.8
#
#   # Full unattended (will also run the hub installer):
#   curl -sSL https://get.vitora.digital/pi-setup | sudo bash -s -- \
#     --static-ip 192.168.1.100/24 --gateway 192.168.1.1 \
#     --install-hub --hub-id "hub-01" --facility-id "fac-1" \
#     --org-id "org-1" --encryption-key "YOUR_KEY"
# ============================================================================

set -euo pipefail

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

# --- Parse Arguments ---
STATIC_IP=""
GATEWAY=""
DNS_SERVER="8.8.8.8,8.8.4.4"
HOSTNAME_OVERRIDE="vitora-hub"
INSTALL_HUB=false
HUB_ID=""
HUB_FACILITY_ID=""
HUB_ORGANIZATION_ID=""
ENCRYPTION_KEY=""
SYNC_URL="https://api.vitora.digital/api/sync"
HUB_PORT="9088"

while [[ $# -gt 0 ]]; do
    case $1 in
        --static-ip) STATIC_IP="$2"; shift 2 ;;
        --gateway) GATEWAY="$2"; shift 2 ;;
        --dns) DNS_SERVER="$2"; shift 2 ;;
        --hostname) HOSTNAME_OVERRIDE="$2"; shift 2 ;;
        --install-hub) INSTALL_HUB=true; shift ;;
        --hub-id) HUB_ID="$2"; shift 2 ;;
        --facility-id) HUB_FACILITY_ID="$2"; shift 2 ;;
        --org-id) HUB_ORGANIZATION_ID="$2"; shift 2 ;;
        --encryption-key) ENCRYPTION_KEY="$2"; shift 2 ;;
        --sync-url) SYNC_URL="$2"; shift 2 ;;
        --port) HUB_PORT="$2"; shift 2 ;;
        --help|-h)
            echo "Usage: pi-setup.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --static-ip IP/CIDR  Set static IP (e.g., 192.168.1.100/24)"
            echo "  --gateway IP         Default gateway (e.g., 192.168.1.1)"
            echo "  --dns SERVERS        DNS servers (default: 8.8.8.8,8.8.4.4)"
            echo "  --hostname NAME      Hostname (default: vitora-hub)"
            echo "  --install-hub        Also run the Vitora Hub installer"
            echo "  --hub-id ID          Hub ID (for --install-hub)"
            echo "  --facility-id ID     Facility ID (for --install-hub)"
            echo "  --org-id ID          Organization ID (for --install-hub)"
            echo "  --encryption-key KEY Encryption key (for --install-hub)"
            echo "  --sync-url URL       Cloud sync URL (default: https://api.vitora.digital/api/sync)"
            echo "  --port PORT          Hub port (default: 9088)"
            exit 0
            ;;
        *) error "Unknown option: $1"; exit 1 ;;
    esac
done

# --- Pre-checks ---
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root (use sudo)."
    exit 1
fi

# Verify we're on a Pi
if [[ ! -f /sys/firmware/devicetree/base/model ]]; then
    warn "This doesn't appear to be a Raspberry Pi. Continuing anyway..."
fi

PI_MODEL=$(cat /sys/firmware/devicetree/base/model 2>/dev/null | tr -d '\0' || echo "Unknown")

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║    Vitora Hub — Raspberry Pi First-Boot Setup    ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Model: ${PI_MODEL}${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# --- Step 1: System Update ---
step "1/6 Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
info "System updated."

# --- Step 2: Set Hostname ---
step "2/6 Setting hostname to '${HOSTNAME_OVERRIDE}'..."
CURRENT_HOSTNAME=$(hostname)
if [[ "$CURRENT_HOSTNAME" != "$HOSTNAME_OVERRIDE" ]]; then
    hostnamectl set-hostname "$HOSTNAME_OVERRIDE" 2>/dev/null || echo "$HOSTNAME_OVERRIDE" > /etc/hostname
    sed -i "s/127\.0\.1\.1.*$/127.0.1.1\t${HOSTNAME_OVERRIDE}/" /etc/hosts 2>/dev/null || true
    # Also add the current hostname if not in hosts
    grep -q "$HOSTNAME_OVERRIDE" /etc/hosts || echo "127.0.1.1  $HOSTNAME_OVERRIDE" >> /etc/hosts
    info "Hostname set to: $HOSTNAME_OVERRIDE"
else
    info "Hostname already set."
fi

# --- Step 3: Static IP (optional) ---
step "3/6 Network configuration..."
if [[ -n "$STATIC_IP" ]]; then
    if [[ -z "$GATEWAY" ]]; then
        # Auto-detect gateway from current route
        GATEWAY=$(ip route | grep default | awk '{print $3}' | head -1)
        if [[ -z "$GATEWAY" ]]; then
            error "Cannot auto-detect gateway. Specify --gateway."
            exit 1
        fi
        info "Auto-detected gateway: $GATEWAY"
    fi

    # Determine primary interface
    IFACE=$(ip route | grep default | awk '{print $5}' | head -1)
    if [[ -z "$IFACE" ]]; then
        IFACE="eth0"
    fi
    info "Configuring static IP on $IFACE: $STATIC_IP"

    # Use dhcpcd (Pi OS default) or NetworkManager
    if [[ -f /etc/dhcpcd.conf ]]; then
        # dhcpcd method
        cat >> /etc/dhcpcd.conf <<DHCP_EOF

# Vitora Hub — Static IP Configuration
interface ${IFACE}
static ip_address=${STATIC_IP}
static routers=${GATEWAY}
static domain_name_servers=${DNS_SERVER}
DHCP_EOF
        info "Static IP configured via dhcpcd."
    elif command -v nmcli &>/dev/null; then
        # NetworkManager method (newer Pi OS)
        local cidr_prefix="${STATIC_IP#*/}"
        local ip_addr="${STATIC_IP%/*}"
        nmcli con mod "Wired connection 1" \
            ipv4.addresses "$ip_addr/$cidr_prefix" \
            ipv4.gateway "$GATEWAY" \
            ipv4.dns "$DNS_SERVER" \
            ipv4.method manual 2>/dev/null || \
        nmcli con mod "$IFACE" \
            ipv4.addresses "$ip_addr/$cidr_prefix" \
            ipv4.gateway "$GATEWAY" \
            ipv4.dns "$DNS_SERVER" \
            ipv4.method manual 2>/dev/null || true
        info "Static IP configured via NetworkManager."
    fi
else
    info "Using DHCP (no static IP requested)."
    info "Tip: Reserve this Pi's MAC address in your router for a stable IP."
fi

# --- Step 4: SD Card / Storage Optimization ---
step "4/6 Optimizing storage for longevity..."

# Reduce swap to minimize SD card writes
if [[ -f /etc/dphys-swapfile ]]; then
    sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=256/' /etc/dphys-swapfile
    systemctl restart dphys-swapfile 2>/dev/null || true
    info "Swap reduced to 256MB."
fi

# Set tmpfs for high-write temp directories
if ! grep -q "vitora tmpfs" /etc/fstab; then
    cat >> /etc/fstab <<FSTAB_EOF

# Vitora Hub — tmpfs for SD card longevity
tmpfs /tmp tmpfs defaults,noatime,nosuid,nodev,size=100M 0 0
tmpfs /var/tmp tmpfs defaults,noatime,nosuid,nodev,size=50M 0 0
FSTAB_EOF
    mount -a 2>/dev/null || true
    info "tmpfs configured for /tmp and /var/tmp."
fi

# Disable unnecessary services to reduce writes + free RAM
DISABLE_SERVICES=(
    "bluetooth"
    "hciuart"
    "triggerhappy"
    "avahi-daemon"  # We'll re-enable after hub install configures it
)
for svc in "${DISABLE_SERVICES[@]}"; do
    if systemctl is-enabled "$svc" &>/dev/null 2>&1; then
        systemctl disable "$svc" 2>/dev/null || true
        systemctl stop "$svc" 2>/dev/null || true
    fi
done
info "Disabled unnecessary services (bluetooth, triggerhappy)."

# Check for USB SSD and recommend
USB_DISKS=$(lsblk -o NAME,TYPE,TRAN | grep -i usb | grep disk | awk '{print $1}' || true)
if [[ -n "$USB_DISKS" ]]; then
    info "USB disk detected: $USB_DISKS"
    warn "Consider moving the root filesystem to USB SSD for better performance and longevity."
    warn "Guide: https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#usb-mass-storage-boot"
fi

# --- Step 5: Install prerequisites ---
step "5/6 Installing prerequisites..."
apt-get install -y -qq curl python3 python3-venv python3-pip python3-dev \
    build-essential libffi-dev libssl-dev sqlite3 avahi-daemon avahi-utils
info "Prerequisites installed."

# --- Step 6: Summary / Run Hub Installer ---
step "6/6 First-boot setup complete!"

LAN_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║    Raspberry Pi ready for Vitora Hub!            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════╝${NC}"
echo ""
echo "  Hostname:   ${HOSTNAME_OVERRIDE} (${HOSTNAME_OVERRIDE}.local)"
echo "  IP:         ${LAN_IP}"
if [[ -n "$STATIC_IP" ]]; then
echo "  Static IP:  ${STATIC_IP} (active after reboot)"
fi
echo ""

if [[ "$INSTALL_HUB" == "true" ]]; then
    if [[ -z "$HUB_ID" || -z "$HUB_FACILITY_ID" || -z "$HUB_ORGANIZATION_ID" || -z "$ENCRYPTION_KEY" ]]; then
        error "Hub install requested but missing required arguments."
        error "Required: --hub-id, --facility-id, --org-id, --encryption-key"
        echo ""
        echo "Run the hub installer manually:"
        echo "  curl -sSL https://get.vitora.digital/hub | sudo bash"
        exit 1
    fi

    info "Proceeding with hub installation..."
    echo ""

    # Run the hub installer in non-interactive mode
    export HUB_ID HUB_FACILITY_ID HUB_ORGANIZATION_ID ENCRYPTION_KEY SYNC_URL HUB_PORT
    export NON_INTERACTIVE=true
    curl -fsSL https://get.vitora.digital/hub | bash -s -- --non-interactive --port "$HUB_PORT"
else
    echo "  Next step — install the Vitora Hub:"
    echo ""
    echo "    curl -sSL https://get.vitora.digital/hub | sudo bash"
    echo ""
    echo "  Or reboot first to apply network changes:"
    echo "    sudo reboot"
    echo ""
fi

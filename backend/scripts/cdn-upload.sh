#!/usr/bin/env bash
# -------------------------------------------------------------------
# cdn-upload.sh — Upload static tools and assets to the Vitora CDN
#
# Azure Blob Storage container "releases" is fronted by
#   https://get.vitora.digital
#
# Auth: uses AZURE_STORAGE_CONNECTION_STRING env var (same secret
#        used by CI in .github/workflows/build-hub.yml)
#
# Usage:
#   # Upload a single file
#   ./cdn-upload.sh tools/nssm-2.24.zip ./nssm-2.24.zip
#
#   # Upload the bundled NSSM from a URL (downloads then uploads)
#   ./cdn-upload.sh --fetch tools/nssm-2.24.zip https://github.com/nicholatian/nssm-mirror/releases/download/v2.24/nssm-2.24.zip
#
#   # Upload installer scripts (convenience target)
#   ./cdn-upload.sh --installers
# -------------------------------------------------------------------
set -euo pipefail

# --- Configuration (must match CI workflows) ---
BLOB_CONTAINER="releases"
CDN_BASE_URL="https://get.vitora.digital"

# --- Colors ---
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
err()   { echo -e "${RED}[ERR]${NC} $*" >&2; }

# --- Preflight ---
if [[ -z "${AZURE_STORAGE_CONNECTION_STRING:-}" ]]; then
    err "AZURE_STORAGE_CONNECTION_STRING is not set."
    echo "  Set it via:  export AZURE_STORAGE_CONNECTION_STRING='DefaultEndpointsProtocol=https;AccountName=...'"
    echo "  Or run:      source backend/.env  (if it contains the var)"
    exit 1
fi

if ! command -v az &>/dev/null; then
    err "Azure CLI (az) not found. Install: https://aka.ms/install-azure-cli"
    exit 1
fi

# --- Functions ---
upload_blob() {
    local blob_name="$1"
    local local_file="$2"
    local content_type="${3:-application/octet-stream}"

    # Auto-detect content type from extension
    if [[ "$content_type" == "application/octet-stream" ]]; then
        case "$blob_name" in
            *.zip)       content_type="application/zip" ;;
            *.tar.gz)    content_type="application/gzip" ;;
            *.sh)        content_type="text/x-shellscript" ;;
            *.ps1)       content_type="text/plain" ;;
            *.json)      content_type="application/json" ;;
            *.exe)       content_type="application/vnd.microsoft.portable-executable" ;;
        esac
    fi

    info "Uploading: ${blob_name} (${content_type})"
    az storage blob upload \
        --container-name "$BLOB_CONTAINER" \
        --name "$blob_name" \
        --file "$local_file" \
        --overwrite \
        --content-type "$content_type" \
        --content-cache-control "max-age=86400" \
        --output none

    ok "Live at: ${CDN_BASE_URL}/${blob_name}"
}

fetch_and_upload() {
    local blob_name="$1"
    local source_url="$2"
    local tmp_file
    tmp_file="$(mktemp)"

    info "Fetching: $source_url"
    if ! curl -fSL --retry 3 -o "$tmp_file" "$source_url"; then
        err "Download failed: $source_url"
        rm -f "$tmp_file"
        exit 1
    fi

    upload_blob "$blob_name" "$tmp_file"
    rm -f "$tmp_file"
}

upload_installers() {
    local script_dir
    script_dir="$(cd "$(dirname "$0")" && pwd)"

    info "Uploading installer scripts to CDN..."

    # Linux hub installer → /hub
    upload_blob "hub" "${script_dir}/install-hub.sh" "text/x-shellscript"

    # Windows hub installer → /hub.ps1
    upload_blob "hub.ps1" "${script_dir}/install-hub-windows.ps1" "text/plain"

    # Linux hub updater → /hub-update
    upload_blob "hub-update" "${script_dir}/update-hub.sh" "text/x-shellscript"

    # Windows hub updater → /hub-update.ps1
    upload_blob "hub-update.ps1" "${script_dir}/update-hub-windows.ps1" "text/plain"

    # Raspberry Pi first-boot → /pi-setup
    upload_blob "pi-setup" "${script_dir}/pi-setup.sh" "text/x-shellscript"

    ok "All installer scripts uploaded."
}

upload_tools() {
    info "Uploading vendored tools to CDN..."

    # NSSM 2.24 (Windows service manager)
    # Primary source: nssm.cc (may be intermittently down)
    fetch_and_upload "tools/nssm-2.24.zip" \
        "https://nssm.cc/release/nssm-2.24.zip"

    ok "All tools uploaded."
}

show_help() {
    cat <<EOF
Usage: $0 [OPTIONS] [BLOB_NAME LOCAL_FILE]

Upload files to the Vitora CDN (Azure Blob → https://get.vitora.digital).

Commands:
  <blob_name> <local_file>   Upload a local file to the given blob path
  --fetch <blob_name> <url>  Download from URL then upload to blob path
  --installers               Upload all installer scripts (hub, hub.ps1, pi-setup, etc.)
  --tools                    Fetch and upload vendored tools (NSSM, etc.)
  --all                      Upload installers + tools
  -h, --help                 Show this help

Environment:
  AZURE_STORAGE_CONNECTION_STRING   Required. Azure Storage connection string.

Examples:
  $0 tools/nssm-2.24.zip ./nssm-2.24.zip
  $0 --fetch tools/nssm-2.24.zip https://example.com/nssm-2.24.zip
  $0 --installers
  $0 --tools
  $0 --all
EOF
}

# --- Main ---
case "${1:-}" in
    -h|--help)
        show_help
        ;;
    --installers)
        upload_installers
        ;;
    --tools)
        upload_tools
        ;;
    --all)
        upload_installers
        upload_tools
        ;;
    --fetch)
        if [[ $# -lt 3 ]]; then
            err "Usage: $0 --fetch <blob_name> <source_url>"
            exit 1
        fi
        fetch_and_upload "$2" "$3"
        ;;
    "")
        show_help
        exit 1
        ;;
    *)
        if [[ $# -lt 2 ]]; then
            err "Usage: $0 <blob_name> <local_file>"
            exit 1
        fi
        if [[ ! -f "$2" ]]; then
            err "File not found: $2"
            exit 1
        fi
        upload_blob "$1" "$2"
        ;;
esac

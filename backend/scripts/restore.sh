#!/bin/bash
# =============================================================================
# Vitora HMIS - PostgreSQL Restore Script
# =============================================================================
# This script restores PostgreSQL backups created by backup.sh
#
# Usage:
#   ./restore.sh <backup_file>                    # Restore specific backup
#   ./restore.sh --latest                         # Restore most recent backup
#   ./restore.sh --from-s3 <s3_path>              # Download and restore from S3
#   ./restore.sh --list                           # List available backups
#   ./restore.sh --verify <backup_file>           # Verify backup integrity
#
# Environment Variables Required:
#   DATABASE_URL           - Target PostgreSQL connection string
#   BACKUP_ENCRYPTION_KEY  - GPG passphrase (if backup is encrypted)
#   AWS_ACCESS_KEY_ID      - S3 credentials (for --from-s3)
#   AWS_SECRET_ACCESS_KEY  - S3 credentials (for --from-s3)
#
# Safety Features:
#   - Requires explicit confirmation before restore
#   - Creates pre-restore snapshot
#   - Supports dry-run mode
#   - Verifies backup checksum before restore
#
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/vitora}"
TEMP_DIR="/tmp/vitora_restore_$$"

# Flags
DRY_RUN=false
FORCE=false
SKIP_CONFIRMATION=false
VERBOSE=false

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        log "$1"
    fi
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >&2
}

log_warn() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1" >&2
}

# -----------------------------------------------------------------------------
# Usage
# -----------------------------------------------------------------------------
usage() {
    cat <<EOF
Vitora HMIS - Database Restore Script

Usage: $0 [OPTIONS] <backup_file|--latest|--from-s3 S3_PATH>

Options:
    --latest              Restore the most recent local backup
    --from-s3 S3_PATH     Download and restore from S3 (e.g., s3://bucket/backups/env/file.gpg)
    --list                List available local backups
    --verify FILE         Verify backup integrity without restoring
    --dry-run             Show what would be done without making changes
    --force               Skip safety checks (DANGEROUS)
    --yes, -y             Skip confirmation prompt
    -v, --verbose         Verbose output
    -h, --help            Show this help

Examples:
    $0 /var/backups/vitora/vitora_staging_20260222_020000_db.sql.gz.gpg
    $0 --latest
    $0 --from-s3 s3://vitora-backups/backups/production/vitora_production_20260222_020000_db.sql.gz.gpg
    $0 --list
    $0 --verify /path/to/backup.sql.gz.gpg

Environment Variables:
    DATABASE_URL           Target database connection string
    BACKUP_ENCRYPTION_KEY  GPG passphrase for encrypted backups
    BACKUP_DIR             Local backup directory (default: /var/backups/vitora)
EOF
}

# -----------------------------------------------------------------------------
# Parse Arguments
# -----------------------------------------------------------------------------
BACKUP_FILE=""
MODE="restore"
S3_PATH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --latest)
            MODE="latest"
            shift
            ;;
        --from-s3)
            MODE="s3"
            S3_PATH="$2"
            shift 2
            ;;
        --list)
            MODE="list"
            shift
            ;;
        --verify)
            MODE="verify"
            BACKUP_FILE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --yes|-y)
            SKIP_CONFIRMATION=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        -*)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
        *)
            BACKUP_FILE="$1"
            shift
            ;;
    esac
done

# -----------------------------------------------------------------------------
# Parse DATABASE_URL
# -----------------------------------------------------------------------------
parse_database_url() {
    local url="${DATABASE_URL:-}"

    if [[ -z "$url" ]]; then
        log_error "DATABASE_URL environment variable not set."
        exit 1
    fi

    # Remove protocol
    url="${url#postgres://}"
    url="${url#postgresql://}"

    # Extract user:password
    local userpass="${url%%@*}"
    DB_USER="${userpass%%:*}"
    DB_PASS="${userpass#*:}"

    # Extract host:port/dbname
    local hostportdb="${url#*@}"
    local hostport="${hostportdb%%/*}"
    DB_NAME="${hostportdb#*/}"
    DB_NAME="${DB_NAME%%\?*}"

    DB_HOST="${hostport%%:*}"
    DB_PORT="${hostport#*:}"

    if [[ "$DB_PORT" == "$DB_HOST" ]]; then
        DB_PORT="5432"
    fi

    log_verbose "Target database: $DB_NAME @ $DB_HOST:$DB_PORT"
}

# -----------------------------------------------------------------------------
# List Available Backups
# -----------------------------------------------------------------------------
list_backups() {
    log "Available local backups in $BACKUP_DIR:"
    echo ""

    if [[ ! -d "$BACKUP_DIR" ]]; then
        log_warn "Backup directory does not exist: $BACKUP_DIR"
        exit 1
    fi

    # Find and list backup files
    local count=0
    while IFS= read -r -d '' file; do
        local filename=$(basename "$file")
        local size=$(du -h "$file" | cut -f1)
        local date=$(stat -c %y "$file" | cut -d'.' -f1)

        printf "  %-60s  %8s  %s\n" "$filename" "$size" "$date"
        ((count++))
    done < <(find "$BACKUP_DIR" -name "vitora_*_db.*" -type f -print0 | sort -z -r)

    echo ""
    log "Total: $count backup(s)"
}

# -----------------------------------------------------------------------------
# Find Latest Backup
# -----------------------------------------------------------------------------
find_latest_backup() {
    local latest=$(find "$BACKUP_DIR" -name "vitora_*_db.sql.gz*" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)

    if [[ -z "$latest" ]]; then
        # Try custom format
        latest=$(find "$BACKUP_DIR" -name "vitora_*_db.dump*" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2-)
    fi

    if [[ -z "$latest" ]]; then
        log_error "No backup files found in $BACKUP_DIR"
        exit 1
    fi

    echo "$latest"
}

# -----------------------------------------------------------------------------
# Download from S3
# -----------------------------------------------------------------------------
download_from_s3() {
    local s3_path="$1"
    local local_file="$TEMP_DIR/$(basename "$s3_path")"

    log "Downloading from S3: $s3_path"

    mkdir -p "$TEMP_DIR"

    aws s3 cp "$s3_path" "$local_file" ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"}

    # Also download checksum if available
    if aws s3 cp "${s3_path}.sha256" "${local_file}.sha256" ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"} 2>/dev/null; then
        log_verbose "Downloaded checksum file"
    fi

    echo "$local_file"
}

# -----------------------------------------------------------------------------
# Verify Backup
# -----------------------------------------------------------------------------
verify_backup() {
    local file="$1"

    log "Verifying backup: $file"

    if [[ ! -f "$file" ]]; then
        log_error "File not found: $file"
        return 1
    fi

    # Check checksum if available
    if [[ -f "${file}.sha256" ]]; then
        log_verbose "Verifying checksum..."
        if sha256sum -c "${file}.sha256" 2>/dev/null; then
            log "Checksum verification: PASSED"
        else
            log_error "Checksum verification: FAILED"
            return 1
        fi
    else
        log_warn "No checksum file found. Skipping checksum verification."
    fi

    # Test decryption if encrypted
    if [[ "$file" == *.gpg ]]; then
        if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
            log_error "Backup is encrypted but BACKUP_ENCRYPTION_KEY not set"
            return 1
        fi

        log_verbose "Testing decryption..."
        local test_output=$(mktemp)
        if echo "$BACKUP_ENCRYPTION_KEY" | gpg --batch --yes --passphrase-fd 0 -d "$file" 2>/dev/null | head -c 1024 > "$test_output"; then
            log "Decryption test: PASSED"
            rm -f "$test_output"
        else
            log_error "Decryption test: FAILED"
            rm -f "$test_output"
            return 1
        fi
    fi

    log "Backup verification: PASSED"
    return 0
}

# -----------------------------------------------------------------------------
# Create Pre-Restore Snapshot
# -----------------------------------------------------------------------------
create_pre_restore_snapshot() {
    if [[ "$FORCE" == "true" ]]; then
        log_warn "Skipping pre-restore snapshot (--force)"
        return
    fi

    log "Creating pre-restore snapshot..."

    local snapshot_file="$BACKUP_DIR/pre_restore_$(date +%Y%m%d_%H%M%S)_db.sql.gz"

    export PGPASSWORD="$DB_PASS"
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --no-password --clean --if-exists | gzip > "$snapshot_file"
    unset PGPASSWORD

    log "Pre-restore snapshot saved: $snapshot_file"
}

# -----------------------------------------------------------------------------
# Restore Database
# -----------------------------------------------------------------------------
restore_database() {
    local file="$1"
    local temp_file=""

    log "Starting database restore from: $file"

    # Decrypt if needed
    if [[ "$file" == *.gpg ]]; then
        log_verbose "Decrypting backup..."
        temp_file="$TEMP_DIR/decrypted_backup"
        mkdir -p "$TEMP_DIR"
        echo "$BACKUP_ENCRYPTION_KEY" | gpg --batch --yes --passphrase-fd 0 -d "$file" > "$temp_file"
        file="$temp_file"
    fi

    # Decompress if needed
    if [[ "$file" == *.gz ]]; then
        log_verbose "Decompressing backup..."
        local decompressed="$TEMP_DIR/decompressed.sql"
        mkdir -p "$TEMP_DIR"
        gunzip -c "$file" > "$decompressed"
        file="$decompressed"
    fi

    # Check if it's a custom format dump
    if [[ "$file" == *.dump ]] || file "$file" | grep -q "PostgreSQL custom database dump"; then
        log "Restoring from custom format dump..."

        if [[ "$DRY_RUN" == "true" ]]; then
            log "DRY RUN: Would run pg_restore on $file"
            return
        fi

        export PGPASSWORD="$DB_PASS"
        pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            --no-password --clean --if-exists --verbose "$file" 2>&1 | while read -r line; do
            log_verbose "pg_restore: $line"
        done
        unset PGPASSWORD
    else
        # Plain SQL file
        log "Restoring from SQL file..."

        if [[ "$DRY_RUN" == "true" ]]; then
            log "DRY RUN: Would run psql on $file"
            return
        fi

        export PGPASSWORD="$DB_PASS"
        psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            --no-password -f "$file" 2>&1 | while read -r line; do
            log_verbose "psql: $line"
        done
        unset PGPASSWORD
    fi

    log "Database restore complete"
}

# -----------------------------------------------------------------------------
# Confirm Action
# -----------------------------------------------------------------------------
confirm_restore() {
    if [[ "$SKIP_CONFIRMATION" == "true" ]]; then
        return 0
    fi

    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                    ⚠️  WARNING: DATABASE RESTORE                  ║"
    echo "╠══════════════════════════════════════════════════════════════════╣"
    echo "║  This will REPLACE ALL DATA in the target database!             ║"
    echo "║                                                                  ║"
    echo "║  Target: $DB_NAME @ $DB_HOST:$DB_PORT"
    echo "║  Source: $(basename "$BACKUP_FILE")"
    echo "║                                                                  ║"
    echo "║  A pre-restore snapshot will be created first.                  ║"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""

    read -p "Type 'RESTORE' to confirm: " confirmation

    if [[ "$confirmation" != "RESTORE" ]]; then
        log "Restore cancelled by user"
        exit 0
    fi
}

# -----------------------------------------------------------------------------
# Cleanup
# -----------------------------------------------------------------------------
cleanup() {
    if [[ -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}

trap cleanup EXIT

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    case "$MODE" in
        list)
            list_backups
            exit 0
            ;;
        verify)
            if [[ -z "$BACKUP_FILE" ]]; then
                log_error "No backup file specified for verification"
                exit 1
            fi
            verify_backup "$BACKUP_FILE"
            exit $?
            ;;
    esac

    # For restore operations
    parse_database_url

    case "$MODE" in
        latest)
            BACKUP_FILE=$(find_latest_backup)
            log "Using latest backup: $BACKUP_FILE"
            ;;
        s3)
            BACKUP_FILE=$(download_from_s3 "$S3_PATH")
            ;;
        restore)
            if [[ -z "$BACKUP_FILE" ]]; then
                log_error "No backup file specified"
                usage
                exit 1
            fi
            ;;
    esac

    # Verify the backup first
    verify_backup "$BACKUP_FILE" || exit 1

    # Confirm with user
    confirm_restore

    # Create pre-restore snapshot
    create_pre_restore_snapshot

    # Restore
    log "=========================================="
    log "Starting restore process"
    log "=========================================="

    local start_time=$(date +%s)
    restore_database "$BACKUP_FILE"
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log "=========================================="
    log "Restore completed in ${duration}s"
    log "=========================================="

    if [[ "$DRY_RUN" == "false" ]]; then
        log ""
        log "IMPORTANT: Verify the restored data before using the system!"
        log ""
    fi
}

main

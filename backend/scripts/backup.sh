#!/bin/bash
# =============================================================================
# Vitora HMIS - PostgreSQL Backup Script
# =============================================================================
# This script performs automated PostgreSQL backups with:
# - Daily full database backups
# - Encrypted off-site storage (S3/Wasabi)
# - Retention management (30 days local, 90 days remote)
# - Slack/email alerting on failures
#
# Usage:
#   ./backup.sh                    # Full backup with defaults
#   ./backup.sh --db-only          # Database backup only (no S3 upload)
#   ./backup.sh --media            # Include media files backup
#   ./backup.sh --env production   # Specify environment
#
# Cron setup (daily at 2 AM):
#   0 2 * * * /path/to/backend/scripts/backup.sh >> /var/log/vitora-backup.log 2>&1
#
# Environment Variables Required:
#   DATABASE_URL       - PostgreSQL connection string
#   BACKUP_ENCRYPTION_KEY - GPG passphrase for backup encryption
#   S3_BUCKET         - S3/Wasabi bucket name (optional, for off-site)
#   AWS_ACCESS_KEY_ID - S3 credentials (optional)
#   AWS_SECRET_ACCESS_KEY - S3 credentials (optional)
#   SLACK_WEBHOOK_URL - Slack notifications (optional)
#   ALERT_EMAIL       - Email for failure alerts (optional)
#
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$BACKEND_DIR")"

# Defaults
ENVIRONMENT="${VITORA_ENV:-staging}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/vitora}"
LOCAL_RETENTION_DAYS=30
REMOTE_RETENTION_DAYS=90
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="vitora_${ENVIRONMENT}_${TIMESTAMP}"

# Feature flags
DB_ONLY=false
INCLUDE_MEDIA=false
SKIP_S3=false
VERBOSE=false

# -----------------------------------------------------------------------------
# Parse Arguments
# -----------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case $1 in
        --db-only)
            DB_ONLY=true
            shift
            ;;
        --media)
            INCLUDE_MEDIA=true
            shift
            ;;
        --skip-s3)
            SKIP_S3=true
            shift
            ;;
        --env)
            ENVIRONMENT="$2"
            BACKUP_NAME="vitora_${ENVIRONMENT}_${TIMESTAMP}"
            shift 2
            ;;
        --backup-dir)
            BACKUP_DIR="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--db-only] [--media] [--skip-s3] [--env ENV] [--backup-dir DIR] [-v]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

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

# -----------------------------------------------------------------------------
# Alert Functions
# -----------------------------------------------------------------------------
send_slack_alert() {
    local status="$1"
    local message="$2"
    local color="$3"  # good, warning, danger
    
    if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
        curl -s -X POST "$SLACK_WEBHOOK_URL" \
            -H 'Content-Type: application/json' \
            -d "{
                \"attachments\": [{
                    \"color\": \"$color\",
                    \"title\": \"Vitora Backup $status\",
                    \"text\": \"$message\",
                    \"fields\": [
                        {\"title\": \"Environment\", \"value\": \"$ENVIRONMENT\", \"short\": true},
                        {\"title\": \"Timestamp\", \"value\": \"$(date '+%Y-%m-%d %H:%M:%S')\", \"short\": true}
                    ]
                }]
            }" || true
    fi
}

send_email_alert() {
    local subject="$1"
    local body="$2"
    
    if [[ -n "${ALERT_EMAIL:-}" ]] && command -v mail &> /dev/null; then
        echo "$body" | mail -s "$subject" "$ALERT_EMAIL" || true
    fi
}

alert_failure() {
    local message="$1"
    log_error "$message"
    send_slack_alert "FAILED" "$message" "danger"
    send_email_alert "[CRITICAL] Vitora Backup Failed - $ENVIRONMENT" "$message"
}

alert_success() {
    local message="$1"
    log "$message"
    send_slack_alert "SUCCESS" "$message" "good"
}

# -----------------------------------------------------------------------------
# Prerequisite Checks
# -----------------------------------------------------------------------------
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check for pg_dump
    if ! command -v pg_dump &> /dev/null; then
        alert_failure "pg_dump not found. Install postgresql-client."
        exit 1
    fi
    
    # Check for gpg (encryption)
    if ! command -v gpg &> /dev/null; then
        alert_failure "gpg not found. Install gnupg for backup encryption."
        exit 1
    fi
    
    # Check for aws cli (if S3 enabled)
    if [[ "$SKIP_S3" == "false" ]] && [[ -n "${S3_BUCKET:-}" ]]; then
        if ! command -v aws &> /dev/null; then
            log "Warning: aws CLI not found. Skipping S3 upload."
            SKIP_S3=true
        fi
    fi
    
    # Check DATABASE_URL
    if [[ -z "${DATABASE_URL:-}" ]]; then
        alert_failure "DATABASE_URL environment variable not set."
        exit 1
    fi
    
    # Check encryption key
    if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
        log "Warning: BACKUP_ENCRYPTION_KEY not set. Backups will NOT be encrypted."
    fi
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    log_verbose "Prerequisites check passed."
}

# -----------------------------------------------------------------------------
# Parse DATABASE_URL
# -----------------------------------------------------------------------------
parse_database_url() {
    # Parse postgres://user:password@host:port/dbname
    local url="${DATABASE_URL}"
    
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
    DB_NAME="${DB_NAME%%\?*}"  # Remove query params
    
    DB_HOST="${hostport%%:*}"
    DB_PORT="${hostport#*:}"
    
    # Default port if not specified
    if [[ "$DB_PORT" == "$DB_HOST" ]]; then
        DB_PORT="5432"
    fi
    
    log_verbose "Database: $DB_NAME @ $DB_HOST:$DB_PORT"
}

# -----------------------------------------------------------------------------
# Database Backup
# -----------------------------------------------------------------------------
backup_database() {
    log "Starting PostgreSQL backup..."
    
    local backup_file="$BACKUP_DIR/${BACKUP_NAME}_db.sql"
    local compressed_file="${backup_file}.gz"
    local encrypted_file="${compressed_file}.gpg"
    
    # Set password for pg_dump
    export PGPASSWORD="$DB_PASS"
    
    # Perform backup with custom format for better restoration options
    log_verbose "Running pg_dump..."
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --no-password \
        --verbose \
        --clean \
        --if-exists \
        --create \
        --format=custom \
        --file="$BACKUP_DIR/${BACKUP_NAME}_db.dump" 2>&1 | while read -r line; do
            log_verbose "pg_dump: $line"
        done
    
    # Also create a plain SQL backup for portability
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --no-password \
        --clean \
        --if-exists \
        --create \
        > "$backup_file" 2>&1
    
    unset PGPASSWORD
    
    # Compress
    log_verbose "Compressing backup..."
    gzip -f "$backup_file"
    
    # Encrypt if key provided
    if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
        log_verbose "Encrypting backup..."
        echo "$BACKUP_ENCRYPTION_KEY" | gpg --batch --yes --passphrase-fd 0 \
            --symmetric --cipher-algo AES256 \
            -o "$encrypted_file" "$compressed_file"
        rm "$compressed_file"
        FINAL_BACKUP_FILE="$encrypted_file"
    else
        FINAL_BACKUP_FILE="$compressed_file"
    fi
    
    # Calculate size and checksum
    local backup_size=$(du -h "$FINAL_BACKUP_FILE" | cut -f1)
    local checksum=$(sha256sum "$FINAL_BACKUP_FILE" | cut -d' ' -f1)
    
    log "Database backup complete: $FINAL_BACKUP_FILE ($backup_size)"
    log_verbose "SHA256: $checksum"
    
    # Save checksum
    echo "$checksum  $(basename "$FINAL_BACKUP_FILE")" > "${FINAL_BACKUP_FILE}.sha256"
    
    # Also keep the custom format dump (compressed automatically)
    if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
        echo "$BACKUP_ENCRYPTION_KEY" | gpg --batch --yes --passphrase-fd 0 \
            --symmetric --cipher-algo AES256 \
            -o "$BACKUP_DIR/${BACKUP_NAME}_db.dump.gpg" "$BACKUP_DIR/${BACKUP_NAME}_db.dump"
        rm "$BACKUP_DIR/${BACKUP_NAME}_db.dump"
    fi
}

# -----------------------------------------------------------------------------
# Media Files Backup
# -----------------------------------------------------------------------------
backup_media() {
    if [[ "$INCLUDE_MEDIA" != "true" ]]; then
        log_verbose "Skipping media backup (not requested)"
        return
    fi
    
    log "Starting media files backup..."
    
    local media_dir="$BACKEND_DIR/media"
    local media_backup="$BACKUP_DIR/${BACKUP_NAME}_media.tar.gz"
    
    if [[ ! -d "$media_dir" ]]; then
        log "No media directory found. Skipping."
        return
    fi
    
    # Create tarball
    tar -czf "$media_backup" -C "$BACKEND_DIR" media
    
    # Encrypt if key provided
    if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
        echo "$BACKUP_ENCRYPTION_KEY" | gpg --batch --yes --passphrase-fd 0 \
            --symmetric --cipher-algo AES256 \
            -o "${media_backup}.gpg" "$media_backup"
        rm "$media_backup"
        media_backup="${media_backup}.gpg"
    fi
    
    local backup_size=$(du -h "$media_backup" | cut -f1)
    log "Media backup complete: $media_backup ($backup_size)"
}

# -----------------------------------------------------------------------------
# Upload to S3/Wasabi
# -----------------------------------------------------------------------------
upload_to_s3() {
    if [[ "$SKIP_S3" == "true" ]] || [[ -z "${S3_BUCKET:-}" ]]; then
        log_verbose "Skipping S3 upload"
        return
    fi
    
    log "Uploading to S3: s3://$S3_BUCKET/backups/$ENVIRONMENT/"
    
    # Upload all backup files from this run
    for file in "$BACKUP_DIR/${BACKUP_NAME}"*; do
        if [[ -f "$file" ]]; then
            local filename=$(basename "$file")
            aws s3 cp "$file" "s3://$S3_BUCKET/backups/$ENVIRONMENT/$filename" \
                --storage-class STANDARD_IA \
                ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"} || {
                    log_error "Failed to upload $filename to S3"
                    return 1
                }
            log_verbose "Uploaded: $filename"
        fi
    done
    
    log "S3 upload complete"
}

# -----------------------------------------------------------------------------
# Retention Management
# -----------------------------------------------------------------------------
cleanup_old_backups() {
    log "Cleaning up old backups..."
    
    # Local cleanup
    find "$BACKUP_DIR" -name "vitora_${ENVIRONMENT}_*" -type f -mtime +$LOCAL_RETENTION_DAYS -delete
    log_verbose "Removed local backups older than $LOCAL_RETENTION_DAYS days"
    
    # S3 cleanup (if enabled)
    if [[ "$SKIP_S3" == "false" ]] && [[ -n "${S3_BUCKET:-}" ]]; then
        local cutoff_date=$(date -d "-${REMOTE_RETENTION_DAYS} days" +%Y-%m-%d)
        
        aws s3 ls "s3://$S3_BUCKET/backups/$ENVIRONMENT/" \
            ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"} 2>/dev/null | while read -r line; do
            local file_date=$(echo "$line" | awk '{print $1}')
            local filename=$(echo "$line" | awk '{print $4}')
            
            if [[ "$file_date" < "$cutoff_date" ]]; then
                aws s3 rm "s3://$S3_BUCKET/backups/$ENVIRONMENT/$filename" \
                    ${S3_ENDPOINT:+--endpoint-url "$S3_ENDPOINT"} || true
                log_verbose "Removed from S3: $filename"
            fi
        done
        
        log_verbose "Removed S3 backups older than $REMOTE_RETENTION_DAYS days"
    fi
}

# -----------------------------------------------------------------------------
# Write Backup Manifest
# -----------------------------------------------------------------------------
write_manifest() {
    local manifest_file="$BACKUP_DIR/${BACKUP_NAME}_manifest.json"
    
    cat > "$manifest_file" <<EOF
{
    "backup_name": "$BACKUP_NAME",
    "environment": "$ENVIRONMENT",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "timestamp_local": "$(date '+%Y-%m-%d %H:%M:%S %Z')",
    "database": {
        "host": "$DB_HOST",
        "name": "$DB_NAME",
        "port": "$DB_PORT"
    },
    "files": [
$(ls -la "$BACKUP_DIR/${BACKUP_NAME}"* 2>/dev/null | awk '{printf "        {\"name\": \"%s\", \"size\": %s},\n", $9, $5}' | sed '$ s/,$//')
    ],
    "encrypted": $(if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then echo "true"; else echo "false"; fi),
    "s3_uploaded": $(if [[ "$SKIP_S3" == "false" ]] && [[ -n "${S3_BUCKET:-}" ]]; then echo "true"; else echo "false"; fi),
    "retention": {
        "local_days": $LOCAL_RETENTION_DAYS,
        "remote_days": $REMOTE_RETENTION_DAYS
    }
}
EOF
    
    log_verbose "Manifest written: $manifest_file"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    log "=========================================="
    log "Vitora HMIS Backup - $ENVIRONMENT"
    log "=========================================="
    
    local start_time=$(date +%s)
    
    # Run backup steps
    check_prerequisites
    parse_database_url
    backup_database
    backup_media
    upload_to_s3
    cleanup_old_backups
    write_manifest
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "=========================================="
    log "Backup completed in ${duration}s"
    log "Backup location: $BACKUP_DIR"
    log "=========================================="
    
    alert_success "Backup completed successfully in ${duration}s. Files: $BACKUP_NAME"
}

# Trap errors
trap 'alert_failure "Backup failed at line $LINENO. Exit code: $?"' ERR

# Run
main

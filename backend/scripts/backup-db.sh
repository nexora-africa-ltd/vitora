#!/usr/bin/env bash
# =============================================================================
# Daily Database Backup — Vitora HMIS Production
# =============================================================================
# Dumps the production PostgreSQL database (Neon), encrypts with AES-256,
# and uploads to Azure Blob Storage with 30-day retention.
#
# Required environment variables:
#   DATABASE_URL              — Neon PostgreSQL connection string
#   AZURE_STORAGE_ACCOUNT    — Storage account name (e.g., vitorabackups)
#   AZURE_STORAGE_CONTAINER  — Blob container name (e.g., db-backups)
#   AZURE_STORAGE_SAS_TOKEN  — SAS token with write permission (or use managed identity)
#
# Optional environment variables:
#   BACKUP_ENCRYPTION_KEY    — GPG passphrase for AES-256 encryption (recommended)
#   BACKUP_RETENTION_DAYS    — Days to retain backups (default: 30)
#   SLACK_WEBHOOK_URL        — Slack webhook for success/failure alerts
#   ALERT_EMAIL              — Email address for failure alerts
#   VITORA_ENV               — Environment label (default: production)
#
# Usage:
#   bash scripts/backup-db.sh
#
# Retention: Keeps last 30 daily backups. Older backups are deleted.
# =============================================================================
set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────
TIMESTAMP=$(date -u +"%Y-%m-%d_%H%M%S")
ENVIRONMENT="${VITORA_ENV:-production}"
BACKUP_BASE="vitora-${ENVIRONMENT}-${TIMESTAMP}"
BACKUP_FILE="${BACKUP_BASE}.sql.gz"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
ENCRYPTION_ENABLED=false

# ─── Alert Functions ────────────────────────────────────────────────────────
send_slack() {
  local status="$1" message="$2" color="$3"
  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    curl -sf -X POST "${SLACK_WEBHOOK_URL}" \
      -H 'Content-Type: application/json' \
      -d "{
        \"attachments\": [{
          \"color\": \"${color}\",
          \"title\": \"Vitora DB Backup: ${status}\",
          \"text\": \"${message}\",
          \"fields\": [
            {\"title\": \"Environment\", \"value\": \"${ENVIRONMENT}\", \"short\": true},
            {\"title\": \"Timestamp\", \"value\": \"${TIMESTAMP}\", \"short\": true}
          ]
        }]
      }" >/dev/null 2>&1 || true
  fi
}

send_email() {
  local subject="$1" body="$2"
  if [[ -n "${ALERT_EMAIL:-}" ]] && command -v mail &>/dev/null; then
    echo "$body" | mail -s "$subject" "${ALERT_EMAIL}" 2>/dev/null || true
  fi
}

alert_failure() {
  local msg="$1"
  echo "ERROR: ${msg}"
  send_slack "FAILED" "${msg}" "danger"
  send_email "[CRITICAL] Vitora Backup Failed - ${ENVIRONMENT}" "${msg}"
}

alert_success() {
  local msg="$1"
  echo "SUCCESS: ${msg}"
  send_slack "SUCCESS" "${msg}" "good"
}

# Trap errors for alerting
trap 'alert_failure "Backup failed at line $LINENO (exit code $?). File: ${BACKUP_FILE}"' ERR

# ─── Validate required env vars ────────────────────────────────────────────
for var in DATABASE_URL AZURE_STORAGE_ACCOUNT AZURE_STORAGE_CONTAINER; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: $var is not set."
    exit 1
  fi
done

echo "==> Starting database backup: ${BACKUP_FILE}"
echo "    Timestamp: ${TIMESTAMP}"
echo "    Environment: ${ENVIRONMENT}"
echo "    Retention: ${RETENTION_DAYS} days"
echo "    Encryption: $(if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then echo "AES-256 (GPG)"; else echo "DISABLED (set BACKUP_ENCRYPTION_KEY to enable)"; fi)"

# ─── Dump & Compress ───────────────────────────────────────────────────────
echo "==> Running pg_dump..."
pg_dump "${DATABASE_URL}" \
  --no-owner \
  --no-privileges \
  --format=plain \
  --compress=0 \
  | gzip -9 > "/tmp/${BACKUP_FILE}"

FILESIZE=$(stat -f%z "/tmp/${BACKUP_FILE}" 2>/dev/null || stat --printf="%s" "/tmp/${BACKUP_FILE}" 2>/dev/null || echo "unknown")
echo "    Backup size: ${FILESIZE} bytes"

# Sanity check: backup must be > 1KB
if [[ "${FILESIZE}" != "unknown" ]] && [[ "${FILESIZE}" -lt 1024 ]]; then
  alert_failure "Backup suspiciously small (${FILESIZE} bytes). Possible empty dump."
  rm -f "/tmp/${BACKUP_FILE}"
  exit 1
fi

# ─── SHA-256 Checksum ──────────────────────────────────────────────────────
echo "==> Computing checksum..."
CHECKSUM=$(sha256sum "/tmp/${BACKUP_FILE}" | cut -d' ' -f1)
echo "${CHECKSUM}  ${BACKUP_FILE}" > "/tmp/${BACKUP_FILE}.sha256"
echo "    SHA-256: ${CHECKSUM}"

# ─── Encrypt (AES-256 via GPG) ─────────────────────────────────────────────
UPLOAD_FILE="/tmp/${BACKUP_FILE}"
if [[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  echo "==> Encrypting backup (AES-256)..."
  echo "${BACKUP_ENCRYPTION_KEY}" | gpg --batch --yes --passphrase-fd 0 \
    --symmetric --cipher-algo AES256 \
    -o "/tmp/${BACKUP_FILE}.gpg" "/tmp/${BACKUP_FILE}"
  rm -f "/tmp/${BACKUP_FILE}"
  UPLOAD_FILE="/tmp/${BACKUP_FILE}.gpg"
  BACKUP_FILE="${BACKUP_FILE}.gpg"
  ENCRYPTION_ENABLED=true
  echo "    Encrypted: ${BACKUP_FILE}"
fi

# ─── Upload to Azure Blob Storage ──────────────────────────────────────────
BLOB_URL="https://${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/${AZURE_STORAGE_CONTAINER}/${BACKUP_FILE}"

echo "==> Uploading to Azure Blob Storage..."
if [[ -n "${AZURE_STORAGE_SAS_TOKEN:-}" ]]; then
  # Upload backup using SAS token (curl-based, no Azure CLI needed in container)
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    -H "x-ms-blob-type: BlockBlob" \
    -H "x-ms-date: $(date -u +"%a, %d %b %Y %H:%M:%S GMT")" \
    --data-binary "@${UPLOAD_FILE}" \
    "${BLOB_URL}?${AZURE_STORAGE_SAS_TOKEN}")
  if [[ "${HTTP_CODE}" -ge 200 ]] && [[ "${HTTP_CODE}" -lt 300 ]]; then
    echo "    Uploaded: ${BLOB_URL} (HTTP ${HTTP_CODE})"
  else
    alert_failure "Azure Blob upload failed (HTTP ${HTTP_CODE})"
    rm -f "${UPLOAD_FILE}" "/tmp/${BACKUP_BASE}.sql.gz.sha256"
    exit 1
  fi

  # Upload checksum file
  curl -s -X PUT \
    -H "x-ms-blob-type: BlockBlob" \
    -H "x-ms-date: $(date -u +"%a, %d %b %Y %H:%M:%S GMT")" \
    --data-binary "@/tmp/${BACKUP_BASE}.sql.gz.sha256" \
    "https://${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/${AZURE_STORAGE_CONTAINER}/${BACKUP_BASE}.sql.gz.sha256?${AZURE_STORAGE_SAS_TOKEN}" >/dev/null 2>&1 || true

elif command -v az &>/dev/null; then
  # Upload using Azure CLI (managed identity)
  az storage blob upload \
    --account-name "${AZURE_STORAGE_ACCOUNT}" \
    --container-name "${AZURE_STORAGE_CONTAINER}" \
    --name "${BACKUP_FILE}" \
    --file "${UPLOAD_FILE}" \
    --auth-mode login \
    --overwrite 2>/dev/null
  echo "    Uploaded via Azure CLI (managed identity)"

  # Upload checksum
  az storage blob upload \
    --account-name "${AZURE_STORAGE_ACCOUNT}" \
    --container-name "${AZURE_STORAGE_CONTAINER}" \
    --name "${BACKUP_BASE}.sql.gz.sha256" \
    --file "/tmp/${BACKUP_BASE}.sql.gz.sha256" \
    --auth-mode login \
    --overwrite 2>/dev/null || true
else
  alert_failure "No upload method available. Set AZURE_STORAGE_SAS_TOKEN or install Azure CLI."
  rm -f "${UPLOAD_FILE}" "/tmp/${BACKUP_BASE}.sql.gz.sha256"
  exit 1
fi

# ─── Cleanup local temp files ──────────────────────────────────────────────
rm -f "${UPLOAD_FILE}" "/tmp/${BACKUP_BASE}.sql.gz.sha256"

# ─── Prune old backups (if Azure CLI available) ────────────────────────────
if command -v az &>/dev/null; then
  echo "==> Pruning backups older than ${RETENTION_DAYS} days..."
  CUTOFF_DATE=$(date -u -d "-${RETENTION_DAYS} days" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
                date -u -v-${RETENTION_DAYS}d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "")

  if [[ -n "${CUTOFF_DATE}" ]]; then
    OLD_BLOBS=$(az storage blob list \
      --account-name "${AZURE_STORAGE_ACCOUNT}" \
      --container-name "${AZURE_STORAGE_CONTAINER}" \
      --auth-mode login \
      --query "[?properties.creationTime < '${CUTOFF_DATE}'].name" \
      -o tsv 2>/dev/null || true)

    DELETED=0
    for blob in $OLD_BLOBS; do
      az storage blob delete \
        --account-name "${AZURE_STORAGE_ACCOUNT}" \
        --container-name "${AZURE_STORAGE_CONTAINER}" \
        --name "$blob" \
        --auth-mode login 2>/dev/null && ((DELETED++)) || true
    done
    echo "    Deleted ${DELETED} old backup(s)"
  fi
fi

# ─── Success ───────────────────────────────────────────────────────────────
FINAL_SIZE=$(echo "${FILESIZE}" | numfmt --to=iec 2>/dev/null || echo "${FILESIZE} bytes")
SUMMARY="Backup complete: ${BACKUP_FILE} (${FINAL_SIZE}, encrypted=${ENCRYPTION_ENABLED})"
echo "==> ${SUMMARY}"
alert_success "${SUMMARY}"

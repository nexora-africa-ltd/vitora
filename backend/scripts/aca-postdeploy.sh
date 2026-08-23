#!/usr/bin/env bash
set -euo pipefail

# File purpose:
#   Run non-startup maintenance tasks after deployment in ACA.
#   Keeps container startup fast/stable by moving heavy one-time tasks here.
#
# Usage:
#   bash scripts/aca-postdeploy.sh
#
# Args:
#   None (uses current app environment variables and database configuration).
#
# Supported env vars:
#   POSTDEPLOY_MODE=migrate|full (default: migrate)
#   RUN_SYNC_ROLE_PERMISSIONS=true|false (default: false)
#   RUN_BACKFILL_DEATH_RECORDS=true|false (default: false)
#   RUN_CREATE_MISSING_LAB_QUEUES=true|false (default: false)
#   RUN_CHECK_PII_INTEGRITY=true|false (default: false)

echo "==> Running post-deploy maintenance tasks..."

POSTDEPLOY_MODE="${POSTDEPLOY_MODE:-migrate}"
RUN_SYNC_ROLE_PERMISSIONS="${RUN_SYNC_ROLE_PERMISSIONS:-false}"
RUN_BACKFILL_DEATH_RECORDS="${RUN_BACKFILL_DEATH_RECORDS:-false}"
RUN_CREATE_MISSING_LAB_QUEUES="${RUN_CREATE_MISSING_LAB_QUEUES:-false}"
RUN_CHECK_PII_INTEGRITY="${RUN_CHECK_PII_INTEGRITY:-false}"

echo "==> Running migrations"
python manage.py migrate --noinput

if [ "$POSTDEPLOY_MODE" = "full" ] || [ "$RUN_SYNC_ROLE_PERMISSIONS" = "true" ]; then
  echo "==> Syncing role permissions"
  python manage.py sync_role_permissions
fi

if [ "$POSTDEPLOY_MODE" = "full" ] || [ "$RUN_BACKFILL_DEATH_RECORDS" = "true" ]; then
  echo "==> Backfilling death records"
  python manage.py backfill_death_records --apply
fi

if [ "$POSTDEPLOY_MODE" = "full" ] || [ "$RUN_CREATE_MISSING_LAB_QUEUES" = "true" ]; then
  echo "==> Creating missing lab queues"
  python manage.py create_missing_lab_queues
fi

if [ "$POSTDEPLOY_MODE" = "full" ] || [ "$RUN_CHECK_PII_INTEGRITY" = "true" ]; then
  echo "==> Checking PII encryption integrity"
  python manage.py check_pii_integrity --model Facility || true
fi

echo "==> Post-deploy maintenance complete"

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

echo "==> Running post-deploy maintenance tasks..."

echo "==> Running migrations"
python manage.py migrate --noinput

echo "==> Syncing role permissions"
python manage.py sync_role_permissions

echo "==> Backfilling death records"
python manage.py backfill_death_records --apply

echo "==> Creating missing lab queues"
python manage.py create_missing_lab_queues

echo "==> Checking PII encryption integrity"
python manage.py check_pii_integrity --model Facility || true

echo "==> Post-deploy maintenance complete"

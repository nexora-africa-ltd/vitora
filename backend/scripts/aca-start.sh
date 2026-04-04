#!/usr/bin/env bash
# =============================================================================
# Azure Container Apps Startup Script for Vitora HMIS Backend
# =============================================================================
# Runs migrations then starts Daphne (ASGI/WebSocket).
# Data seeding is a separate one-time operation — run via:
#   az containerapp exec -n vitora-api -g vitora-rg --command "bash scripts/seed.sh"
# =============================================================================
set -e

echo "==> Collecting static files..."
python manage.py collectstatic --noinput

echo "==> Running migrations..."
python manage.py migrate --noinput

# Sync RBAC permissions_matrix → Django Group permissions (idempotent)
python manage.py sync_role_permissions

# Backfill death records for historical DECEASED discharges (idempotent)
python manage.py backfill_death_records --apply

# Ensure lab queue entries exist for all in-house orders (idempotent)
python manage.py create_missing_lab_queues

# One-time seed (remove after first successful deploy)
if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "==> Running data seed..."
  bash scripts/seed.sh
fi

echo "==> Starting Daphne (ASGI) on port ${PORT:-8000}..."
exec daphne -b 0.0.0.0 -p "${PORT:-8000}" hmis.asgi:application

#!/bin/bash
# =============================================================================
# Superset entrypoint for Azure Container Apps
# Runs DB upgrade + admin creation on every start (idempotent), then starts
# the Gunicorn web server.
# =============================================================================
set -e

echo "==> Running Superset DB upgrade..."
superset db upgrade

echo "==> Ensuring admin user exists..."
superset fab create-admin \
  --username "${ADMIN_USERNAME:-admin}" \
  --firstname "${ADMIN_FIRST_NAME:-Vitora}" \
  --lastname "${ADMIN_LAST_NAME:-Admin}" \
  --email "${ADMIN_EMAIL:-admin@vitora.digital}" \
  --password "${SUPERSET_ADMIN_PASSWORD:-admin}" 2>/dev/null || true

echo "==> Running Superset init..."
superset init

echo "==> Starting Superset server..."
exec /usr/bin/run-server.sh

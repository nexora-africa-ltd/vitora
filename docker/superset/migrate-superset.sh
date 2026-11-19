# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
#
# Runs Superset database migrations and one-time bootstrap initialization.
#
# Use: execute this script in the deploy-time Superset migration Container Apps
# Job. It requires SUPERSET_SECRET_KEY, SUPERSET_META_DB_URL, and
# SUPERSET_ADMIN_PASSWORD; optional ADMIN_* values customize the bootstrap user.
#!/usr/bin/env bash
set -euo pipefail

echo "==> Running Superset DB upgrade..."
superset db upgrade

echo "==> Ensuring admin user exists..."
superset fab create-admin \
  --username "${ADMIN_USERNAME:-admin}" \
  --firstname "${ADMIN_FIRST_NAME:-Vitora}" \
  --lastname "${ADMIN_LAST_NAME:-Admin}" \
  --email "${ADMIN_EMAIL:-admin@vitora.digital}" \
  --password "${SUPERSET_ADMIN_PASSWORD:?SUPERSET_ADMIN_PASSWORD is required}" 2>/dev/null || true

echo "==> Running Superset init..."
superset init

echo "==> Superset migration and initialization completed."

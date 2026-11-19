#!/bin/bash
# =============================================================================
# Superset web-server entrypoint for Azure Container Apps.
#
# Migrations and bootstrap work run in migrate-superset.sh through a
# deploy-time Container Apps Job. Keep this process free of database mutation so
# an HTTP scale-from-zero starts only the Gunicorn web server.
# =============================================================================
set -euo pipefail

echo "==> Starting Superset server..."
exec /usr/bin/run-server.sh

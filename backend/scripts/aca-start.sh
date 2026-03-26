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

echo "==> Starting Daphne (ASGI) on port ${PORT:-8000}..."
exec daphne -b 0.0.0.0 -p "${PORT:-8000}" hmis.asgi:application

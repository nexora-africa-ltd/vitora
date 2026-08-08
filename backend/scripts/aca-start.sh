#!/usr/bin/env bash
# =============================================================================
# Azure Container Apps Startup Script for Vitora HMIS Backend
# =============================================================================
# Starts Daphne (ASGI/WebSocket).
# Database migrations and maintenance tasks run from deploy workflow/runbook.
# Args: none (reads PORT env var; defaults to 8000).
# =============================================================================
set -e

echo "==> Starting Daphne (ASGI) on port ${PORT:-8000}..."
exec daphne -b 0.0.0.0 -p "${PORT:-8000}" hmis.asgi:application

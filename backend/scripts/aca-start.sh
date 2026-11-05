#!/usr/bin/env bash
# =============================================================================
# Azure Container Apps Startup Script for Vitora HMIS Backend
# =============================================================================
# Starts the API, a Celery worker, or the singleton Celery Beat scheduler.
# Database migrations and maintenance tasks run from deploy workflow/runbook.
# Inputs: VITORA_PROCESS=api|worker|beat (defaults to api), PORT for the API.
# =============================================================================
set -e

case "${VITORA_PROCESS:-api}" in
    api)
        echo "==> Starting Daphne (ASGI) on port ${PORT:-8000}..."
        exec daphne -b 0.0.0.0 -p "${PORT:-8000}" hmis.asgi:application
        ;;
    worker)
        echo "==> Starting Celery worker for all configured queues..."
        exec celery -A hmis worker --loglevel=INFO \
            --queues sync,monitoring,maintenance,reporting,billing,laboratory
        ;;
    beat)
        echo "==> Starting singleton Celery Beat scheduler..."
        exec celery -A hmis beat --loglevel=INFO
        ;;
    *)
        echo "ERROR: Unknown VITORA_PROCESS=${VITORA_PROCESS}. Expected api, worker, or beat." >&2
        exit 64
        ;;
esac

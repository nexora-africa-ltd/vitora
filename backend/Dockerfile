# =============================================================================
# Vitora HMIS Backend - Production Dockerfile
# =============================================================================
# Single-stage build for Django + Daphne (ASGI with WebSocket support)
# Target: Azure Container Apps
#
# Uses mcr.microsoft.com base image to avoid Docker Hub rate limits
# during Azure Container Registry builds.
# =============================================================================

FROM docker.io/library/python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=hmis.settings.staging \
    PORT=8000

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system app \
    && adduser --system --ingroup app app

WORKDIR /app

# Install dependencies via Poetry (then remove build deps)
COPY pyproject.toml poetry.lock ./
RUN pip install --no-cache-dir poetry \
    && poetry config virtualenvs.create false \
    && poetry install --only main --no-root --no-interaction --no-ansi \
    && pip uninstall -y poetry \
    && apt-get purge -y build-essential \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy application code
COPY . .

# Collect static files at build time
RUN python manage.py collectstatic --noinput 2>/dev/null || true

# Make startup script executable
RUN chmod +x scripts/aca-start.sh

# Switch to non-root user
RUN chown -R app:app /app
USER app

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health/ || exit 1

ENTRYPOINT ["bash", "scripts/aca-start.sh"]

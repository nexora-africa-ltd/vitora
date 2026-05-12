"""
Superset configuration for Vitora HMIS embedding.

Mounted into the container at /app/superset_config.py.
"""

import os

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ.get("SUPERSET_SECRET_KEY", "vitora-dev-secret-change-in-production")

# Metadata database (Superset's own state — NOT the Vitora clinical DB)
SQLALCHEMY_DATABASE_URI = (
    f"postgresql+psycopg2://"
    f"{os.environ.get('POSTGRES_USER', 'superset')}:"
    f"{os.environ.get('POSTGRES_PASSWORD', 'superset')}@"
    f"superset-db:5432/"
    f"{os.environ.get('POSTGRES_DB', 'superset')}"
)

# ---------------------------------------------------------------------------
# Feature flags — enable embedded dashboards & guest tokens
# ---------------------------------------------------------------------------
FEATURE_FLAGS = {
    "EMBEDDED_SUPERSET": True,
    "ALERT_REPORTS": False,       # Not needed yet; saves worker cycles
}

# ---------------------------------------------------------------------------
# Guest token (used by Vitora backend to generate embedding tokens)
# ---------------------------------------------------------------------------
GUEST_TOKEN_JWT_SECRET = os.environ.get(
    "SUPERSET_SECRET_KEY", "vitora-dev-secret-change-in-production"
)
GUEST_TOKEN_JWT_ALGO = "HS256"
GUEST_TOKEN_JWT_EXP_SECONDS = 300       # 5 min (backend refreshes every 4 min)
GUEST_TOKEN_JWT_AUDIENCE = "superset"
GUEST_ROLE_NAME = "Gamma"

# ---------------------------------------------------------------------------
# CORS — allow the Vitora web-app to load the embedded iframe
# ---------------------------------------------------------------------------
ENABLE_CORS = True
CORS_OPTIONS = {
    "supports_credentials": True,
    "allow_headers": ["*"],
    "resources": [r"/api/*", r"/superset/embedded/*"],
    "origins": [
        "http://localhost:3009",          # Next.js dev
        "http://127.0.0.1:3009",        # Next.js dev (alternative)
        "https://vitora-navy.vercel.app", # Staging
        "https://staging.vitora.digital",
        "https://app.vitora.digital",     # Production (future)
    ],
}

# Allowed domains that can embed Superset dashboards (X-Frame-Options / CSP)
TALISMAN_ENABLED = False  # Disable for dev; enable + configure in production

# ---------------------------------------------------------------------------
# Cache (Redis)
# ---------------------------------------------------------------------------
CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 300,
    "CACHE_KEY_PREFIX": "superset_",
    "CACHE_REDIS_URL": "redis://superset-redis:6379/0",
}
DATA_CACHE_CONFIG = {**CACHE_CONFIG, "CACHE_KEY_PREFIX": "superset_data_"}
FILTER_STATE_CACHE_CONFIG = {**CACHE_CONFIG, "CACHE_KEY_PREFIX": "superset_filter_"}
EXPLORE_FORM_DATA_CACHE_CONFIG = {**CACHE_CONFIG, "CACHE_KEY_PREFIX": "superset_explore_"}

# ---------------------------------------------------------------------------
# Celery (async queries, thumbnail generation)
# ---------------------------------------------------------------------------

class CeleryConfig:
    broker_url = "redis://superset-redis:6379/1"
    result_backend = "redis://superset-redis:6379/2"
    imports = ("superset.sql_lab", "superset.tasks.scheduler")
    task_annotations = {
        "sql_lab.get_sql_results": {"rate_limit": "100/s"},
    }

CELERY_CONFIG = CeleryConfig

# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------
SUPERSET_WEBSERVER_TIMEOUT = 120
SQLLAB_TIMEOUT = 120

# Allow SQLite as a data source (local dev only — Superset blocks it by default).
# ⚠️  Disable this in production.
PREVENT_UNSAFE_DB_CONNECTIONS = False

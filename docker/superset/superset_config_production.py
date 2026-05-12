"""
Superset configuration for Vitora HMIS — Azure Container Apps (production/staging).

This config is baked into the Docker image at build time.
All sensitive values come from environment variables set in the container app.
"""

import os

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = os.environ["SUPERSET_SECRET_KEY"]  # MUST be set — no default

# Metadata database (Superset's own internal state)
SQLALCHEMY_DATABASE_URI = os.environ["SUPERSET_META_DB_URL"]
# e.g. "postgresql+psycopg2://superset:pass@vitora-superset-db/superset"

# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------
FEATURE_FLAGS = {
    "EMBEDDED_SUPERSET": True,
    "ALERT_REPORTS": False,
}

# ---------------------------------------------------------------------------
# Guest token (embedded dashboards)
# ---------------------------------------------------------------------------
GUEST_TOKEN_JWT_SECRET = os.environ["SUPERSET_SECRET_KEY"]
GUEST_TOKEN_JWT_ALGO = "HS256"
GUEST_TOKEN_JWT_EXP_SECONDS = 300
GUEST_TOKEN_JWT_AUDIENCE = "superset"
GUEST_ROLE_NAME = "Gamma"

# ---------------------------------------------------------------------------
# CORS — allow the Vitora web-app to load the embedded iframe
# ---------------------------------------------------------------------------
ENABLE_CORS = True
CORS_OPTIONS = {
    "supports_credentials": True,
    "allow_headers": ["*"],
    "resources": [r"/api/*", r"/superset/embedded/*", r"/guest_token/*"],
    "origins": os.environ.get(
        "SUPERSET_CORS_ORIGINS",
        "https://vitora-navy.vercel.app,https://staging.vitora.digital,https://app.vitora.digital",
    ).split(","),
}

# ---------------------------------------------------------------------------
# Talisman (CSP / X-Frame-Options) — required for production embedding
# ---------------------------------------------------------------------------
TALISMAN_ENABLED = True
TALISMAN_CONFIG = {
    "content_security_policy": {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:"],
        "worker-src": ["'self'", "blob:"],
        "connect-src": ["'self'"],
        "object-src": "'none'",
        "style-src": ["'self'", "'unsafe-inline'"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        "frame-ancestors": os.environ.get(
            "SUPERSET_FRAME_ANCESTORS",
            "https://vitora-navy.vercel.app https://staging.vitora.digital https://app.vitora.digital",
        ).split(" "),
    },
    "force_https": True,
    "session_cookie_secure": True,
}

# ---------------------------------------------------------------------------
# Cache (Redis)
# ---------------------------------------------------------------------------
_REDIS_URL = os.environ.get("SUPERSET_REDIS_URL", "redis://vitora-superset-redis:6379/0")

CACHE_CONFIG = {
    "CACHE_TYPE": "RedisCache",
    "CACHE_DEFAULT_TIMEOUT": 300,
    "CACHE_KEY_PREFIX": "superset_",
    "CACHE_REDIS_URL": _REDIS_URL,
}
DATA_CACHE_CONFIG = {**CACHE_CONFIG, "CACHE_KEY_PREFIX": "superset_data_"}
FILTER_STATE_CACHE_CONFIG = {**CACHE_CONFIG, "CACHE_KEY_PREFIX": "superset_filter_"}
EXPLORE_FORM_DATA_CACHE_CONFIG = {**CACHE_CONFIG, "CACHE_KEY_PREFIX": "superset_explore_"}

# ---------------------------------------------------------------------------
# Celery (async queries)
# ---------------------------------------------------------------------------
_REDIS_BROKER = os.environ.get("SUPERSET_REDIS_URL", "redis://vitora-superset-redis:6379/1")


class CeleryConfig:
    broker_url = _REDIS_BROKER
    result_backend = _REDIS_BROKER.replace("/1", "/2") if "/1" in _REDIS_BROKER else _REDIS_BROKER
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
PREVENT_UNSAFE_DB_CONNECTIONS = True  # Block SQLite in production

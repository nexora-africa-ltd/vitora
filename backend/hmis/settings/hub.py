"""
Facility Hub settings for Vitora HMIS.

This configuration is used when Django runs as a local facility hub
on the LAN (e.g., on a Raspberry Pi or dedicated PC).

Key differences from cloud/development:
- Uses SQLite (WAL mode) by default for facilities ≤20 staff
- No PowerSync (clients use REST sync + WebSocket)
- InMemoryChannelLayer (single-process) — upgrade to Redis for >10 clients
- Reduced external dependencies (no Sentry, no cloud storage)
- Syncs to cloud when internet is available

Usage:
  DJANGO_ENV=hub python manage.py runserver 0.0.0.0:9088
  # or via systemd service
"""

import os

from .base import *  # noqa: F401, F403, F405

DEBUG = False

# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------

# Accept connections from any LAN client
ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    "*",  # LAN clients connect by IP
]

# CORS: allow all origins on LAN (hub is not internet-facing)
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# Database — SQLite with WAL mode (performant for <20 concurrent users)
# ---------------------------------------------------------------------------

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.getenv("HUB_DB_PATH", BASE_DIR / "hub.sqlite3"),  # noqa: F405
        "OPTIONS": {
            "timeout": 30,  # Wait up to 30s for locks
            "init_command": (
                "PRAGMA journal_mode=WAL;"
                "PRAGMA synchronous=NORMAL;"
                "PRAGMA foreign_keys=ON;"
                "PRAGMA busy_timeout=30000;"
                "PRAGMA cache_size=-64000;"  # 64MB cache
            ),
        },
    }
}

# ---------------------------------------------------------------------------
# Security
# ---------------------------------------------------------------------------

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "hub-change-me-in-production")

# Session: use DB-backed sessions (no Redis required)
SESSION_ENGINE = "django.contrib.sessions.backends.db"

# Encryption key for PII fields (must match cloud for data compatibility)
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")

# ---------------------------------------------------------------------------
# Channel Layers (WebSocket)
# ---------------------------------------------------------------------------

# InMemoryChannelLayer is fine for a single-process hub (<10 clients).
# For larger facilities, set HUB_REDIS_URL to enable Redis channel layer.
_redis_url = os.getenv("HUB_REDIS_URL", "")

if _redis_url:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [_redis_url],
            },
        },
    }
else:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels.layers.InMemoryChannelLayer",
        },
    }

# ---------------------------------------------------------------------------
# Sync Configuration
# ---------------------------------------------------------------------------

# Hub syncs to the cloud server
SYNC_ENABLED = True
SYNC_SERVER_URL = os.getenv("SYNC_SERVER_URL", "https://api.vitora.digital/api/sync")
SYNC_BATCH_SIZE = int(os.getenv("SYNC_BATCH_SIZE", "100"))
SYNC_MAX_RETRIES = int(os.getenv("SYNC_MAX_RETRIES", "5"))

# How often the hub pushes changes to cloud (seconds)
HUB_CLOUD_SYNC_INTERVAL = int(os.getenv("HUB_CLOUD_SYNC_INTERVAL", "30"))

# ---------------------------------------------------------------------------
# Celery (optional — for background sync to cloud)
# ---------------------------------------------------------------------------

# If no Redis, disable Celery and use a simple thread-based sync worker
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "")

if not CELERY_BROKER_URL:
    # Signal to the app that Celery is not available — use thread-based sync
    CELERY_ALWAYS_EAGER = True

# ---------------------------------------------------------------------------
# Disabled features (not needed on hub)
# ---------------------------------------------------------------------------

# No Sentry on local hub
SENTRY_DSN = ""

# No PowerSync (clients use REST sync)
POWERSYNC_URL = ""
POWERSYNC_JWT_KID = ""
POWERSYNC_JWT_AUDIENCE = ""

# No email sending from hub (cloud handles this)
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# ---------------------------------------------------------------------------
# Static Files
# ---------------------------------------------------------------------------

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"  # noqa: F405

# WhiteNoise for serving static files without nginx
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "filename": os.getenv("HUB_LOG_FILE", BASE_DIR / "hub.log"),  # noqa: F405
            "maxBytes": 10 * 1024 * 1024,  # 10MB
            "backupCount": 5,
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console", "file"],
        "level": "INFO",
    },
    "loggers": {
        "hmis": {
            "handlers": ["console", "file"],
            "level": "INFO",
            "propagate": False,
        },
        "django": {
            "handlers": ["console", "file"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}

# ---------------------------------------------------------------------------
# Hub Identity
# ---------------------------------------------------------------------------

# Unique identifier for this hub (set during installation)
HUB_ID = os.getenv("HUB_ID", "")
HUB_FACILITY_ID = os.getenv("HUB_FACILITY_ID", "")
HUB_ORGANIZATION_ID = os.getenv("HUB_ORGANIZATION_ID", "")

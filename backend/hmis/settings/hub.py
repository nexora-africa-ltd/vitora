# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
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
# Cookie Auth — HTTP LAN (no HTTPS)
# ---------------------------------------------------------------------------
# The hub runs on plain HTTP over LAN.  Secure=True would prevent the browser
# from storing the cookies, and SameSite=Lax blocks cross-origin fetch.
# The Tauri webview is on 127.0.0.1:<sidecar-port> while the hub is on
# 192.168.x.x:9088, which are different origins.
AUTH_COOKIE_SECURE = False
AUTH_COOKIE_SAMESITE = "Lax"
AUTH_COOKIE_DOMAIN = None  # Let the browser scope to the hub's IP
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = False

# WhiteNoise middleware for serving static files (must be after SecurityMiddleware)
MIDDLEWARE.insert(  # noqa: F405
    MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1,  # noqa: F405
    "whitenoise.middleware.WhiteNoiseMiddleware",
)

# ---------------------------------------------------------------------------
# Database — SQLite with WAL mode (performant for <20 concurrent users)
# ---------------------------------------------------------------------------

HUB_DATA_DIR = os.getenv("HUB_DATA_DIR", os.path.join(str(BASE_DIR), "data"))  # noqa: F405
HUB_DB_PATH = os.getenv("HUB_DB_PATH", os.path.join(HUB_DATA_DIR, "hub.sqlite3"))
os.makedirs(HUB_DATA_DIR, exist_ok=True)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": HUB_DB_PATH,
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


def _get_or_generate_secret_key() -> str:
    """
    Return SECRET_KEY from env, or generate-and-persist one in the hub data
    directory on first run.  Never falls back to a hardcoded string.
    """
    key = os.getenv("DJANGO_SECRET_KEY", "")
    if key:
        return key

    import secrets as _secrets  # stdlib — always available

    key_file = os.path.join(
        HUB_DATA_DIR,
        ".hub_secret_key",
    )
    if os.path.exists(key_file):
        with open(key_file) as f:
            stored = f.read().strip()
        if stored:
            return stored

    # Generate a new 50-char URL-safe secret key (Django convention)
    new_key = _secrets.token_urlsafe(50)
    # Write with owner-read-only permissions (0600)
    old_umask = os.umask(0o177)
    try:
        with open(key_file, "w") as f:
            f.write(new_key)
    finally:
        os.umask(old_umask)
    return new_key


SECRET_KEY = _get_or_generate_secret_key()

# Session: use DB-backed sessions (no Redis required)
SESSION_ENGINE = "django.contrib.sessions.backends.db"

# MFA is enforced on hubs as well as staging/production.
MFA_ENFORCEMENT = True

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

# Hub syncs to the cloud server (can be temporarily disabled during bootstrap)
SYNC_ENABLED = os.getenv("SYNC_ENABLED", "true").lower() == "true"
SYNC_SERVER_URL = os.getenv("SYNC_SERVER_URL", "https://api.vitora.digital/api/sync")
SYNC_BATCH_SIZE = int(os.getenv("SYNC_BATCH_SIZE", "500"))
SYNC_MAX_RETRIES = int(os.getenv("SYNC_MAX_RETRIES", "5"))

# Seconds to wait between consecutive pull pages during a full-pull. Reduces
# the chance of tripping upstream rate limiters (Azure Front Door / WAF).
SYNC_PULL_PAGE_DELAY = float(os.getenv("SYNC_PULL_PAGE_DELAY", "0.5"))

# Pull preflight checks ensure critical reference data exists before materializing
# dependent rows. If auto-import is enabled and ICD-10 is missing, the hub will
# attempt a local import before continuing with pull.
HUB_SYNC_PREFLIGHT_STRICT = os.getenv("HUB_SYNC_PREFLIGHT_STRICT", "true").lower() == "true"
HUB_SYNC_AUTO_IMPORT_ICD10_ON_PREFLIGHT = (
    os.getenv("HUB_SYNC_AUTO_IMPORT_ICD10_ON_PREFLIGHT", "true").lower() == "true"
)

# How often the hub pushes changes to cloud (seconds)
HUB_CLOUD_SYNC_INTERVAL = int(os.getenv("HUB_CLOUD_SYNC_INTERVAL", "30"))

# Hub-created users start their PK at this offset so they never collide with
# cloud-assigned PKs (which start at 1 and grow sequentially).  The value
# 100_000 gives the cloud room for ~100k users before any chance of overlap —
# far beyond realistic usage for any single organization.
HUB_USER_PK_OFFSET = int(os.getenv("HUB_USER_PK_OFFSET", "100000"))

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

# Write static files to a writable data dir (NOT inside the install dir,
# which on Windows lives under C:\Program Files\ and is read-only by default).
# Falls back to BASE_DIR/staticfiles when HUB_DATA_DIR is not set (dev/test).
_hub_data_dir = HUB_DATA_DIR.strip()
if _hub_data_dir:
    STATIC_ROOT = os.path.join(_hub_data_dir, "staticfiles")
    os.makedirs(STATIC_ROOT, exist_ok=True)
else:
    STATIC_ROOT = BASE_DIR / "staticfiles"  # noqa: F405

# WhiteNoise for serving static files without nginx.
# Use the non-manifest variant: tolerates missing files (returns 404 instead
# of 500) and doesn't require staticfiles.json to be perfectly in sync.
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

# Insert WhiteNoise middleware right after SecurityMiddleware
try:
    _sec_idx = MIDDLEWARE.index("django.middleware.security.SecurityMiddleware")  # noqa: F405
    MIDDLEWARE.insert(_sec_idx + 1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405
except ValueError:
    MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405

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
HUB_FACILITY_NAME = os.getenv("HUB_FACILITY_NAME", "Vitora Hub")
HUB_PORT = int(os.getenv("HUB_PORT", "9088"))

# Auto-update: set to False to disable automatic update application.
# When False, updates are still checked/reported but not applied automatically.
HUB_AUTO_UPDATE = os.getenv("HUB_AUTO_UPDATE", "true").lower() in ("true", "1", "yes")

# Enable the setup wizard so admins can bootstrap org/facility/user via the web UI
SETUP_WIZARD_ENABLED = True

# ---------------------------------------------------------------------------
# Hub License Guard
# ---------------------------------------------------------------------------
# Add HubLicenseGuardMiddleware after authentication (to verify JWT on requests)
MIDDLEWARE.insert(  # noqa: F405
    MIDDLEWARE.index("django.contrib.auth.middleware.AuthenticationMiddleware") + 1,  # noqa: F405
    "hmis.apps.core.middleware.HubLicenseGuardMiddleware",
)

# Hub Watermark Middleware (Phase 5C — injects X-Vitora-Build header)
MIDDLEWARE.append("hmis.apps.core.middleware.HubWatermarkMiddleware")  # noqa: F405

# Path to the cached license JWT file (written by installer / check-in task)
HUB_LICENSE_TOKEN_PATH = os.path.join(
    HUB_DATA_DIR,
    "license.jwt",
)

# ---------------------------------------------------------------------------
# Hub Feature Gate — Cloud-Only Modules (Phase 1)
# ---------------------------------------------------------------------------
# On hubs, these modules require a valid license AND the feature enabled.
# Without internet → these modules degrade after license expiry.
# The feature gate is enforced by SubscriptionFeatureGateMiddleware (already
# in base MIDDLEWARE) via the plan features, plus the HubLicenseGuardMiddleware
# blocks everything when the license is fully expired.
SUBSCRIPTION_FEATURE_ENFORCEMENT = True

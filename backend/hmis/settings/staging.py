"""
Staging settings for Vitora HMIS.

Used for stakeholder demos and workflow validation.
Mimics production behavior but with relaxed security for demo purposes.
"""

import os

import dj_database_url

from .base import *  # noqa: F401, F403

# =============================================================================
# Core Settings
# =============================================================================
DEBUG = False  # Production-like behavior

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv(
        "ALLOWED_HOSTS",
        ".azurecontainerapps.io,.vercel.app,localhost",
    ).split(",")
    if host.strip()
]

# =============================================================================
# Database - Can use SQLite for demos or PostgreSQL for Render
# =============================================================================
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # PostgreSQL (Neon / Vercel Postgres / Render)
    DATABASES = {
        "default": dj_database_url.config(
            default=DATABASE_URL,
            conn_max_age=600,
            conn_health_checks=True,
            ssl_require=True,
        )
    }
    # Wrap DB engine for Prometheus query metrics
    DATABASES["default"]["ENGINE"] = "django_prometheus.db.backends.postgresql"
else:
    # SQLite for simple demos (pre-seeded with sample data)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "vitora_staging.db",  # noqa: F405
        }
    }

# =============================================================================
# Static Files (Whitenoise)
# =============================================================================
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# =============================================================================
# Security - Production-like but SSL optional for local demos
# =============================================================================
SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "false").lower() == "true"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "false").lower() == "true"
CSRF_COOKIE_SECURE = os.getenv("CSRF_COOKIE_SECURE", "false").lower() == "true"

# HttpOnly cookie auth settings (cross-origin staging deployment)
AUTH_COOKIE_SECURE = os.getenv("AUTH_COOKIE_SECURE", "true").lower() == "true"
AUTH_COOKIE_SAMESITE = os.getenv("AUTH_COOKIE_SAMESITE", "None")
AUTH_COOKIE_DOMAIN = os.getenv("AUTH_COOKIE_DOMAIN", None)

# HSTS disabled for staging (easier testing)
SECURE_HSTS_SECONDS = 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False

# =============================================================================
# CORS - Allow staging frontend
# =============================================================================
CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "https://vitora-navy.vercel.app,https://staging.vitora.digital,http://localhost:3009",
    ).split(",")
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True
# Desktop app connects from http://127.0.0.1:<random-port> (Tauri Node sidecar)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://127\.0\.0\.1:\d+$",
    r"^http://localhost:\d+$",
]
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-idempotency-key",  # Sprint 1.7: Idempotent API operations
    "x-facility-id",  # Multi-facility: facility context header
    "x-organization-id",  # Multi-org: organization context header
    "x-vitora-client",  # Desktop app identifier: "desktop/<version>"
]

CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CSRF_TRUSTED_ORIGINS",
        "https://vitora-navy.vercel.app,https://staging.vitora.digital",
    ).split(",")
    if origin.strip()
]

# =============================================================================
# MFA — Disabled for staging demos by default, enable via env var
# =============================================================================
MFA_ENFORCEMENT = os.getenv("MFA_ENFORCEMENT", "false").lower() == "true"

# =============================================================================
# Demo Mode Flag
# =============================================================================
# This flag can be checked in views/serializers to show demo-specific behavior
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"

# Demo facility name (shown in banner)
DEMO_FACILITY_NAME = os.getenv("DEMO_FACILITY_NAME", "Demo Health Facility")

# =============================================================================
# Encryption - Use dev key for staging (not real patient data)
# =============================================================================
ENCRYPTION_KEY = os.getenv(
    "ENCRYPTION_KEY",
    "zPvPKpZGcLmqPJ3L2oXZBCH_gJGWl5C6FZp8YMfFgFA=",
)
FIELD_ENCRYPTION_KEY = ENCRYPTION_KEY

# =============================================================================
# PowerSync — offline-first data sync
# =============================================================================
# Set the PowerSync Cloud instance URL here for staging demos.
# The frontend reads NEXT_PUBLIC_POWERSYNC_URL separately.
POWERSYNC_URL = os.getenv("POWERSYNC_URL", "")

# Key ID for JWT kid header — must match the KID configured in the
# PowerSync Cloud dashboard under "HS256 Authentication Tokens (ADVANCED)".
POWERSYNC_JWT_KID = os.getenv("POWERSYNC_JWT_KID", "vitora-hmis-1")

# JWT audience — must match the custom audience in the PowerSync Cloud
# instance settings (or default to the instance URL).
POWERSYNC_JWT_AUDIENCE = os.getenv("POWERSYNC_JWT_AUDIENCE", "powersync")

# =============================================================================
# SHA Integration - Sandbox mode for demos
# =============================================================================
SHA_ENABLED = os.getenv("SHA_ENABLED", "true").lower() == "true"
SHA_API_BASE_URL = os.getenv("SHA_API_BASE_URL", "https://uat.dha.go.ke")  # UAT endpoint

# =============================================================================
# ICD-11 API Configuration
# =============================================================================
# ICD11_USE_LOCAL=False: Try DHA Terminology API first, fall back to local container
# ICD11_USE_LOCAL=True: Use local Docker container only (whoicd/icd-api)
# The fallback logic ensures ICD-11 search works even if DHA API is unavailable
ICD11_USE_LOCAL = os.getenv("ICD11_USE_LOCAL", "false").lower() == "true"

# =============================================================================
# Celery - Eager mode (no Redis required)
# =============================================================================
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# =============================================================================
# Email - Console backend for staging (no real emails)
# =============================================================================
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# =============================================================================
# Logging - Verbose for debugging stakeholder feedback
# =============================================================================
LOGGING = {  # noqa: F811
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "[{asctime}] {levelname} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "hmis": {
            "handlers": ["console"],
            "level": "DEBUG",  # Verbose for staging debugging
            "propagate": False,
        },
    },
}

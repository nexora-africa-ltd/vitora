# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Production settings for Vitora HMIS.

These settings are used for production deployment (including Render).
"""

import copy
import os

import dj_database_url

from .base import *  # noqa: F401, F403

# IMPORTANT: Don't mutate the shared LOGGING dict imported from base.py.
# Some tests import/reload production settings in-process with a custom LOG_FILE.
# If we mutate LOGGING in-place, later test modules (including ASGI/Channels)
# can inherit a broken file handler configuration.
LOGGING = copy.deepcopy(LOGGING)  # noqa: F405

DEBUG = False

ALLOWED_HOSTS = [host.strip() for host in os.getenv("ALLOWED_HOSTS", "").split(",") if host.strip()]

# Database - PostgreSQL for production
# Render provides DATABASE_URL automatically
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Use dj-database-url for Render/Heroku-style DATABASE_URL
    DATABASES = {
        "default": dj_database_url.config(
            default=DATABASE_URL,
            conn_max_age=600,
            conn_health_checks=True,
            ssl_require=True,
        )
    }
    DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True
    # Wrap DB engine for Prometheus query metrics
    DATABASES["default"]["ENGINE"] = "django_prometheus.db.backends.postgresql"
else:
    # Fallback to individual env vars
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("DB_NAME", "vitora_hmis"),
            "USER": os.getenv("DB_USER", "postgres"),
            "PASSWORD": os.getenv("DB_PASSWORD", ""),
            "HOST": os.getenv("DB_HOST", "localhost"),
            "PORT": os.getenv("DB_PORT", "5432"),
            "CONN_MAX_AGE": 600,
            "DISABLE_SERVER_SIDE_CURSORS": True,
        }
    }

# Whitenoise for static files
# Insert after SecurityMiddleware
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
STORAGES = dict(globals().get("STORAGES", {}))
STORAGES["staticfiles"] = {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"}

# Hub↔Cloud sync: enable so cloud queues downward changes for hub pull
SYNC_ENABLED = True
ENVIRONMENT = "production"

# Demo mode — MUST be disabled in production (real patient data)
DEMO_MODE = False

# Onboarding enforcement — enabled in production
ONBOARDING_ENFORCEMENT = True

# Active shift enforcement — enabled in production
ACTIVE_SHIFT_ENFORCEMENT = True

# PowerSync integration — env vars for the PowerSync service (self-hosted)
# These are read by powersync/powersync.yaml, not by Django directly.
# Listed here for documentation and .env template purposes.
POWERSYNC_URL = os.getenv("POWERSYNC_URL", "")  # e.g. https://ps.example.com
POWERSYNC_JWT_KID = os.getenv("POWERSYNC_JWT_KID", "vitora-hmis-1")
POWERSYNC_JWT_AUDIENCE = os.getenv("POWERSYNC_JWT_AUDIENCE", "powersync")

# Security settings for production
# Always enforce HTTPS redirect in production.
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")  # Trust Render's proxy

# MFA enforcement — always on in production (DHA compliance)
MFA_ENFORCEMENT = True
ADMIN_MFA_REQUIRED = True
ADMIN_SESSION_TIMEOUT_SECONDS = int(os.getenv("ADMIN_SESSION_TIMEOUT_SECONDS", "900"))
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# HttpOnly cookie auth settings (cross-origin production deployment)
AUTH_COOKIE_SECURE = True
AUTH_COOKIE_SAMESITE = os.getenv("AUTH_COOKIE_SAMESITE", "None")
AUTH_COOKIE_DOMAIN = os.getenv("AUTH_COOKIE_DOMAIN", None)
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# CORS - restrict to specific origins in production
CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if origin.strip()
]
# Desktop app connects from http://127.0.0.1:<random-port> (Tauri Node sidecar)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://127\.0\.0\.1:\d+$",
]
CORS_ALLOW_CREDENTIALS = True
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
    "x-share-pin",  # Public DICOM share link PIN header
]

# CSRF trusted origins (required for Django 4.0+)
CSRF_TRUSTED_ORIGINS = [
    origin.strip() for origin in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",") if origin.strip()
]

# Email backend for production
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")

# Logging for production
# Render captures stdout/stderr automatically - use console logging only
LOG_FILE = os.getenv("LOG_FILE", "")
if LOG_FILE:
    # Traditional server with file logging
    LOGGING["handlers"]["file"] = {  # noqa: F405
        "class": "logging.handlers.RotatingFileHandler",
        "filename": LOG_FILE,
        "maxBytes": 1024 * 1024 * 10,  # 10MB
        "backupCount": 5,
        "formatter": "verbose",
    }
    LOGGING["root"]["handlers"] = ["console", "file"]  # noqa: F405
    LOGGING["loggers"]["django"]["handlers"] = ["console", "file"]  # noqa: F405
else:
    # PaaS like Render - console only
    LOGGING["root"]["handlers"] = ["console"]  # noqa: F405
    LOGGING["loggers"]["django"]["handlers"] = ["console"]  # noqa: F405

# Channel Layers — Use Redis in production for cross-process WebSocket support
REDIS_URL = os.getenv("REDIS_URL", "")
if REDIS_URL:
    # Enforce TLS for Redis in production — reject plaintext redis:// URLs
    if not REDIS_URL.startswith("rediss://"):
        import warnings

        warnings.warn(
            "REDIS_URL should use rediss:// (TLS) in production. "
            "Plaintext redis:// connections are insecure.",
            stacklevel=1,
        )
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {
                "hosts": [REDIS_URL],
                "capacity": 1500,  # Max messages per channel before oldest dropped
                "expiry": 60,  # Message TTL in seconds
            },
        },
    }

    # Use the same Redis for Celery broker in production
    CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
    CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)

# =============================================================================
# Encryption — MUST be set via environment (no defaults in production)
# =============================================================================
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")
FIELD_ENCRYPTION_KEY = ENCRYPTION_KEY
PII_HMAC_KEY = os.getenv("PII_HMAC_KEY", "")

if not ENCRYPTION_KEY:
    import warnings

    warnings.warn(
        "ENCRYPTION_KEY is not set. PII encryption will fail. "
        "Set ENCRYPTION_KEY in your environment.",
        stacklevel=1,
    )

# =============================================================================
# SMS Backend — Use real provider in production
# =============================================================================
SMS_BACKEND = os.getenv("SMS_BACKEND", "hmis.apps.core.sms.backends.AfricasTalkingSMSBackend")
SMS_SENDER_ID = os.getenv("SMS_SENDER_ID", "VitoraHMIS")

# =============================================================================
# WebAuthn / Passkeys
# =============================================================================
WEBAUTHN_RP_ID = os.getenv("WEBAUTHN_RP_ID", "")
WEBAUTHN_ORIGIN = os.getenv("WEBAUTHN_ORIGIN", "")

# =============================================================================
# Frontend URL (for email links, password resets, etc.)
# =============================================================================
FRONTEND_URL = os.getenv("FRONTEND_URL", "")
DOCUMENT_VERIFICATION_URL = os.getenv("DOCUMENT_VERIFICATION_URL", "")

# Re-evaluate media storage backend from environment at production import time.
# Tests reload only this module (not base.py), so we must derive storage config
# here as well to honor MEDIA_BACKEND changes.
_media_backend = os.getenv("MEDIA_BACKEND", "local").strip().lower()
if _media_backend == "azure_blob":
    STORAGES["default"] = {
        "BACKEND": "storages.backends.azure_storage.AzureStorage",
        "OPTIONS": {
            "connection_string": os.getenv("AZURE_STORAGE_CONNECTION_STRING", ""),
            "account_name": os.getenv("AZURE_MEDIA_STORAGE_ACCOUNT_NAME", ""),
            "account_key": os.getenv("AZURE_MEDIA_STORAGE_ACCOUNT_KEY", ""),
            "azure_container": os.getenv("AZURE_MEDIA_CONTAINER", "vitora-media"),
            "overwrite_files": False,
        },
    }

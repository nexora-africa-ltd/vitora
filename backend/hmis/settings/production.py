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
        }
    }

# Whitenoise for static files
# Insert after SecurityMiddleware
MIDDLEWARE.insert(1, "whitenoise.middleware.WhiteNoiseMiddleware")  # noqa: F405
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

# PowerSync integration — env vars for the PowerSync service (self-hosted)
# These are read by powersync/powersync.yaml, not by Django directly.
# Listed here for documentation and .env template purposes.
POWERSYNC_URL = os.getenv("POWERSYNC_URL", "")  # e.g. https://ps.example.com

# Security settings for production
# Note: Render handles SSL termination, so we may need to disable redirect
SECURE_SSL_REDIRECT = os.getenv("SECURE_SSL_REDIRECT", "true").lower() == "true"
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")  # Trust Render's proxy

# MFA enforcement — always on in production (DHA compliance)
MFA_ENFORCEMENT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# CORS - restrict to specific origins in production
CORS_ALLOWED_ORIGINS = [
    origin.strip() for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if origin.strip()
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

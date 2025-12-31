"""
Development settings for Vitora HMIS.

These settings are used for local development.
"""

import os

from .base import *  # noqa: F401, F403

DEBUG = True

ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    ".ngrok-free.dev",  # Allow all ngrok subdomains
    ".ngrok.io",  # Legacy ngrok domains
    "*",  # Allow all hosts in development
]

# CORS settings for development
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = [
    "DELETE",
    "GET",
    "OPTIONS",
    "PATCH",
    "POST",
    "PUT",
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
    "ngrok-skip-browser-warning",
]

# CSRF settings for API (JWT doesn't use cookies, so CSRF isn't needed)
CSRF_TRUSTED_ORIGINS = [
    "https://*.ngrok-free.dev",
    "https://*.ngrok.io",
    "http://localhost:*",
    "http://127.0.0.1:*",
]

# Disable CSRF for API endpoints in development
# This is safe because we use JWT authentication, not session cookies
MIDDLEWARE = [m for m in MIDDLEWARE if m != "django.middleware.csrf.CsrfViewMiddleware"]  # noqa: F405

# Encryption key for sensitive data (generate a new one for production!)
# To generate: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY = os.getenv(
    "ENCRYPTION_KEY",
    "zPvPKpZGcLmqPJ3L2oXZBCH_gJGWl5C6FZp8YMfFgFA=",  # Default for dev only!
)
FIELD_ENCRYPTION_KEY = ENCRYPTION_KEY

# Sync server configuration (for offline sync)
SYNC_SERVER_URL = os.getenv("SYNC_SERVER_URL", "http://localhost:9088/api/sync")
SYNC_ENABLED = os.getenv("SYNC_ENABLED", "false").lower() == "true"
SYNC_BATCH_SIZE = int(os.getenv("SYNC_BATCH_SIZE", "100"))
SYNC_MAX_RETRIES = int(os.getenv("SYNC_MAX_RETRIES", "3"))

# Development-specific apps
INSTALLED_APPS += [  # noqa: F405
    "django_extensions"
]

# Enhanced logging for development
LOGGING["loggers"]["django"]["level"] = "DEBUG"  # noqa: F405

# Django Debug Toolbar (optional, uncomment if needed)
# INSTALLED_APPS += ["debug_toolbar"]
# MIDDLEWARE.insert(0, "debug_toolbar.middleware.DebugToolbarMiddleware")
# INTERNAL_IPS = ["127.0.0.1"]

# Email backend for development (console)
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Celery settings for development
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = "Africa/Nairobi"
CELERY_TASK_ALWAYS_EAGER = os.getenv("CELERY_TASK_ALWAYS_EAGER", "true").lower() == "true"
CELERY_TASK_EAGER_PROPAGATES = True

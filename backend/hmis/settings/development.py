"""
Development settings for Vitora HMIS.

These settings are used for local development.
"""

from .base import *  # noqa: F401, F403

DEBUG = True

ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

# CORS settings for development
CORS_ALLOW_ALL_ORIGINS = True

# Development-specific apps
INSTALLED_APPS += [  # noqa: F405
    "django_extensions",
]

# Enhanced logging for development
LOGGING["loggers"]["django"]["level"] = "DEBUG"  # noqa: F405

# Django Debug Toolbar (optional, uncomment if needed)
# INSTALLED_APPS += ["debug_toolbar"]
# MIDDLEWARE.insert(0, "debug_toolbar.middleware.DebugToolbarMiddleware")
# INTERNAL_IPS = ["127.0.0.1"]

# Email backend for development (console)
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

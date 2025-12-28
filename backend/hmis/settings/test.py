"""
Test settings for Vitora HMIS.

These settings are used for running tests.
"""

from .base import *  # noqa: F401, F403

DEBUG = False

# Use in-memory SQLite for faster tests
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Use fast password hasher for tests
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# Disable Celery for tests
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# Email backend for tests
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Sync settings for tests
SYNC_ENABLED = False
SYNC_SERVER_URL = "http://test-server.example.com"

# Encryption key for tests (NOT for production use)
ENCRYPTION_KEY = "test-encryption-key-only-for-testing"
FIELD_ENCRYPTION_KEY = "dGVzdC1maWVsZC1lbmNyeXB0aW9uLWtleS0xMjM0NQ=="

# Logging - reduce verbosity in tests
LOGGING["loggers"]["django"]["level"] = "WARNING"  # noqa: F405

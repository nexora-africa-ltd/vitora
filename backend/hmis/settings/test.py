"""
Test settings for Vitora HMIS.

These settings are used for running tests.
"""

import os
import tempfile

from .base import *  # noqa: F401, F403

DEBUG = False

# Use a file-based SQLite database for tests
# This is required for WebSocket tests where the async consumer runs in a
# separate context and needs to see the same database as the test.
# Using a shared-cache URL allows multiple connections to see the same data.
_test_db_path = os.path.join(tempfile.gettempdir(), "vitora_test.db")

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": f"file:{_test_db_path}?mode=rwc",
        "OPTIONS": {
            "timeout": 20,
        },
        "TEST": {
            # Use the same file for tests
            "NAME": f"file:{_test_db_path}?mode=rwc",
        },
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

"""
Test settings for Vitora HMIS.

These settings are used for running tests.

Performance notes:
  - Default DB is in-memory SQLite — migrations are applied once per session
    using pytest-django's built-in transactional rollback, so each test is ~ms.
  - Coverage is NOT enabled by default in addopts; use `make test` or pass
    `--cov=hmis` explicitly when you need a coverage report.
  - WebSocket tests that need a shared file-backed DB should use the
    `ws_db` fixture (see conftest.py) which overrides the database per-test.
"""

import os

from .base import *  # noqa: F401, F403

DEBUG = False
TESTING = True

# MFA enforcement — disabled in tests by default
MFA_ENFORCEMENT = os.getenv("MFA_ENFORCEMENT", "false").lower() == "true"

# In-memory SQLite for speed — migrations run once per pytest session (~2-4s).
# WebSocket / Channels tests that need cross-thread visibility should use a
# file-backed override (see conftest.py `ws_db` fixture).
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
        "OPTIONS": {
            "timeout": 20,
        },
        "TEST": {
            "NAME": ":memory:",
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

# CRITICAL: Disable Resend SDK so tests never send real emails,
# regardless of what's in the environment.
RESEND_API_KEY = ""

# CRITICAL: Disable Africa's Talking SMS so tests never send real messages.
SMS_ENABLED = False
AT_USERNAME = ""
AT_API_KEY = ""

# Sync settings for tests
SYNC_ENABLED = False
SYNC_SERVER_URL = "http://test-server.example.com"

# Valid Fernet key for tests (NOT for production use)
ENCRYPTION_KEY = "d6ZDi90GkEDpDprOfhaMGg1xLI62TAhOkGcnKjFLn8E="
FIELD_ENCRYPTION_KEY = "dGVzdC1maWVsZC1lbmNyeXB0aW9uLWtleS0xMjM0NQ=="

# Logging - reduce verbosity in tests
LOGGING["loggers"]["django"]["level"] = "WARNING"  # noqa: F405

"""
Base Django settings for Vitora HMIS project.

These are common settings shared across all environments.
"""

import os
from pathlib import Path

from django.core.management.utils import get_random_secret_key

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", get_random_secret_key())

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

ALLOWED_HOSTS = []

# Application definition

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party apps
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "django_filters",
    # Local apps
    "hmis.apps.core",
    "hmis.apps.patients",
    "hmis.apps.encounters",
    "hmis.apps.clinical_templates",
    "hmis.apps.laboratory",
    "hmis.apps.pharmacy",
    "hmis.apps.billing",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "hmis.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "hmis.wsgi.application"

# Database
# https://docs.djangoproject.com/en/5.0/ref/settings/#databases

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "vitora.db",
    }
}

# Password validation
# https://docs.djangoproject.com/en/5.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

# Internationalization
# https://docs.djangoproject.com/en/5.0/topics/i18n/

LANGUAGE_CODE = "en-us"

TIME_ZONE = "Africa/Nairobi"

USE_I18N = True

USE_TZ = True

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/5.0/howto/static-files/

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Media files
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# Default primary key field type
# https://docs.djangoproject.com/en/5.0/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",  # Require authentication by default
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}

# Simple JWT settings
from datetime import timedelta  # noqa: E402

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    "ROTATE_REFRESH_TOKENS": False,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_HEADER_NAME": "HTTP_AUTHORIZATION",
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
    "TOKEN_TYPE_CLAIM": "token_type",
}

# CORS settings (for development, will be more restrictive in production)
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = []

# Security settings
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# Celery Configuration
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE

# Pharmacy Configuration
PHARMACY_SETTINGS = {
    "DEFAULT_PRESCRIPTION_VALIDITY_DAYS": 30,
    "LOW_STOCK_THRESHOLD_DAYS": 14,  # Alert when stock lasts less than X days
    "EXPIRY_WARNING_DAYS": 90,  # Alert when expiring within X days
    "CRITICAL_EXPIRY_DAYS": 30,  # Critical alert when expiring within X days
    "CONTROLLED_DRUG_VERIFICATION": True,  # Require second pharmacist
    "ALLOW_OTC_DISPENSING": True,  # Allow dispensing without prescription
    "FEFO_ENABLED": True,  # Use First Expiry First Out
}

# Drug Schedules
DRUG_SCHEDULES = {
    "OTC": {"requires_prescription": False, "requires_verification": False},
    "POM": {"requires_prescription": True, "requires_verification": False},
    "P": {"requires_prescription": False, "requires_verification": False},
    "CD": {"requires_prescription": True, "requires_verification": True},
}

# Logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
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
            "level": os.getenv("DJANGO_LOG_LEVEL", "INFO"),
            "propagate": False,
        },
    },
}

# ============================================================================
# RBAC Configuration (Sprint 1.1-1.2 Track C - Phase 6)
# ============================================================================

# RBAC Feature Flags
RBAC_ENABLED = True
RBAC_STRICT_MODE = True  # Deny if no explicit permission (vs allow)
RBAC_CACHE_TIMEOUT = 300  # Cache permission checks for 5 minutes

# Kenya Professional License Bodies
# These are the official regulatory bodies for healthcare professionals in Kenya
KENYA_LICENSE_BODIES = {
    'KMPDB': 'Kenya Medical Practitioners and Dentists Board',
    'NCK': 'Nursing Council of Kenya',
    'KMLTTB': 'Kenya Medical Laboratory Technicians and Technologists Board',
    'PPB': 'Pharmacy and Poisons Board',
    'COK': 'Clinical Officers Council',
}

# RBAC Hierarchy Levels
# Lower numbers = higher authority
# Used for permission inheritance and organizational structure
RBAC_HIERARCHY_LEVELS = {
    'ADMIN': 0,
    'MANAGEMENT': 1,
    'CLINICAL_SENIOR': 2,
    'CLINICAL': 3,
    'TECHNICAL': 4,
    'ADMINISTRATIVE': 5,
    'COMMUNITY': 6,
}

# ============================================================================
# Laboratory Configuration (Sprint 1.3-1.4 Track B)
# ============================================================================

# Lab Order Settings
LAB_ORDER_NUMBER_PREFIX = "LAB"
LAB_DEFAULT_TAT_HOURS = 24  # Default turnaround time in hours
LAB_CRITICAL_ALERT_ENABLED = True  # Enable critical result alerts
LAB_AUTO_FLAG_RESULTS = True  # Automatically flag abnormal results

# External Lab Partners
# These are common external lab partners in Kenya
EXTERNAL_LAB_PARTNERS = [
    ("LANCET", "Lancet Kenya"),
    ("PATHCARE", "PathCare Kenya"),
    ("KEMRI", "KEMRI Reference Lab"),
    ("AMPATH", "AMPATH Reference Lab"),
    ("NHLS", "National Public Health Labs"),
]

# LOINC Data Configuration
LOINC_DATA_PATH = "data/loinc_common.csv"

# ============================================================================
# Email and Notification Settings (Sprint 1.5-1.6 Track B)
# ============================================================================

# Email configuration
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'noreply@vitora.health')
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'  # For development

# Frontend URL for notification links
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:3000')

# Facility information for documents
FACILITY_NAME = os.getenv('FACILITY_NAME', 'Vitora Health Facility')
FACILITY_ADDRESS = os.getenv('FACILITY_ADDRESS', '')
FACILITY_PHONE = os.getenv('FACILITY_PHONE', '')
FACILITY_EMAIL = os.getenv('FACILITY_EMAIL', '')
FACILITY_LICENSE = os.getenv('FACILITY_LICENSE', '')
FACILITY_KRA_PIN = os.getenv('FACILITY_KRA_PIN', 'P000000000X')

# ============================================================================
# Billing Configuration (Sprint 1.5-1.6 Track A)
# ============================================================================

BILLING_INVOICE_PREFIX = "INV-"
BILLING_RECEIPT_PREFIX = "RCP-"
BILLING_PAYMENT_PREFIX = "PAY-"
BILLING_CREDIT_NOTE_PREFIX = "CN-"
BILLING_DEFAULT_CURRENCY = "KES"
BILLING_DEFAULT_DUE_DAYS = 30  # Days until invoice due
BILLING_OVERDUE_GRACE_DAYS = 7  # Grace period before marking overdue

# M-Pesa Configuration (from environment)
MPESA_ENVIRONMENT = os.getenv("MPESA_ENVIRONMENT", "sandbox")
MPESA_CONSUMER_KEY = os.getenv("MPESA_CONSUMER_KEY", "")
MPESA_CONSUMER_SECRET = os.getenv("MPESA_CONSUMER_SECRET", "")
MPESA_SHORTCODE = os.getenv("MPESA_SHORTCODE", "174379")
MPESA_PASSKEY = os.getenv("MPESA_PASSKEY", "")
MPESA_CALLBACK_URL = os.getenv("MPESA_CALLBACK_URL", "")

# SHA Configuration (stub for now)
SHA_ENABLED = os.getenv("SHA_ENABLED", "false").lower() == "true"
SHA_API_URL = os.getenv("SHA_API_URL", "")
SHA_API_KEY = os.getenv("SHA_API_KEY", "")

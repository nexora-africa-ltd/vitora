"""
Base Django settings for Vitora HMIS project.

These are common settings shared across all environments.
"""

import os
from importlib import import_module
from pathlib import Path

from django.core.management.utils import get_random_secret_key

# Load environment variables from .env file
try:
    from dotenv import load_dotenv

    # Look for .env in project root (parent of backend/), fallback to backend/.env
    # Project root: /vitora/.env (local dev)
    # Backend root: /backend/.env (Render deployment where base dir is /backend/)
    project_root_env = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    backend_root_env = Path(__file__).resolve().parent.parent.parent / ".env"

    if project_root_env.exists():
        load_dotenv(project_root_env)
    elif backend_root_env.exists():
        load_dotenv(backend_root_env)
except ImportError:
    pass  # python-dotenv not installed

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", get_random_secret_key())

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

ALLOWED_HOSTS = []

# Application definition

INSTALLED_APPS = [
    "daphne",  # ASGI server for channels (must be before django.contrib.staticfiles)
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
    "channels",  # Django Channels for WebSocket support
    "oauth2_provider",  # SMART on FHIR OAuth2 server
    "drf_spectacular",  # OpenAPI schema generation
    "simple_history",  # Model version tracking for audit trail (DHA compliance)
    # Local apps
    "hmis.apps.core",
    "hmis.apps.patients",
    "hmis.apps.encounters",
    "hmis.apps.clinical_templates",
    "hmis.apps.laboratory.apps.LaboratoryConfig",
    "hmis.apps.pharmacy",
    "hmis.apps.billing",
    "hmis.apps.inpatient",
    "hmis.apps.triage",
    "hmis.apps.clinics",
    "hmis.apps.imaging.apps.ImagingConfig",
    "hmis.apps.scheduling.apps.SchedulingConfig",
    "hmis.apps.checkin",
    "hmis.apps.surveillance.apps.SurveillanceConfig",
    "hmis.apps.physiotherapy.apps.PhysiotherapyConfig",
    "hmis.apps.nutrition.apps.NutritionConfig",
    "hmis.apps.occupational_therapy.apps.OccupationalTherapyConfig",
    "hmis.apps.social_work.apps.SocialWorkConfig",
    "hmis.apps.counselling.apps.CounsellingConfig",
    "hmis.apps.mch.apps.MCHConfig",
    "hmis.apps.immunizations.apps.ImmunizationsConfig",
    "hmis.apps.allied_health.apps.AlliedHealthConfig",
    "hmis.apps.referrals.apps.ReferralsConfig",
    "hmis.apps.quality.apps.QualityConfig",
    "hmis.apps.cds.apps.CDSConfig",
    "hmis.apps.ai.apps.AIConfig",
    "hmis.apps.hl7.apps.HL7Config",
    "hmis.apps.kenhdd.apps.KENHDDConfig",
    "hmis.apps.procedures.apps.ProceduresConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "hmis.apps.core.middleware.TenantMiddleware",  # Resolves organization + facility from X-Facility-Id
    "hmis.apps.core.middleware.AdminAccessMiddleware",  # Restrict /admin/ to Nexora superusers
    "hmis.apps.core.middleware.MFAGraceEnforcementMiddleware",  # Block API after MFA grace period
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "simple_history.middleware.HistoryRequestMiddleware",  # Tracks request user for history
]

ROOT_URLCONF = "hmis.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "hmis" / "templates"],
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

AUTHENTICATION_BACKENDS = [
    "hmis.apps.core.backends.EmailOrUsernameBackend",
]

# Django REST Framework
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",  # Require authentication by default
    ],
    "DEFAULT_PAGINATION_CLASS": "hmis.apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # Rate limiting for brute-force protection (DHA compliance)
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "100/hour",
        "login": "5/minute",       # Password login - 5 attempts per minute
        "mfa_verify": "5/minute",  # MFA verification - 5 attempts per minute
    },
}

# MFA enforcement — default True (production-safe).
# Override to False in development/test/staging settings.
MFA_ENFORCEMENT = True

# Grace period (hours) for new users to set up MFA before it becomes mandatory.
# Set to 0 to require immediate MFA setup (no grace period).
MFA_GRACE_PERIOD_HOURS = 72

# WebAuthn / FIDO2 / Passkey settings
# RP ID must match the domain the site is served from (no port, no scheme).
WEBAUTHN_RP_ID = os.getenv("WEBAUTHN_RP_ID", "localhost")
WEBAUTHN_RP_NAME = "Vitora HMIS"
WEBAUTHN_ORIGIN = os.getenv("WEBAUTHN_ORIGIN", "http://localhost:3009")


# drf-spectacular settings
def _model_attr(dotted_path: str, attr: str):
    module_path, class_name = dotted_path.rsplit(".", 1)
    module = import_module(module_path)
    obj = getattr(getattr(module, class_name), attr)
    if hasattr(obj, "choices"):
        return obj.choices
    return obj


SPECTACULAR_SETTINGS = {
    "TITLE": "Vitora HMIS API",
    "DESCRIPTION": "Hospital Management Information System for Kenya",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    # Reduce enum collision warnings - these are cosmetic and don't affect functionality
    # The auto-generated hash names (e.g. Status753Enum) work correctly, just have non-ideal names
    "ENUM_ADD_EXPLICIT_BLANK_NULL_CHOICE": False,
    "ENUM_NAME_OVERRIDES": {
        # Status enums
        "ClinicVisitStatusEnum": lambda: _model_attr(
            "hmis.apps.clinics.models.ClinicVisit", "STATUS_CHOICES"
        ),
        "ClinicStatusEnum": lambda: _model_attr(
            "hmis.apps.clinics.models.Clinic", "STATUS_CHOICES"
        ),
        "ClinicSessionStatusEnum": lambda: _model_attr(
            "hmis.apps.clinics.models.ClinicSession", "STATUS_CHOICES"
        ),
        "ClinicEnrollmentStatusEnum": lambda: _model_attr(
            "hmis.apps.clinics.models.ClinicEnrollment", "STATUS_CHOICES"
        ),
        "CheckInStatusEnum": lambda: _model_attr(
            "hmis.apps.checkin.models.CheckIn", "STATUS_CHOICES"
        ),
        "WaitingQueueStatusEnum": lambda: _model_attr(
            "hmis.apps.triage.models.WaitingQueue", "STATUS_CHOICES"
        ),
        "TriageQueueStatusEnum": lambda: _model_attr(
            "hmis.apps.triage.models.TriageQueue", "STATUS_CHOICES"
        ),
        "LabOrderStatusEnum": lambda: _model_attr(
            "hmis.apps.laboratory.models.LabOrder", "ORDER_STATUS"
        ),
        "LabOrderItemStatusEnum": lambda: _model_attr(
            "hmis.apps.laboratory.models.LabOrderItem", "ITEM_STATUS"
        ),
        "ImagingOrderStatusEnum": lambda: _model_attr(
            "hmis.apps.imaging.models.ImagingOrder", "ORDER_STATUS"
        ),
        "PrescriptionStatusEnum": lambda: _model_attr(
            "hmis.apps.pharmacy.models.Prescription", "PRESCRIPTION_STATUS"
        ),
        "StockBatchStatusEnum": lambda: _model_attr(
            "hmis.apps.pharmacy.models.StockBatch", "STOCK_STATUS"
        ),
        "InvoiceStatusEnum": lambda: _model_attr("hmis.apps.billing.models.Invoice", "Status"),
        "PaymentStatusEnum": lambda: _model_attr("hmis.apps.billing.models.Payment", "Status"),
        "CreditNoteStatusEnum": lambda: _model_attr(
            "hmis.apps.billing.models.CreditNote", "Status"
        ),
        "ShaClaimStatusEnum": lambda: _model_attr(
            "hmis.apps.billing.models.SHAClaim", "ClaimStatus"
        ),
        "ShaClaimItemStatusEnum": lambda: _model_attr(
            "hmis.apps.billing.models.SHAClaimItem", "ItemStatus"
        ),
        "ShaMemberStatusEnum": lambda: _model_attr(
            "hmis.apps.billing.models.SHAMember", "MembershipStatus"
        ),
        "EncounterStatusEnum": lambda: _model_attr(
            "hmis.apps.encounters.models.Encounter", "STATUS_CHOICES"
        ),
        "TreatmentPlanStatusEnum": lambda: _model_attr(
            "hmis.apps.encounters.models.TreatmentPlan", "STATUS_CHOICES"
        ),
        "SchedulingStatusEnum": lambda: _model_attr(
            "hmis.apps.scheduling.models.Appointment", "STATUS_CHOICES"
        ),
        "BedStatusEnum": lambda: _model_attr(
            "hmis.apps.inpatient.models.Bed", "BED_STATUS_CHOICES"
        ),
        "AdmissionRecommendationStatusEnum": lambda: _model_attr(
            "hmis.apps.inpatient.models.AdmissionRecommendation", "STATUS_CHOICES"
        ),
        "SyncQueueStatusEnum": lambda: _model_attr(
            "hmis.apps.core.models.SyncQueue", "STATUS_CHOICES"
        ),
        "SyncConflictStatusEnum": lambda: _model_attr(
            "hmis.apps.core.models.SyncConflict", "STATUS_CHOICES"
        ),
        # Priority enums
        "ClinicVisitPriorityEnum": lambda: _model_attr(
            "hmis.apps.clinics.models.ClinicVisit", "PRIORITY_CHOICES"
        ),
        "OrderPriorityEnum": lambda: _model_attr(
            "hmis.apps.laboratory.models.LabOrder", "PRIORITY_LEVELS"
        ),
        "LabQueuePriorityEnum": lambda: _model_attr(
            "hmis.apps.laboratory.models.LabQueue", "Priority"
        ),
        "AdmissionUrgencyPriorityEnum": lambda: _model_attr(
            "hmis.apps.inpatient.models.AdmissionRecommendation", "URGENCY_CHOICES"
        ),
        # Visit type enums
        "ClinicVisitTypeEnum": lambda: _model_attr(
            "hmis.apps.clinics.models.ClinicVisit", "VISIT_TYPE_CHOICES"
        ),
        "CheckInVisitTypeEnum": lambda: _model_attr(
            "hmis.apps.checkin.models.CheckIn", "VISIT_TYPE_CHOICES"
        ),
        # Category enums
        "LabTestCategoryEnum": lambda: _model_attr(
            "hmis.apps.laboratory.models.TestCatalog", "TEST_CATEGORIES"
        ),
        "ShaTariffCategoryEnum": lambda: _model_attr(
            "hmis.apps.billing.models.SHATariff", "TariffCategory"
        ),
        # Shared choice sets
        "TriageCategoryEnum": lambda: _model_attr(
            "hmis.apps.triage.models.TriageAssessment", "TRIAGE_CATEGORY_CHOICES"
        ),
        "NursingKardexRiskEnum": lambda: _model_attr(
            "hmis.apps.inpatient.models.NursingKardex", "RISK_CHOICES"
        ),
        # Triage bypass reasons
        "TriageBypassReasonEnum": lambda: _model_attr(
            "hmis.apps.encounters.models.Encounter", "TRIAGE_BYPASS_REASON_CHOICES"
        ),
        # Laboratory status enums
        "LabSpecimenStatusEnum": lambda: _model_attr(
            "hmis.apps.laboratory.models.Specimen", "STATUS_CHOICES"
        ),
        "LabResultVerificationStatusEnum": lambda: _model_attr(
            "hmis.apps.laboratory.models.LabResult", "VERIFICATION_STATUS"
        ),
        "DiagnosticReportStatusEnum": lambda: _model_attr(
            "hmis.apps.laboratory.models.DiagnosticReport", "Status"
        ),
        "LabQueueStatusEnum": lambda: _model_attr(
            "hmis.apps.laboratory.models.LabQueue", "QueueStatus"
        ),
        "ResultValidationStatusEnum": lambda: _model_attr(
            "hmis.apps.laboratory.models.ResultValidation", "ValidationStatus"
        ),
        "AnalyzerRunStatusEnum": lambda: _model_attr(
            "hmis.apps.laboratory.models.AnalyzerRun", "Status"
        ),
        # Inpatient admission status
        "AdmissionStatusEnum": lambda: _model_attr(
            "hmis.apps.inpatient.models.Admission", "STATUS_CHOICES"
        ),
        "WardRoundConditionStatusEnum": lambda: _model_attr(
            "hmis.apps.inpatient.models.WardRound", "CONDITION_STATUS_CHOICES"
        ),
        # Imaging status
        "RadiologyReportStatusEnum": lambda: _model_attr(
            "hmis.apps.imaging.models.RadiologyReport", "REPORT_STATUS"
        ),
        # Payment and method enums
        "PaymentMethodEnum": lambda: _model_attr(
            "hmis.apps.billing.models.Payment", "Method"
        ),
        "CheckInIdentityMethodEnum": lambda: _model_attr(
            "hmis.apps.checkin.models.CheckIn", "IDENTITY_METHOD_CHOICES"
        ),
        "ShaClaimSubmissionMethodEnum": lambda: _model_attr(
            "hmis.apps.billing.models.SHAClaim", "SubmissionMethod"
        ),
    },
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
    # PowerSync integration: custom serializer adds facility_id, organization_id,
    # iss, and aud claims to JWT tokens for sync rule evaluation.
    "TOKEN_OBTAIN_SERIALIZER": "hmis.apps.core.powersync_tokens.PowerSyncTokenObtainPairSerializer",
}

# CORS settings (for development, will be more restrictive in production)
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = []

# Security settings
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"

# =============================================================================
# Key Management System (KMS) Configuration
# =============================================================================
# KMS_PROVIDER options: "local", "azure", "gcp"
# - "local": Uses Fernet symmetric encryption (dev/test or single-server)
# - "azure": Azure Key Vault (recommended for production)
# - "gcp": Google Cloud KMS (alternative cloud option)
KMS_PROVIDER = os.getenv("KMS_PROVIDER", "local")

# Key rotation policy (in days) - minimum 365 per DHA compliance
KMS_KEY_ROTATION_DAYS = int(os.getenv("KMS_KEY_ROTATION_DAYS", "365"))

# Azure Key Vault settings (when KMS_PROVIDER="azure")
AZURE_KEY_VAULT_URL = os.getenv("AZURE_KEY_VAULT_URL", "")
AZURE_KEY_NAME = os.getenv("AZURE_KEY_NAME", "vitora-hmis-key")
# Authentication via Azure Managed Identity or environment variables:
# AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET

# Google Cloud KMS settings (when KMS_PROVIDER="gcp") - NOT YET IMPLEMENTED
GCP_PROJECT_ID = os.getenv("GCP_PROJECT_ID", "")
GCP_KMS_LOCATION = os.getenv("GCP_KMS_LOCATION", "global")
GCP_KMS_KEYRING = os.getenv("GCP_KMS_KEYRING", "vitora-hmis")
GCP_KMS_KEY = os.getenv("GCP_KMS_KEY", "vitora-key")

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
        # SQL query logging can be extremely noisy in dev tooling (e.g. schema generation)
        # while still being useful to toggle on when needed.
        "django.db.backends": {
            "handlers": ["console"],
            "level": os.getenv("DJANGO_DB_LOG_LEVEL", "WARNING"),
            "propagate": False,
        },
        "hmis.apps.billing.services.dha_search": {
            "handlers": ["console"],
            "level": "INFO",
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
    "KMPDB": "Kenya Medical Practitioners and Dentists Board",
    "NCK": "Nursing Council of Kenya",
    "KMLTTB": "Kenya Medical Laboratory Technicians and Technologists Board",
    "PPB": "Pharmacy and Poisons Board",
    "COC": "Clinical Officers Council",
}

# RBAC Hierarchy Levels
# Lower numbers = higher authority
# Used for permission inheritance and organizational structure
RBAC_HIERARCHY_LEVELS = {
    "ADMIN": 0,
    "MANAGEMENT": 1,
    "CLINICAL_SENIOR": 2,
    "CLINICAL": 3,
    "TECHNICAL": 4,
    "ADMINISTRATIVE": 5,
    "COMMUNITY": 6,
}

# ============================================================================
# Laboratory Configuration (Sprint 1.3-1.4 Track B)
# ============================================================================

# Lab Order Settings
LAB_ORDER_NUMBER_PREFIX = "LAB"
LAB_DEFAULT_TAT_HOURS = 24  # Default turnaround time in hours
LAB_CRITICAL_ALERT_ENABLED = True  # Enable critical result alerts
LAB_AUTO_FLAG_RESULTS = True  # Automatically flag abnormal results

# ============================================================================
# HL7/MLLP Integration Configuration (Phase C)
# ============================================================================
# Feature flag to enable/disable HL7 LIS integration
# When disabled, all HL7/MLLP functions are no-ops
HL7_INTEGRATION_ENABLED = os.getenv("HL7_INTEGRATION_ENABLED", "true").lower() == "true"

# HL7 Message Configuration
HL7_SENDING_APPLICATION = os.getenv("HL7_SENDING_APPLICATION", "VITORA_HMIS")
HL7_SENDING_FACILITY = os.getenv("HL7_SENDING_FACILITY", "VITORA")
HL7_RECEIVING_APPLICATION = os.getenv("HL7_RECEIVING_APPLICATION", "LAB_LIS")
HL7_RECEIVING_FACILITY = os.getenv("HL7_RECEIVING_FACILITY", "EXTERNAL_LAB")

# MLLP Connection Settings
MLLP_HOST = os.getenv("MLLP_HOST", "localhost")
MLLP_PORT = int(os.getenv("MLLP_PORT", "2575"))
MLLP_TIMEOUT = float(os.getenv("MLLP_TIMEOUT", "30.0"))
MLLP_RECEIVE_TIMEOUT = float(os.getenv("MLLP_RECEIVE_TIMEOUT", "60.0"))
MLLP_MAX_RETRIES = int(os.getenv("MLLP_MAX_RETRIES", "3"))
MLLP_USE_SSL = os.getenv("MLLP_USE_SSL", "false").lower() == "true"
MLLP_SSL_VERIFY = os.getenv("MLLP_SSL_VERIFY", "true").lower() == "true"
MLLP_SSL_CERT_FILE = os.getenv("MLLP_SSL_CERT_FILE", "")
MLLP_SSL_KEY_FILE = os.getenv("MLLP_SSL_KEY_FILE", "")
MLLP_SSL_CA_FILE = os.getenv("MLLP_SSL_CA_FILE", "")

# External LIS Code System Identifier
# Used for ExternalCodeMapping lookups when resolving external test codes
# Example: "LIS_ACME" for ACME LIS vendor
HL7_LIS_CODE_SYSTEM = os.getenv("HL7_LIS_CODE_SYSTEM", "LIS_DEFAULT")

# HL7 Message Queue (hl7 app) — destination for ADT/ORM outbound messages
HL7_MLLP_HOST = os.getenv("HL7_MLLP_HOST", "")
HL7_MLLP_PORT = int(os.getenv("HL7_MLLP_PORT", "0") or "0") or None

# ============================================================================
# HIE (Health Information Exchange) Configuration (Sprint 3.B, Gap #27)
# ============================================================================
HIE_AUTO_CR_LOOKUP = os.getenv("HIE_AUTO_CR_LOOKUP", "true").lower() == "true"
HIE_AUTO_CR_REGISTER = os.getenv("HIE_AUTO_CR_REGISTER", "true").lower() == "true"
HIE_AUTO_SHR_PUSH = os.getenv("HIE_AUTO_SHR_PUSH", "false").lower() == "true"
HIE_ADX_ENABLED = os.getenv("HIE_ADX_ENABLED", "false").lower() == "true"

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
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "noreply@vitora.digital")
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"  # For development

# Resend API key — when set, email_service.py uses the Resend SDK
# instead of Django's EMAIL_BACKEND. Obtain from https://resend.com/api-keys
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")

# Frontend URL for notification links
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3009")

# Setup wizard — set to True to enable the /setup first-run wizard.
# Only works when no organizations exist in the database.
SETUP_WIZARD_ENABLED = os.getenv("SETUP_WIZARD_ENABLED", "false").lower() in ("true", "1", "yes")

# Document verification URL (for QR codes on receipts/invoices)
# In production, set to your public domain e.g., https://vitora.health/verify
DOCUMENT_VERIFICATION_URL = os.getenv("DOCUMENT_VERIFICATION_URL", f"{FRONTEND_URL}/verify")

# Facility information for documents
FACILITY_NAME = os.getenv("FACILITY_NAME", "Vitora Health Facility")
FACILITY_ADDRESS = os.getenv("FACILITY_ADDRESS", "")
FACILITY_PHONE = os.getenv("FACILITY_PHONE", "")
FACILITY_EMAIL = os.getenv("FACILITY_EMAIL", "")
FACILITY_LICENSE = os.getenv("FACILITY_LICENSE", "")
FACILITY_KRA_PIN = os.getenv("FACILITY_KRA_PIN", "P000000000X")

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

# SHA Configuration (Social Health Authority - Kenya)
# Reference: docs/sha-api-validation-report.md
SHA_ENABLED = os.getenv("SHA_ENABLED", "false").lower() == "true"
SHA_API_BASE_URL = os.getenv(
    "SHA_API_BASE_URL", "https://uat.dha.go.ke"
)  # production: https://api.dha.go.ke
SHA_API_URL = os.getenv("SHA_API_URL", "")  # Deprecated, use SHA_API_BASE_URL
SHA_API_KEY = os.getenv("SHA_API_KEY", "")  # Deprecated, use SHA_CONSUMER_KEY
SHA_API_TIMEOUT = int(os.getenv("SHA_API_TIMEOUT", "30"))  # seconds

# SHA Authentication Credentials (Official API)
SHA_CONSUMER_KEY = os.getenv("SHA_CONSUMER_KEY", "")  # Consumer key for API access
SHA_CLIENT_SECRET = os.getenv("SHA_CLIENT_SECRET", "")  # Client secret (if needed)
SHA_USERNAME = os.getenv("SHA_USERNAME", "")  # API username for Basic Auth
SHA_PASSWORD = os.getenv("SHA_PASSWORD", "")  # API password for Basic Auth
SHA_AGENT = os.getenv("SHA_AGENT", "")  # Agent identifier for API requests
SHA_ENCRYPTED_PIN = os.getenv("SHA_ENCRYPTED_PIN", "")  # Pre-encrypted PIN for API requests
# SHA FHIR Base URL (for bundle profile/resource URLs - NOT API endpoint)
# UAT: https://qa-mis.apeiro-digital.com
# Production: https://mis.apeiro-digital.com or https://fhir.sha.go.ke
SHA_FHIR_BASE_URL = os.getenv("SHA_FHIR_BASE_URL", "https://qa-mis.apeiro-digital.com")

# SHA API Endpoints for Shared Health Record (SHR) Integration
# Reference: docs/sha-guides/shr-integration.md
SHA_API_ENDPOINTS = {
    "patient_resource": "/v1/patient-resource",  # PUT - Patient registration/update
    "shr_submission": "/v1/shr-submission",  # POST - MedicationRequest/MedicationDispense
    "shr_summary": "/v1/shr/summary",  # GET - IPS/Patient summary retrieval
}

# SHA API Endpoints (Official Kenya Digital Superhighway)
SHA_ENDPOINTS = {
    "auth": "/v1/hie-auth",
    "eligibility": "/v2/eligibility",
    "client_registry": "/v3/client-registry/fetch-client",
    "client_register": "/v3/uat-cr-registration",
    "client_update": "/v3/update-client",
    "claims_submit": "/v1/shr-med/bundle",
    "claims_status": "/v1/shr-med/claim-status",
    "facility_search": "/v1/facility-search",
    "practitioner_search": "/v1/practitioner-search",
    "terminology_icd11": "/terminology/v1/icd11",
    "terminology_loinc": "/terminology/v1/loinc",
    "terminology_ichi": "/terminology/v1/ichi",
    "terminology_sha": "/terminology/v1/sha-intervention",
    "terminology_product": "/terminology/v1/product",
}

# Local WHO ICD-11 API (Docker container: whoicd/icd-api)
# Deployed via: backend/compose.yml
ICD11_LOCAL_API_URL = os.getenv("ICD11_LOCAL_API_URL", "http://localhost:5080")
ICD11_API_TIMEOUT = int(os.getenv("ICD11_API_TIMEOUT", "10"))
ICD11_USE_LOCAL = os.getenv("ICD11_USE_LOCAL", "true").lower() == "true"

# HAPI FHIR Server for Terminology (LOINC fallback)
# Deployed via: docker/hapi-fhir/compose.yml
# FHIR R4 terminology lookup: CodeSystem/$lookup, ValueSet/$expand
HAPI_FHIR_BASE_URL = os.getenv("HAPI_FHIR_BASE_URL", "http://localhost:8090/fhir")
HAPI_FHIR_TIMEOUT = int(os.getenv("HAPI_FHIR_TIMEOUT", "10"))
HAPI_FHIR_ENABLED = os.getenv("HAPI_FHIR_ENABLED", "true").lower() == "true"

# SHA Webhook/Callback Configuration
# These are the URLs DHA calls to notify us about claim status changes
# When registering with DHA, provide your actual domain:
# - Callback URL: https://your-domain/api/sha/webhook/ (or /api/sha/callback/)
# - Validate URL: https://your-domain/api/sha/validate/
# DHA Sandbox defaults: https://taifa-hmis.com/callback, https://taifa-hmis/validate
SHA_WEBHOOK_SECRET = os.getenv(
    "SHA_WEBHOOK_SECRET", ""
)  # Optional HMAC secret for webhook verification

# Facility identification (for SHA claims)
FACILITY_MFL_CODE = os.getenv("FACILITY_MFL_CODE", "TEST-001")  # Master Facility List code

# =============================================================================
# DJANGO CHANNELS CONFIGURATION (WebSocket Support)
# =============================================================================

# ASGI application
ASGI_APPLICATION = "hmis.asgi.application"

# Channel layers configuration
# In production, use Redis: channels_redis.core.RedisChannelLayer
# For development/testing, use in-memory layer
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    },
}

FACILITY_LEVEL = os.getenv("FACILITY_LEVEL", "L3")  # Default to Level 3

# Facility capability flags (for AI context enrichment)
# Set via env vars; null means "not yet configured"
FACILITY_COUNTY = os.getenv("FACILITY_COUNTY", "")  # e.g., "Nairobi", "Mombasa"
FACILITY_HAS_ICU = (
    os.getenv("FACILITY_HAS_ICU", "").lower() == "true"
    if os.getenv("FACILITY_HAS_ICU")
    else None
)
FACILITY_HAS_LABORATORY = (
    os.getenv("FACILITY_HAS_LABORATORY", "").lower() == "true"
    if os.getenv("FACILITY_HAS_LABORATORY")
    else None
)
FACILITY_HAS_IMAGING = (
    os.getenv("FACILITY_HAS_IMAGING", "").lower() == "true"
    if os.getenv("FACILITY_HAS_IMAGING")
    else None
)
FACILITY_HAS_PHARMACY = (
    os.getenv("FACILITY_HAS_PHARMACY", "").lower() == "true"
    if os.getenv("FACILITY_HAS_PHARMACY")
    else None
)

# =============================================================================
# TIBABOT AI INTEGRATION
# =============================================================================
# Feature flag: Set to true to enable AI proxy endpoints (/api/ai/*).
# When false, all /api/ai/* endpoints return 404.
TIBABOT_ENABLED = os.getenv("TIBABOT_ENABLED", "false").lower() == "true"
TIBABOT_API_URL = os.getenv("TIBABOT_API_URL", "https://tibabot.vitora.nexora.africa")
TIBABOT_API_KEY = os.getenv("TIBABOT_API_KEY", "")
TIBABOT_TIMEOUT = int(os.getenv("TIBABOT_TIMEOUT", "30"))

# Per-feature flags (all default to True — opt-out, not opt-in).
# Each requires TIBABOT_ENABLED=true as a prerequisite.
TIBABOT_ENABLE_LAB_ASSIST = os.getenv("TIBABOT_ENABLE_LAB_ASSIST", "true").lower() == "true"
TIBABOT_ENABLE_DISCHARGE_READINESS = os.getenv("TIBABOT_ENABLE_DISCHARGE_READINESS", "true").lower() == "true"
TIBABOT_ENABLE_CARE_PLAN = os.getenv("TIBABOT_ENABLE_CARE_PLAN", "true").lower() == "true"
TIBABOT_ENABLE_CLERKING_ASSIST = os.getenv("TIBABOT_ENABLE_CLERKING_ASSIST", "true").lower() == "true"

# ============================================================================
# SMART on FHIR OAuth2 Configuration (Phase 5)
# ============================================================================

# django-oauth-toolkit configuration
OAUTH2_PROVIDER = {
    # SMART on FHIR scopes backend
    "SCOPES_BACKEND_CLASS": "hmis.apps.core.oauth.scopes.SMARTScopes",
    # Custom validator for SMART-specific behavior
    "OAUTH2_VALIDATOR_CLASS": "hmis.apps.core.oauth.validators.SMARTOAuth2Validator",
    # Token settings
    "ACCESS_TOKEN_EXPIRE_SECONDS": 3600,  # 1 hour (SMART recommendation)
    "REFRESH_TOKEN_EXPIRE_SECONDS": 86400 * 30,  # 30 days
    "ROTATE_REFRESH_TOKEN": True,
    # OIDC settings
    "OIDC_ENABLED": True,
    "OIDC_ISS_ENDPOINT": os.getenv("FHIR_BASE_URL", ""),
    # PKCE required for public clients (SMART requirement)
    "PKCE_REQUIRED": True,
    # Allowed grant types
    "ALLOWED_REDIRECT_URI_SCHEMES": ["http", "https", "urn"],  # urn for SMART native apps
    # Response types
    "AUTHORIZATION_CODE_EXPIRE_SECONDS": 600,  # 10 minutes
}

# FHIR server base URL (used in SMART configuration)
FHIR_BASE_URL = os.getenv("FHIR_BASE_URL", "http://localhost:9088")

# AFRICA'S TALKING SMS API Configuration (Sprint 1.5-1.6 Track B)
AT_USERNAME = os.getenv("AT_USERNAME", "")
AT_API_KEY = os.getenv("AT_API_KEY", "")
SMS_SENDER_ID = os.getenv("SMS_SENDER_ID", "VitoraHMIS")
SMS_BACKEND = os.getenv("SMS_BACKEND", "hmis.apps.core.sms.backends.MockSMSBackend")

# DHIS2 API Configuration (Sprint 1.3-1.4 Track A)
DHIS2_BASE_URL = os.getenv("DHIS2_BASE_URL", os.getenv("DHIS2_API_URL", ""))
DHIS2_API_URL = DHIS2_BASE_URL  # Alias for backward compatibility (surveillance service)
DHIS2_USERNAME = os.getenv("DHIS2_USERNAME", "")
DHIS2_PASSWORD = os.getenv("DHIS2_PASSWORD", "")
DHIS2_ORG_UNIT = os.getenv("DHIS2_ORG_UNIT", "")

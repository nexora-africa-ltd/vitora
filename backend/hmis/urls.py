# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
URL configuration for Vitora HMIS project.

The `urlpatterns` list routes URLs to views.
"""

import os
import platform
import sys
import time
from copy import deepcopy
from datetime import UTC, datetime
from urllib.parse import urlparse

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.core.cache import caches
from django.core.exceptions import ImproperlyConfigured
from django.db import connections
from django.db.migrations.executor import MigrationExecutor
from django.http import JsonResponse
from django.urls import include, path
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework import routers
from rest_framework_simplejwt.views import TokenVerifyView

from hmis.apps.comments.views import ClinicalCommentViewSet, comment_count, mention_suggestions
from hmis.apps.core.cookie_auth import (
    CookieLoginView,
    CookieLogoutView,
    CookieMFAVerifyView,
    CookieRefreshView,
)
from hmis.apps.core.mfa.views import MFAAwareTokenRefreshView
from hmis.apps.core.powersync_tokens import PowerSyncCredentialsView
from hmis.apps.core.pricing import (
    PricingQuoteSlashAliasView,
    PricingQuoteSnapshotCreateSlashAliasView,
    PricingQuoteSnapshotCreateView,
    PricingQuoteSnapshotDetailView,
    PricingQuoteView,
    PricingResolvePlanSlashAliasView,
    PricingResolvePlanView,
)
from hmis.apps.core.views import (
    AuditedTokenObtainPairView,
    AuditLogViewSet,
    CodeSystemViewSet,
    CountyViewSet,
    DepartmentViewSet,
    DHIS2ConfigViewSet,
    FacilityViewSet,
    NotificationViewSet,
    OrganizationViewSet,
    OrgMembershipViewSet,
    PermissionViewSet,
    PushSubscriptionViewSet,
    RoleViewSet,
    StaffProfileViewSet,
    SubCountyViewSet,
    SubscriptionPlanViewSet,
    WardViewSet,
    me_permissions,
)
from hmis.apps.encounters.views import (
    ApplyTemplateView,
    ChronicConditionViewSet,
    CurrentMedicationViewSet,
    DiagnosisViewSet,
    EncounterViewSet,
    FamilyHistoryViewSet,
    ICD10CodeViewSet,
    MedicationViewSet,
    PastSurgeryViewSet,
    SNOMEDSearchView,
    SocialHistoryObservationViewSet,
    TreatmentPlanTemplateViewSet,
    TreatmentPlanView,
    VitalFlagSuggestionViewSet,
)
from hmis.apps.laboratory.views import (
    EncounterLabOrderViewSet,
    PatientLabOrderViewSet,
    PatientLabResultViewSet,
)
from hmis.apps.patients.views import (
    AllergyViewSet,
    DeathRecordViewSet,
    EmergencyContactViewSet,
    PatientViewSet,
)

PROCESS_START_MONOTONIC = time.monotonic()
HEALTH_CACHE_TTL_SECONDS = 5
TIBABOT_HEALTH_CACHE_TTL_SECONDS = 60
_HEALTH_RESPONSE_CACHE: dict[str, dict[str, object]] = {}
_TIBABOT_HEALTH_CACHE: dict[str, object] = {}


def _truncate_error(exc: Exception, max_len: int = 300) -> str:
    """Return a compact error string suitable for health endpoint payloads."""
    message = str(exc).strip() or exc.__class__.__name__
    return message[:max_len]


def _infer_database_provider(host: str, engine: str) -> str:
    """Infer provider label from database host/engine for diagnostics."""
    normalized_host = host.lower()
    normalized_engine = engine.lower()

    if "sqlite" in normalized_engine:
        return "sqlite"
    if "postgres.database.azure.com" in normalized_host:
        return "azure-postgresql"
    if "neon.tech" in normalized_host:
        return "neon"
    if "rds.amazonaws.com" in normalized_host:
        return "aws-rds"
    if "googleapis.com" in normalized_host or "cloudsql" in normalized_host:
        return "gcp-cloudsql"
    if "render.com" in normalized_host:
        return "render-postgresql"
    if normalized_host:
        return "custom-postgresql"
    return "unknown"


def _check_database_health() -> dict[str, object]:
    """Check default database connectivity and query latency."""
    started_total = time.monotonic()
    db_settings = settings.DATABASES.get("default", {})
    db_host = str(db_settings.get("HOST", "") or "")
    if not db_host:
        parsed = urlparse(str(os.getenv("DATABASE_URL", "") or ""))
        db_host = parsed.hostname or ""

    db_engine = str(db_settings.get("ENGINE", ""))
    details: dict[str, object] = {
        "status": "unknown",
        "engine": db_engine,
        "name": str(db_settings.get("NAME", "")),
        "host": db_host,
        "provider_hint": _infer_database_provider(db_host, db_engine),
        "connection_acquire_ms": None,
        "query_ms": None,
        "connection_reused": None,
    }

    try:
        db_connection = connections["default"]
        details["connection_reused"] = db_connection.connection is not None

        started_acquire = time.monotonic()
        db_connection.ensure_connection()
        details["connection_acquire_ms"] = round((time.monotonic() - started_acquire) * 1000, 2)

        started_query = time.monotonic()
        with db_connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        details["query_ms"] = round((time.monotonic() - started_query) * 1000, 2)

        details["status"] = "healthy"
    except Exception as exc:
        details["status"] = "unhealthy"
        details["error"] = _truncate_error(exc)

    details["latency_ms"] = round((time.monotonic() - started_total) * 1000, 2)
    return details


def _check_cache_health() -> dict[str, object]:
    """Check default cache backend availability with a set/get/delete cycle."""
    started = time.monotonic()
    details: dict[str, object] = {"status": "unknown", "backend": None}

    try:
        cache = caches["default"]
        details["backend"] = f"{cache.__class__.__module__}.{cache.__class__.__name__}"

        probe_key = f"health:probe:{int(time.time() * 1000)}:{os.getpid()}"
        probe_value = f"ok:{probe_key}"
        cache.set(probe_key, probe_value, timeout=10)
        round_trip = cache.get(probe_key)
        cache.delete(probe_key)

        details["status"] = "healthy" if round_trip == probe_value else "degraded"
        if round_trip != probe_value:
            details["detail"] = "Cache round-trip probe value mismatch"
    except ImproperlyConfigured as exc:
        details["status"] = "unavailable"
        details["error"] = _truncate_error(exc)
    except Exception as exc:
        details["status"] = "unhealthy"
        details["error"] = _truncate_error(exc)

    details["latency_ms"] = round((time.monotonic() - started) * 1000, 2)
    return details


def _check_migration_health() -> dict[str, object]:
    """Report whether unapplied migrations exist for the default DB."""
    started = time.monotonic()
    details: dict[str, object] = {
        "status": "unknown",
        "pending_count": None,
        "has_pending_migrations": None,
    }

    try:
        connection = connections["default"]
        executor = MigrationExecutor(connection)
        targets = executor.loader.graph.leaf_nodes()
        pending_count = len(executor.migration_plan(targets))
        details["pending_count"] = pending_count
        details["has_pending_migrations"] = pending_count > 0
        details["status"] = "healthy" if pending_count == 0 else "pending"
    except Exception as exc:
        details["status"] = "unavailable"
        details["error"] = _truncate_error(exc)

    details["latency_ms"] = round((time.monotonic() - started) * 1000, 2)
    return details


def _check_websocket_health() -> dict[str, object]:
    """Validate whether Channels/WebSocket wiring is configured."""
    details: dict[str, object] = {
        "status": "unknown",
        "enabled": False,
        "asgi_application": None,
        "channel_layer_backends": [],
    }

    try:
        asgi_application = getattr(settings, "ASGI_APPLICATION", None)
        channel_layers = getattr(settings, "CHANNEL_LAYERS", {})
        channels_installed = "channels" in settings.INSTALLED_APPS

        backends = []
        for layer in channel_layers.values():
            backend = layer.get("BACKEND") if isinstance(layer, dict) else None
            if backend:
                backends.append(backend)

        enabled = bool(asgi_application and channel_layers and channels_installed)
        details.update(
            {
                "status": "healthy" if enabled else "unavailable",
                "enabled": enabled,
                "asgi_application": asgi_application,
                "channel_layer_backends": backends,
                "channels_installed": channels_installed,
            }
        )
    except Exception as exc:
        details["status"] = "unavailable"
        details["error"] = _truncate_error(exc)

    return details


def _check_kms_health() -> dict[str, object]:
    """Check encryption provider availability for PII operations."""
    details: dict[str, object] = {
        "status": "unknown",
        "provider": None,
    }

    try:
        from hmis.apps.core.kms import get_kms_provider

        kms = get_kms_provider()
        details["provider"] = kms.__class__.__name__
        details["status"] = "healthy" if kms.is_healthy() else "unhealthy"
    except Exception as exc:
        details["status"] = "unavailable"
        details["error"] = _truncate_error(exc)

    return details


def _check_tibabot_health() -> dict[str, object]:
    """Check TibaBot feature flag, configuration, and remote service availability."""
    cached_details = _get_cached_tibabot_health()
    if cached_details is not None:
        return cached_details

    details: dict[str, object] = {
        "status": "unknown",
        "enabled": bool(getattr(settings, "TIBABOT_ENABLED", False)),
        "api_url": str(getattr(settings, "TIBABOT_API_URL", "") or ""),
        "timeout_seconds": int(getattr(settings, "TIBABOT_TIMEOUT", 30)),
        "configured": False,
        "service_available": False,
    }

    if not details["enabled"]:
        details["status"] = "disabled"
        return details

    api_key = str(getattr(settings, "TIBABOT_API_KEY", "") or "")
    has_auth = bool(
        api_key
        or getattr(settings, "TIBABOT_JWT_PRIVATE_KEY", "")
        or getattr(settings, "TIBABOT_JWT_SECRET", "")
    )
    details["configured"] = bool(details["api_url"]) and has_auth
    if not details["configured"]:
        details["status"] = "misconfigured"
        return details

    try:
        from hmis.apps.ai.client import TibaBotError, get_tibabot_client

        started = time.monotonic()
        client = get_tibabot_client()
        health = client._request("GET", "/health")
        details["service_available"] = True
        details["status"] = "healthy"
        details["latency_ms"] = round((time.monotonic() - started) * 1000, 2)
        details["rag_initialized"] = bool(health.get("rag_initialized", False))
        details["demo_mode"] = bool(health.get("demo_mode", False))
        _set_cached_tibabot_health(details)
    except TibaBotError as exc:
        details["status"] = "unhealthy"
        details["error"] = _truncate_error(exc)
    except Exception as exc:
        details["status"] = "unavailable"
        details["error"] = _truncate_error(exc)

    return details


def _compute_overall_health(checks: dict[str, dict[str, object]]) -> str:
    """Compute aggregate status from component checks."""
    db_status = checks.get("database", {}).get("status")
    if db_status == "unhealthy":
        return "unhealthy"

    degraded_markers = {"unhealthy", "degraded", "unavailable", "pending"}
    non_core_statuses = [
        checks.get("cache", {}).get("status"),
        checks.get("websocket", {}).get("status"),
        checks.get("kms", {}).get("status"),
        checks.get("tibabot", {}).get("status"),
    ]

    if any(status in degraded_markers for status in non_core_statuses):
        return "degraded"

    return "healthy"


def _is_truthy(value: str | None) -> bool:
    """Parse common truthy query values (1/true/yes/on)."""
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_cached_health_payload(cache_key: str) -> dict[str, object] | None:
    """Return cached health payload if fresh, otherwise None."""
    entry = _HEALTH_RESPONSE_CACHE.get(cache_key)
    if not entry:
        return None

    expires_at = entry.get("expires_at")
    if not isinstance(expires_at, float) or time.monotonic() >= expires_at:
        _HEALTH_RESPONSE_CACHE.pop(cache_key, None)
        return None

    payload = deepcopy(entry.get("payload", {}))
    payload["cached"] = True
    return payload


def _set_cached_health_payload(cache_key: str, payload: dict[str, object]) -> None:
    """Store health payload for a short TTL to reduce probe churn."""
    _HEALTH_RESPONSE_CACHE[cache_key] = {
        "expires_at": time.monotonic() + HEALTH_CACHE_TTL_SECONDS,
        "payload": deepcopy(payload),
    }


def _get_cached_tibabot_health() -> dict[str, object] | None:
    """Return cached TibaBot health check details if still fresh."""
    expires_at = _TIBABOT_HEALTH_CACHE.get("expires_at")
    if not isinstance(expires_at, float) or time.monotonic() >= expires_at:
        _TIBABOT_HEALTH_CACHE.clear()
        return None

    payload = _TIBABOT_HEALTH_CACHE.get("payload")
    if not isinstance(payload, dict):
        _TIBABOT_HEALTH_CACHE.clear()
        return None

    return deepcopy(payload)


def _set_cached_tibabot_health(payload: dict[str, object]) -> None:
    """Cache TibaBot health probe result to avoid repeated upstream checks."""
    _TIBABOT_HEALTH_CACHE["expires_at"] = time.monotonic() + TIBABOT_HEALTH_CACHE_TTL_SECONDS
    _TIBABOT_HEALTH_CACHE["payload"] = deepcopy(payload)


@csrf_exempt
@never_cache
def health_check(request):
    """Comprehensive health endpoint for monitoring and diagnostics."""
    from hmis import __version__

    lite_mode = _is_truthy(request.GET.get("lite"))
    cache_key = "lite" if lite_mode else "full"

    cached_payload = _get_cached_health_payload(cache_key)
    if cached_payload is not None:
        return JsonResponse(cached_payload)

    uptime_seconds = int(time.monotonic() - PROCESS_START_MONOTONIC)
    timestamp = datetime.now(UTC).isoformat()

    if lite_mode:
        database_check = _check_database_health()
        overall_status = "healthy" if database_check.get("status") == "healthy" else "unhealthy"
        payload = {
            "status": overall_status,
            "service": "vitora-hmis",
            "version": __version__,
            "mode": "lite",
            "timestamp": timestamp,
            "uptime_seconds": uptime_seconds,
            "database_latency_ms": database_check.get("latency_ms"),
            "checks": {
                "database": database_check,
            },
            "cached": False,
        }
        _set_cached_health_payload(cache_key, payload)
        return JsonResponse(payload)

    from hmis.apps.billing.services.icd11_status import get_icd11_local_fallback_status

    checks = {
        "database": _check_database_health(),
        "cache": _check_cache_health(),
        "migrations": _check_migration_health(),
        "websocket": _check_websocket_health(),
        "kms": _check_kms_health(),
        "tibabot": _check_tibabot_health(),
    }
    overall_status = _compute_overall_health(checks)
    websocket_enabled = bool(checks["websocket"].get("enabled"))
    pii_encryption = str(checks["kms"].get("status", "unknown"))
    database_latency_ms = checks["database"].get("latency_ms")

    build_id = os.getenv("VITORA_BUILD_ID")
    deployment_mode = os.getenv("DJANGO_ENV", "development")

    payload = {
        "status": overall_status,
        "service": "vitora-hmis",
        "version": __version__,
        "timestamp": timestamp,
        "uptime_seconds": uptime_seconds,
        "uptime_human": f"{uptime_seconds // 3600}h {(uptime_seconds % 3600) // 60}m",
        "environment": {
            "django_env": deployment_mode,
            "debug": settings.DEBUG,
            "python": platform.python_version(),
            "python_implementation": platform.python_implementation(),
            "platform": platform.platform(),
            "executable": sys.executable,
        },
        "build": {
            "id": build_id,
            "git_sha": os.getenv("GIT_SHA") or os.getenv("VERCEL_GIT_COMMIT_SHA"),
        },
        "websocket_enabled": websocket_enabled,
        "database_latency_ms": database_latency_ms,
        "icd11_local_fallback": get_icd11_local_fallback_status(),
        "pii_encryption": pii_encryption,
        "tibabot_status": checks["tibabot"].get("status", "unknown"),
        "checks": checks,
        "cached": False,
    }
    _set_cached_health_payload(cache_key, payload)
    return JsonResponse(payload)


@never_cache
def admin_mfa_verify(request):
    """Admin MFA verification page — TOTP or WebAuthn/Passkey check before accessing /admin/.
    If no MFA device is configured, shows a setup wizard instead.
    """
    from django.shortcuts import redirect
    from django.template.response import TemplateResponse
    from django.utils import timezone as tz

    if not request.user.is_authenticated:
        return redirect("/admin/login/")

    # Check what MFA methods the user has
    from hmis.apps.core.mfa.models import UserTOTPDevice, UserWebAuthnCredential

    has_passkeys = UserWebAuthnCredential.objects.filter(user=request.user).exists()
    has_totp = UserTOTPDevice.objects.filter(user=request.user, confirmed=True).exists()
    has_any_mfa = has_passkeys or has_totp

    # If user has no MFA configured, show setup wizard
    if not has_any_mfa:
        return _admin_mfa_setup(request)

    error = None
    if request.method == "POST":
        totp_code = request.POST.get("totp_code", "").strip()

        device = (
            UserTOTPDevice.objects.filter(user=request.user, confirmed=True)
            .order_by("-last_used_at")
            .first()
        )
        if device and device.verify_token(totp_code):
            request.session["admin_mfa_verified"] = True
            request.session["admin_last_activity_at"] = tz.now().timestamp()
            device.last_used_at = tz.now()
            device.save(update_fields=["last_used_at"])
            return redirect("/admin/")
        error = "Invalid verification code. Please try again."

    return TemplateResponse(
        request, "admin/mfa_verify.html", {"error": error, "has_passkeys": has_passkeys}
    )


def _admin_mfa_setup(request):
    """Admin MFA setup wizard — shown when user has no MFA device configured."""
    import base64
    import io

    import qrcode
    from django.template.response import TemplateResponse
    from django.utils import timezone as tz

    from hmis.apps.core.mfa.models import BackupCode, UserTOTPDevice

    error = None
    step = "qr"  # 'qr' → show QR code, 'confirm' after successful verification

    # Get or create an unconfirmed device for setup
    device = UserTOTPDevice.objects.filter(user=request.user, confirmed=False).first()
    if not device:
        device = UserTOTPDevice.objects.create(user=request.user, name="Authenticator App")

    if request.method == "POST":
        totp_code = request.POST.get("totp_code", "").strip()
        if device.verify_token(totp_code):
            # Confirm the device
            device.confirmed = True
            device.confirmed_at = tz.now()
            device.save(update_fields=["confirmed", "confirmed_at"])

            # Generate backup codes
            backup_codes = BackupCode.generate_codes(user=request.user)

            # Mark admin MFA as verified for this session
            request.session["admin_mfa_verified"] = True
            request.session["admin_last_activity_at"] = tz.now().timestamp()

            # Show success with backup codes
            return TemplateResponse(
                request,
                "admin/mfa_setup.html",
                {"step": "complete", "backup_codes": backup_codes},
            )
        else:
            error = "Invalid code. Please check your authenticator app and try again."

    # Generate QR code
    provisioning_uri = device.get_provisioning_uri()
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()

    return TemplateResponse(
        request,
        "admin/mfa_setup.html",
        {
            "step": step,
            "qr_code": qr_base64,
            "secret_key": device.secret_key,
            "error": error,
        },
    )


@never_cache
def admin_webauthn_begin(request):
    """Generate WebAuthn authentication options for admin MFA verification."""
    import json

    from django.http import JsonResponse

    from hmis.apps.core.mfa.models import UserWebAuthnCredential

    if not request.user.is_authenticated:
        return JsonResponse({"error": "Not authenticated"}, status=401)

    credentials = UserWebAuthnCredential.objects.filter(user=request.user)
    if not credentials.exists():
        return JsonResponse({"error": "No passkeys registered."}, status=400)

    from webauthn import generate_authentication_options
    from webauthn.helpers import bytes_to_base64url, options_to_json
    from webauthn.helpers.structs import (
        AuthenticatorTransport,
        PublicKeyCredentialDescriptor,
        UserVerificationRequirement,
    )

    allow_credentials = [
        PublicKeyCredentialDescriptor(
            id=bytes(cred.credential_id),
            transports=[AuthenticatorTransport(t) for t in (cred.transports or [])],
        )
        for cred in credentials
    ]

    from django.conf import settings as django_settings

    rp_id = getattr(django_settings, "WEBAUTHN_RP_ID", "localhost")

    options = generate_authentication_options(
        rp_id=rp_id,
        allow_credentials=allow_credentials,
        user_verification=UserVerificationRequirement.PREFERRED,
    )

    # Store challenge in session
    request.session["admin_webauthn_challenge"] = bytes_to_base64url(options.challenge)

    return JsonResponse(json.loads(options_to_json(options)))


@never_cache
@csrf_exempt
def admin_webauthn_complete(request):
    """Verify WebAuthn authentication response for admin MFA verification."""
    import json

    from django.http import JsonResponse
    from django.utils import timezone as tz

    if not request.user.is_authenticated:
        return JsonResponse({"error": "Not authenticated"}, status=401)

    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    challenge_b64 = request.session.get("admin_webauthn_challenge")
    if not challenge_b64:
        return JsonResponse({"error": "No authentication session. Please try again."}, status=400)

    # Clear challenge immediately to prevent replay
    del request.session["admin_webauthn_challenge"]

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid request body."}, status=400)

    from django.conf import settings as django_settings
    from webauthn import verify_authentication_response
    from webauthn.helpers import base64url_to_bytes, parse_authentication_credential_json

    from hmis.apps.core.mfa.models import UserWebAuthnCredential

    rp_id = getattr(django_settings, "WEBAUTHN_RP_ID", "localhost")
    origin = getattr(django_settings, "WEBAUTHN_ORIGIN", "http://localhost:3009")
    if "," in origin:
        origin = [o.strip() for o in origin.split(",")]

    try:
        credential = parse_authentication_credential_json(json.dumps(body))

        stored_cred = UserWebAuthnCredential.objects.filter(
            user=request.user,
            credential_id=credential.raw_id,
        ).first()

        if not stored_cred:
            return JsonResponse({"error": "Credential not recognized."}, status=400)

        expected_challenge = base64url_to_bytes(challenge_b64)

        verification = verify_authentication_response(
            credential=credential,
            expected_challenge=expected_challenge,
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=bytes(stored_cred.public_key),
            credential_current_sign_count=stored_cred.sign_count,
        )

        # Update sign count
        stored_cred.sign_count = verification.new_sign_count
        stored_cred.last_used_at = tz.now()
        stored_cred.save(update_fields=["sign_count", "last_used_at"])

        # Mark admin MFA as verified
        request.session["admin_mfa_verified"] = True
        request.session["admin_last_activity_at"] = tz.now().timestamp()

        return JsonResponse({"success": True, "redirect": "/admin/"})

    except Exception:
        import logging

        logging.getLogger(__name__).exception("Admin WebAuthn verification failed")
        return JsonResponse({"error": "Passkey verification failed."}, status=400)


@never_cache
def admin_logout(request):
    """Admin logout that accepts both GET and POST (Django 5+ only accepts POST)."""
    from django.contrib.auth import logout as auth_logout
    from django.shortcuts import redirect

    auth_logout(request)
    return redirect("/admin/login/")


# Create a router for API endpoints
router = routers.DefaultRouter()

# Register viewsets
router.register(r"patients", PatientViewSet, basename="patient")
router.register(r"allergies", AllergyViewSet, basename="allergy")
router.register(r"death-records", DeathRecordViewSet, basename="deathrecord")
router.register(r"encounters", EncounterViewSet, basename="encounter")
router.register(r"auditlogs", AuditLogViewSet, basename="auditlog")
router.register(r"icd10-codes", ICD10CodeViewSet, basename="icd10code")
router.register(r"treatment-templates", TreatmentPlanTemplateViewSet, basename="treatmenttemplate")

# RBAC endpoints
router.register(r"departments", DepartmentViewSet, basename="department")
router.register(r"roles", RoleViewSet, basename="role")
router.register(r"staff", StaffProfileViewSet, basename="staffprofile")
router.register(r"org-memberships", OrgMembershipViewSet, basename="orgmembership")
router.register(r"permissions", PermissionViewSet, basename="permission")

# Notification endpoints
router.register(r"notifications", NotificationViewSet, basename="notification")
router.register(r"push-subscriptions", PushSubscriptionViewSet, basename="pushsubscription")

# Facility endpoint (Capability-Based Experience)
router.register(r"facilities", FacilityViewSet, basename="facility")

# DHIS2 integration configuration
router.register(r"dhis2-configs", DHIS2ConfigViewSet, basename="dhis2config")

# Organization endpoint (Multitenancy)
router.register(r"organizations", OrganizationViewSet, basename="organization")

# Subscription Plans (SaaS Licensing)
router.register(r"subscription-plans", SubscriptionPlanViewSet, basename="subscriptionplan")

# Location routes under /api/locations/
location_router = routers.DefaultRouter()
location_router.register(r"counties", CountyViewSet, basename="county")
location_router.register(r"sub-counties", SubCountyViewSet, basename="subcounty")
location_router.register(r"wards", WardViewSet, basename="ward")

# Terminology routes under /api/terminology/
terminology_router = routers.DefaultRouter()
terminology_router.register(r"codesystems", CodeSystemViewSet, basename="codesystem")

urlpatterns = [
    path(
        "favicon.ico",
        serve,
        {"path": "favicon.ico", "document_root": settings.STATIC_ROOT},
    ),
    path("", health_check, name="health_check"),
    path("api/health/", health_check, name="api_health_check"),
    path("admin/mfa-verify/", admin_mfa_verify, name="admin-mfa-verify"),
    path("admin/mfa-verify/webauthn/begin/", admin_webauthn_begin, name="admin-webauthn-begin"),
    path(
        "admin/mfa-verify/webauthn/complete/",
        admin_webauthn_complete,
        name="admin-webauthn-complete",
    ),
    path("admin/logout/", admin_logout, name="admin-logout"),
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("api/me/permissions/", me_permissions, name="me-permissions"),
    path("api/locations/", include(location_router.urls)),
    path("api/terminology/", include(terminology_router.urls)),
    # Nested route for emergency contacts under patients
    path(
        "api/patients/<int:patient_pk>/emergency-contacts/",
        EmergencyContactViewSet.as_view({"get": "list", "post": "create"}),
        name="patient-emergency-contacts-list",
    ),
    path(
        "api/patients/<int:patient_pk>/emergency-contacts/<int:pk>/",
        EmergencyContactViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="patient-emergency-contacts-detail",
    ),
    # Nested route for allergies under patients
    path(
        "api/patients/<int:patient_pk>/allergies/",
        AllergyViewSet.as_view({"get": "list", "post": "create"}),
        name="patient-allergies-list",
    ),
    path(
        "api/patients/<int:patient_pk>/allergies/<int:pk>/",
        AllergyViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="patient-allergies-detail",
    ),
    # Nested route for social history observations under patients
    path(
        "api/patients/<int:patient_pk>/social-history/",
        SocialHistoryObservationViewSet.as_view({"get": "list", "post": "create"}),
        name="patient-social-history-list",
    ),
    path(
        "api/patients/<int:patient_pk>/social-history/<int:pk>/",
        SocialHistoryObservationViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="patient-social-history-detail",
    ),
    # Nested route for chronic conditions under patients
    path(
        "api/patients/<int:patient_pk>/chronic-conditions/",
        ChronicConditionViewSet.as_view({"get": "list", "post": "create"}),
        name="patient-chronic-conditions-list",
    ),
    path(
        "api/patients/<int:patient_pk>/chronic-conditions/<int:pk>/",
        ChronicConditionViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="patient-chronic-conditions-detail",
    ),
    # Nested route for vitals-derived flag suggestions under patients
    path(
        "api/patients/<int:patient_pk>/vital-flag-suggestions/",
        VitalFlagSuggestionViewSet.as_view({"get": "list"}),
        name="patient-vital-flag-suggestions-list",
    ),
    path(
        "api/patients/<int:patient_pk>/vital-flag-suggestions/<int:pk>/",
        VitalFlagSuggestionViewSet.as_view({"get": "retrieve"}),
        name="patient-vital-flag-suggestions-detail",
    ),
    path(
        "api/patients/<int:patient_pk>/vital-flag-suggestions/<int:pk>/acknowledge/",
        VitalFlagSuggestionViewSet.as_view({"post": "acknowledge"}),
        name="patient-vital-flag-suggestions-acknowledge",
    ),
    path(
        "api/patients/<int:patient_pk>/vital-flag-suggestions/<int:pk>/map-codes/",
        VitalFlagSuggestionViewSet.as_view({"post": "map_codes"}),
        name="patient-vital-flag-suggestions-map-codes",
    ),
    path(
        "api/patients/<int:patient_pk>/vital-flag-suggestions/<int:pk>/accept/",
        VitalFlagSuggestionViewSet.as_view({"post": "accept"}),
        name="patient-vital-flag-suggestions-accept",
    ),
    path(
        "api/patients/<int:patient_pk>/vital-flag-suggestions/<int:pk>/reject/",
        VitalFlagSuggestionViewSet.as_view({"post": "reject"}),
        name="patient-vital-flag-suggestions-reject",
    ),
    # Nested route for current medications under patients
    path(
        "api/patients/<int:patient_pk>/current-medications/",
        CurrentMedicationViewSet.as_view({"get": "list", "post": "create"}),
        name="patient-current-medications-list",
    ),
    path(
        "api/patients/<int:patient_pk>/current-medications/<int:pk>/",
        CurrentMedicationViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="patient-current-medications-detail",
    ),
    # Nested route for past surgeries under patients
    path(
        "api/patients/<int:patient_pk>/past-surgeries/",
        PastSurgeryViewSet.as_view({"get": "list", "post": "create"}),
        name="patient-past-surgeries-list",
    ),
    path(
        "api/patients/<int:patient_pk>/past-surgeries/<int:pk>/",
        PastSurgeryViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="patient-past-surgeries-detail",
    ),
    # Nested route for family history under patients
    path(
        "api/patients/<int:patient_pk>/family-history/",
        FamilyHistoryViewSet.as_view({"get": "list", "post": "create"}),
        name="patient-family-history-list",
    ),
    path(
        "api/patients/<int:patient_pk>/family-history/<int:pk>/",
        FamilyHistoryViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="patient-family-history-detail",
    ),
    # Nested route for diagnoses under encounters
    path(
        "api/encounters/<str:encounter_pk>/diagnoses/",
        DiagnosisViewSet.as_view({"get": "list", "post": "create"}),
        name="encounter-diagnoses-list",
    ),
    path(
        "api/encounters/<str:encounter_pk>/diagnoses/<int:pk>/",
        DiagnosisViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="encounter-diagnoses-detail",
    ),
    # Clinical comments nested under encounters
    path(
        "api/encounters/<str:encounter_pk>/comments/",
        ClinicalCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="encounter-comments-list",
    ),
    path(
        "api/encounters/<str:encounter_pk>/comments/<int:pk>/",
        ClinicalCommentViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="encounter-comments-detail",
    ),
    path(
        "api/encounters/<str:encounter_pk>/comments/<int:pk>/react/",
        ClinicalCommentViewSet.as_view({"post": "react"}),
        name="encounter-comments-react",
    ),
    # SNOMED CT search endpoint
    path(
        "api/encounters/snomed/search/",
        SNOMEDSearchView.as_view(),
        name="snomed-search",
    ),
    # Treatment plan route (single per encounter)
    path(
        "api/encounters/<str:encounter_pk>/treatment-plan/",
        TreatmentPlanView.as_view(),
        name="encounter-treatment-plan",
    ),
    # Apply template to treatment plan
    path(
        "api/encounters/<str:encounter_pk>/treatment-plan/apply-template/",
        ApplyTemplateView.as_view(),
        name="encounter-treatment-plan-apply-template",
    ),
    # Medications under treatment plan
    path(
        "api/encounters/<str:encounter_pk>/treatment-plan/medications/",
        MedicationViewSet.as_view({"get": "list", "post": "create"}),
        name="encounter-medications-list",
    ),
    path(
        "api/encounters/<str:encounter_pk>/treatment-plan/medications/<int:pk>/",
        MedicationViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="encounter-medications-detail",
    ),
    # Clinical Templates API
    path("api/", include("hmis.apps.clinical_templates.urls")),
    # Laboratory API
    path("api/lab/", include("hmis.apps.laboratory.urls")),
    # Nested Lab routes under patients
    path(
        "api/patients/<int:patient_pk>/lab-orders/",
        PatientLabOrderViewSet.as_view({"get": "list"}),
        name="patient-lab-orders-list",
    ),
    path(
        "api/patients/<int:patient_pk>/lab-results/",
        PatientLabResultViewSet.as_view({"get": "list"}),
        name="patient-lab-results-list",
    ),
    # Nested Lab routes under encounters
    path(
        "api/encounters/<str:encounter_pk>/lab-orders/",
        EncounterLabOrderViewSet.as_view({"get": "list"}),
        name="encounter-lab-orders-list",
    ),
    # Clinical comments nested under lab orders
    path(
        "api/lab/orders/<int:order_pk>/comments/",
        ClinicalCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="lab-order-comments-list",
    ),
    path(
        "api/lab/orders/<int:order_pk>/comments/<int:pk>/",
        ClinicalCommentViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="lab-order-comments-detail",
    ),
    path(
        "api/lab/orders/<int:order_pk>/comments/<int:pk>/react/",
        ClinicalCommentViewSet.as_view({"post": "react"}),
        name="lab-order-comments-react",
    ),
    # Clinical comments nested under prescriptions
    path(
        "api/pharmacy/prescriptions/<int:prescription_pk>/comments/",
        ClinicalCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="prescription-comments-list",
    ),
    path(
        "api/pharmacy/prescriptions/<int:prescription_pk>/comments/<int:pk>/",
        ClinicalCommentViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="prescription-comments-detail",
    ),
    path(
        "api/pharmacy/prescriptions/<int:prescription_pk>/comments/<int:pk>/react/",
        ClinicalCommentViewSet.as_view({"post": "react"}),
        name="prescription-comments-react",
    ),
    # Clinical comments nested under admissions
    path(
        "api/admissions/<int:admission_pk>/comments/",
        ClinicalCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="admission-comments-list",
    ),
    path(
        "api/admissions/<int:admission_pk>/comments/<int:pk>/",
        ClinicalCommentViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="admission-comments-detail",
    ),
    path(
        "api/admissions/<int:admission_pk>/comments/<int:pk>/react/",
        ClinicalCommentViewSet.as_view({"post": "react"}),
        name="admission-comments-react",
    ),
    # Clinical comments nested under shifts (scheduling)
    path(
        "api/scheduling/shifts/<int:shift_pk>/comments/",
        ClinicalCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="shift-comments-list",
    ),
    path(
        "api/scheduling/shifts/<int:shift_pk>/comments/<int:pk>/",
        ClinicalCommentViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="shift-comments-detail",
    ),
    path(
        "api/scheduling/shifts/<int:shift_pk>/comments/<int:pk>/react/",
        ClinicalCommentViewSet.as_view({"post": "react"}),
        name="shift-comments-react",
    ),
    # @mention autocomplete (org-scoped)
    path(
        "api/comments/mentions/",
        mention_suggestions,
        name="comment-mention-suggestions",
    ),
    # Comment count (lightweight)
    path(
        "api/comments/count/",
        comment_count,
        name="comment-count",
    ),
    # Pharmacy API
    path("api/pharmacy/", include("hmis.apps.pharmacy.urls", namespace="pharmacy")),
    # Inventory API (procurement, transfers, stock counts)
    path("api/inventory/", include("hmis.apps.inventory.urls", namespace="inventory")),
    # MCH API
    path("api/mch/", include("hmis.apps.mch.urls", namespace="mch")),
    # Immunizations API (facility-wide: KEPI + adult + campaigns)
    path("api/immunizations/", include("hmis.apps.immunizations.urls", namespace="immunizations")),
    # Billing API
    path("api/billing/", include("hmis.apps.billing.urls", namespace="billing")),
    # SHA (Social Health Authority) API
    path("api/sha/", include("hmis.apps.billing.sha_urls", namespace="sha")),
    # Insurance (Private Insurers) API
    path("api/insurance/", include("hmis.apps.insurance.urls", namespace="insurance")),
    # Inpatient API
    path("api/inpatient/", include("hmis.apps.inpatient.urls", namespace="inpatient")),
    # Scheduling API
    path("api/scheduling/", include("hmis.apps.scheduling.urls", namespace="scheduling")),
    # Triage API
    path("api/triage/", include("hmis.apps.triage.urls", namespace="triage")),
    # Imaging/Radiology API
    path("api/imaging/", include("hmis.apps.imaging.urls")),
    # Projection read-model APIs
    path("api/projections/", include("hmis.apps.core.projections.urls", namespace="projections")),
    # WebSocket health check
    path("api/ws/health/", include("hmis.apps.core.websockets.urls")),
    # Clinics API
    path("api/", include("hmis.apps.clinics.urls")),
    # Check-in API
    path("api/checkin/", include("hmis.apps.checkin.urls", namespace="checkin")),
    # Disease Surveillance API
    path("api/surveillance/", include("hmis.apps.surveillance.urls", namespace="surveillance")),
    # Physiotherapy API
    path("api/physiotherapy/", include("hmis.apps.physiotherapy.urls", namespace="physiotherapy")),
    # Nutrition/Dietetics API
    path("api/nutrition/", include("hmis.apps.nutrition.urls", namespace="nutrition")),
    # Occupational Therapy API
    path(
        "api/occupational-therapy/",
        include("hmis.apps.occupational_therapy.urls", namespace="occupational_therapy"),
    ),
    # Social Work API
    path("api/social-work/", include("hmis.apps.social_work.urls", namespace="social_work")),
    # Counselling API
    path("api/counselling/", include("hmis.apps.counselling.urls", namespace="counselling")),
    # Allied Health Combined Dashboard API
    path("api/allied-health/", include("hmis.apps.allied_health.urls", namespace="allied_health")),
    # Referrals API
    path("api/referrals/", include("hmis.apps.referrals.urls", namespace="referrals")),
    # Sick Notes API
    path("api/sick-notes/", include("hmis.apps.sick_notes.urls", namespace="sick_notes")),
    # Procedures API
    path("api/procedures/", include("hmis.apps.procedures.urls", namespace="procedures")),
    # Theatre / Operating Room API
    path("api/theatre/", include("hmis.apps.theatre.urls", namespace="theatre")),
    # Blood Bank API
    path("api/blood-bank/", include("hmis.apps.blood_bank.urls", namespace="blood_bank")),
    # Dialysis API
    path("api/dialysis/", include("hmis.apps.dialysis.urls", namespace="dialysis")),
    # Quality Measures & Reporting API
    path("api/quality/", include("hmis.apps.quality.urls", namespace="quality")),
    # Clinical Decision Support (CDS) API
    path("api/cds/", include("hmis.apps.cds.urls", namespace="cds")),
    # HL7 v2 Messaging API
    path("api/hl7/", include("hmis.apps.hl7.urls", namespace="hl7")),
    # KENHDD Schema Validation API
    path("api/kenhdd/", include("hmis.apps.kenhdd.urls", namespace="kenhdd")),
    # AI / TibaBot proxy API
    path("api/ai/", include("hmis.apps.ai.urls", namespace="ai")),
    # Analytics & BI API
    path("api/analytics/", include("hmis.apps.analytics.urls", namespace="analytics")),
    # MOH Reporting API
    path("api/moh-reports/", include("hmis.apps.moh_reporting.urls", namespace="moh_reporting")),
    # Core utilities API (PRC number generation, etc.)
    path("api/core/", include("hmis.apps.core.urls")),
    # REST Sync API (offline-first Tauri/Hub clients)
    path("api/sync/", include("hmis.apps.core.sync_urls")),
    # Hub endpoints (health, remote wipe)
    path("api/hub/", include("hmis.apps.core.hub_urls")),
    # Licensing (activation, check-in, status)
    path("api/licensing/", include("hmis.apps.licensing.urls")),
    # MFA (Multi-Factor Authentication) API
    path("api/mfa/", include("hmis.apps.core.mfa.urls", namespace="mfa")),
    path("api-auth/", include("rest_framework.urls", namespace="rest_framework")),
    # JWT Authentication endpoints (using custom view with audit logging)
    path("api/token/", AuditedTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", MFAAwareTokenRefreshView.as_view(), name="token_refresh"),
    path("api/token/verify/", TokenVerifyView.as_view(), name="token_verify"),
    # HttpOnly cookie-based auth endpoints (web frontend)
    path("api/auth/login/", CookieLoginView.as_view(), name="cookie_login"),
    path("api/auth/refresh/", CookieRefreshView.as_view(), name="cookie_refresh"),
    path("api/auth/logout/", CookieLogoutView.as_view(), name="cookie_logout"),
    path("api/auth/mfa-verify/", CookieMFAVerifyView.as_view(), name="cookie_mfa_verify"),
    # PowerSync credentials endpoint (returns purpose-built JWT for PowerSync Cloud)
    path(
        "api/powersync/credentials/",
        PowerSyncCredentialsView.as_view(),
        name="powersync_credentials",
    ),
    # OpenAPI schema & docs
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/pricing/quote", PricingQuoteView.as_view(), name="pricing-quote"),
    path("api/pricing/quote/", PricingQuoteSlashAliasView.as_view(), name="pricing-quote-slash"),
    path("api/pricing/resolve-plan", PricingResolvePlanView.as_view(), name="pricing-resolve-plan"),
    path(
        "api/pricing/resolve-plan/",
        PricingResolvePlanSlashAliasView.as_view(),
        name="pricing-resolve-plan-slash",
    ),
    path(
        "api/pricing/quotes", PricingQuoteSnapshotCreateView.as_view(), name="pricing-quotes-create"
    ),
    path(
        "api/pricing/quotes/",
        PricingQuoteSnapshotCreateSlashAliasView.as_view(),
        name="pricing-quotes-create-slash",
    ),
    path(
        "api/pricing/quotes/<uuid:quote_id>/",
        PricingQuoteSnapshotDetailView.as_view(),
        name="pricing-quotes-detail",
    ),
    # Prometheus metrics (scraped by Prometheus, not public)
    path("", include("django_prometheus.urls")),
    # SMART on FHIR OAuth2 endpoints
    path("", include("hmis.apps.core.oauth.urls")),
    # FHIR R4 Resource endpoints (for IPS testing)
    path("fhir/", include("hmis.apps.core.fhir.urls", namespace="fhir")),
    # JWKS endpoint — public, no auth, cacheable (TibaBot fetches this to verify user JWTs)
    path(".well-known/jwks.json", include("hmis.apps.ai.jwks_urls")),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

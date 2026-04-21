"""
URL configuration for Vitora HMIS project.

The `urlpatterns` list routes URLs to views.
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework import routers
from rest_framework_simplejwt.views import TokenVerifyView

from hmis.apps.core.cookie_auth import (
    CookieLoginView,
    CookieLogoutView,
    CookieMFAVerifyView,
    CookieRefreshView,
)
from hmis.apps.core.mfa.views import MFAAwareTokenRefreshView
from hmis.apps.core.powersync_tokens import PowerSyncCredentialsView
from hmis.apps.core.views import (
    AuditedTokenObtainPairView,
    AuditLogViewSet,
    CodeSystemViewSet,
    CountyViewSet,
    DepartmentViewSet,
    FacilityViewSet,
    NotificationViewSet,
    OrganizationViewSet,
    PermissionViewSet,
    RoleViewSet,
    StaffProfileViewSet,
    SubCountyViewSet,
    WardViewSet,
    me_permissions,
)
from hmis.apps.encounters.views import (
    ApplyTemplateView,
    DiagnosisViewSet,
    EncounterViewSet,
    ICD10CodeViewSet,
    MedicationViewSet,
    SNOMEDSearchView,
    TreatmentPlanTemplateViewSet,
    TreatmentPlanView,
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


@csrf_exempt
@never_cache
def health_check(request):
    """Simple health check endpoint for monitoring."""
    from django.conf import settings

    # Check if WebSocket/Channels is configured
    websocket_enabled = False
    try:
        # Check if ASGI application and channel layers are configured
        asgi_app = getattr(settings, "ASGI_APPLICATION", None)
        channel_layers = getattr(settings, "CHANNEL_LAYERS", {})
        # Check if channels is in installed apps
        channels_installed = "channels" in settings.INSTALLED_APPS

        # WebSocket is enabled if all components are configured
        websocket_enabled = bool(asgi_app and channel_layers and channels_installed)
    except Exception:
        websocket_enabled = False

    return JsonResponse(
        {
            "status": "healthy",
            "service": "vitora-hmis",
            "version": "0.1.0",
            "websocket_enabled": websocket_enabled,
        }
    )


@never_cache
def admin_mfa_verify(request):
    """Admin MFA verification page — TOTP check before accessing /admin/."""
    from django.shortcuts import redirect
    from django.template.response import TemplateResponse
    from django.utils import timezone as tz

    if not request.user.is_authenticated:
        return redirect("/admin/login/")

    error = None
    if request.method == "POST":
        totp_code = request.POST.get("totp_code", "").strip()
        from hmis.apps.core.mfa.models import UserTOTPDevice

        device = (
            UserTOTPDevice.objects.filter(user=request.user, confirmed=True)
            .order_by("-last_used_at")
            .first()
        )
        if device and device.verify_token(totp_code):
            request.session["admin_mfa_verified"] = True
            device.last_used_at = tz.now()
            device.save(update_fields=["last_used_at"])
            return redirect("/admin/")
        error = "Invalid verification code. Please try again."

    return TemplateResponse(request, "admin/mfa_verify.html", {"error": error})


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
router.register(r"permissions", PermissionViewSet, basename="permission")

# Notification endpoints
router.register(r"notifications", NotificationViewSet, basename="notification")

# Facility endpoint (Capability-Based Experience)
router.register(r"facilities", FacilityViewSet, basename="facility")

# Organization endpoint (Multitenancy)
router.register(r"organizations", OrganizationViewSet, basename="organization")

# Location routes under /api/locations/
location_router = routers.DefaultRouter()
location_router.register(r"counties", CountyViewSet, basename="county")
location_router.register(r"sub-counties", SubCountyViewSet, basename="subcounty")
location_router.register(r"wards", WardViewSet, basename="ward")

# Terminology routes under /api/terminology/
terminology_router = routers.DefaultRouter()
terminology_router.register(r"codesystems", CodeSystemViewSet, basename="codesystem")

urlpatterns = [
    path("", health_check, name="health_check"),
    path("api/health/", health_check, name="api_health_check"),
    path("admin/mfa-verify/", admin_mfa_verify, name="admin-mfa-verify"),
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
    # Nested route for diagnoses under encounters
    path(
        "api/encounters/<int:encounter_pk>/diagnoses/",
        DiagnosisViewSet.as_view({"get": "list", "post": "create"}),
        name="encounter-diagnoses-list",
    ),
    path(
        "api/encounters/<int:encounter_pk>/diagnoses/<int:pk>/",
        DiagnosisViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="encounter-diagnoses-detail",
    ),
    # SNOMED CT search endpoint
    path(
        "api/encounters/snomed/search/",
        SNOMEDSearchView.as_view(),
        name="snomed-search",
    ),
    # Treatment plan route (single per encounter)
    path(
        "api/encounters/<int:encounter_pk>/treatment-plan/",
        TreatmentPlanView.as_view(),
        name="encounter-treatment-plan",
    ),
    # Apply template to treatment plan
    path(
        "api/encounters/<int:encounter_pk>/treatment-plan/apply-template/",
        ApplyTemplateView.as_view(),
        name="encounter-treatment-plan-apply-template",
    ),
    # Medications under treatment plan
    path(
        "api/encounters/<int:encounter_pk>/treatment-plan/medications/",
        MedicationViewSet.as_view({"get": "list", "post": "create"}),
        name="encounter-medications-list",
    ),
    path(
        "api/encounters/<int:encounter_pk>/treatment-plan/medications/<int:pk>/",
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
        "api/encounters/<int:encounter_pk>/lab-orders/",
        EncounterLabOrderViewSet.as_view({"get": "list"}),
        name="encounter-lab-orders-list",
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
    # Procedures API
    path("api/procedures/", include("hmis.apps.procedures.urls", namespace="procedures")),
    # Theatre / Operating Room API
    path("api/theatre/", include("hmis.apps.theatre.urls", namespace="theatre")),
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
    # SMART on FHIR OAuth2 endpoints
    path("", include("hmis.apps.core.oauth.urls")),
    # FHIR R4 Resource endpoints (for IPS testing)
    path("fhir/", include("hmis.apps.core.fhir.urls", namespace="fhir")),
]

# Serve media files in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

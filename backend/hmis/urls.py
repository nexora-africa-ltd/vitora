"""
URL configuration for Vitora HMIS project.

The `urlpatterns` list routes URLs to views.
"""

from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from rest_framework import routers
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from hmis.apps.core.views import (
    AuditedTokenObtainPairView,
    AuditLogViewSet,
    CountyViewSet,
    DepartmentViewSet,
    RoleViewSet,
    StaffProfileViewSet,
    SubCountyViewSet,
    WardViewSet,
)
from hmis.apps.encounters.views import (
    ApplyTemplateView,
    DiagnosisViewSet,
    EncounterViewSet,
    ICD10CodeViewSet,
    MedicationViewSet,
    TreatmentPlanTemplateViewSet,
    TreatmentPlanView,
)
from hmis.apps.patients.views import EmergencyContactViewSet, PatientViewSet


def health_check(request):
    """Simple health check endpoint for monitoring."""
    return JsonResponse({"status": "healthy", "service": "vitora-hmis", "version": "0.1.0"})


# Create a router for API endpoints
router = routers.DefaultRouter()

# Register viewsets
router.register(r"patients", PatientViewSet, basename="patient")
router.register(r"encounters", EncounterViewSet, basename="encounter")
router.register(r"auditlogs", AuditLogViewSet, basename="auditlog")
router.register(r"icd10-codes", ICD10CodeViewSet, basename="icd10code")
router.register(r"treatment-templates", TreatmentPlanTemplateViewSet, basename="treatmenttemplate")

# RBAC endpoints
router.register(r"departments", DepartmentViewSet, basename="department")
router.register(r"roles", RoleViewSet, basename="role")
router.register(r"staff", StaffProfileViewSet, basename="staffprofile")

# Location routes under /api/locations/
location_router = routers.DefaultRouter()
location_router.register(r"counties", CountyViewSet, basename="county")
location_router.register(r"sub-counties", SubCountyViewSet, basename="subcounty")
location_router.register(r"wards", WardViewSet, basename="ward")

urlpatterns = [
    path("", health_check, name="health_check"),
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("api/locations/", include(location_router.urls)),
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
    path("api-auth/", include("rest_framework.urls", namespace="rest_framework")),
    # JWT Authentication endpoints (using custom view with audit logging)
    path("api/token/", AuditedTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/token/verify/", TokenVerifyView.as_view(), name="token_verify"),
]

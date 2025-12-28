"""
URL configuration for Vitora HMIS project.

The `urlpatterns` list routes URLs to views.
"""

from django.contrib import admin
from django.urls import include, path
from rest_framework import routers
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from hmis.apps.core.views import AuditedTokenObtainPairView, AuditLogViewSet
from hmis.apps.encounters.views import EncounterViewSet
from hmis.apps.patients.views import PatientViewSet

# Create a router for API endpoints
router = routers.DefaultRouter()

# Register viewsets
router.register(r"patients", PatientViewSet, basename="patient")
router.register(r"encounters", EncounterViewSet, basename="encounter")
router.register(r"auditlogs", AuditLogViewSet, basename="auditlog")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("api-auth/", include("rest_framework.urls", namespace="rest_framework")),
    # JWT Authentication endpoints (using custom view with audit logging)
    path("api/token/", AuditedTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/token/verify/", TokenVerifyView.as_view(), name="token_verify"),
]

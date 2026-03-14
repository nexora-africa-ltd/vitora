"""
URL configuration for KENHDD module.

DHA Compliance: Gap #33 — KENHDD Schema Validation (Sprint 3.D)
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import KENHDDComplianceViewSet, KENHDDDataElementViewSet

app_name = "kenhdd"

router = DefaultRouter()
router.register(r"elements", KENHDDDataElementViewSet, basename="element")
router.register(r"compliance", KENHDDComplianceViewSet, basename="compliance")

urlpatterns = [
    path("", include(router.urls)),
]

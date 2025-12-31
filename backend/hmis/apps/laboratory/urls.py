"""
URL configuration for laboratory app.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    TestCatalogViewSet,
    LabOrderViewSet,
    LabResultViewSet,
    LOINCCodeViewSet,
)

router = DefaultRouter()
router.register(r"tests", TestCatalogViewSet, basename="test-catalog")
router.register(r"orders", LabOrderViewSet, basename="lab-order")
router.register(r"results", LabResultViewSet, basename="lab-result")
router.register(r"loinc-codes", LOINCCodeViewSet, basename="loinc-code")

urlpatterns = [
    path("", include(router.urls)),
]

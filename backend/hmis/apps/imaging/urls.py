"""
URL configuration for imaging app.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ImagingOrderViewSet,
    ImagingProcedureViewSet,
)

router = DefaultRouter()
router.register(r"procedures", ImagingProcedureViewSet, basename="imaging-procedure")
router.register(r"orders", ImagingOrderViewSet, basename="imaging-order")

urlpatterns = [
    path("", include(router.urls)),
]

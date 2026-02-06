"""
URL configuration for imaging app.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ImagingCalendarView,
    ImagingOrderViewSet,
    ImagingProcedureViewSet,
    ImagingResourceViewSet,
)

router = DefaultRouter()
router.register(r"procedures", ImagingProcedureViewSet, basename="imaging-procedure")
router.register(r"orders", ImagingOrderViewSet, basename="imaging-order")
router.register(r"resources", ImagingResourceViewSet, basename="imaging-resource")

urlpatterns = [
    path("", include(router.urls)),
    path("calendar/", ImagingCalendarView.as_view(), name="imaging-calendar"),
]

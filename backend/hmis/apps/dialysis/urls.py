"""Dialysis URL routing."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import DialysisOrderViewSet, DialysisSessionViewSet, VascularAccessViewSet

router = DefaultRouter()
router.register(r"accesses", VascularAccessViewSet, basename="access")
router.register(r"orders", DialysisOrderViewSet, basename="order")
router.register(r"sessions", DialysisSessionViewSet, basename="session")

app_name = "dialysis"

urlpatterns = [
    path("", include(router.urls)),
]

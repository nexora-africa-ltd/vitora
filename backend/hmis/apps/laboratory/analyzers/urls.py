"""URL configuration for analyzer interfacing module."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AnalyzerDashboardView,
    AnalyzerDriverTemplateViewSet,
    AnalyzerMessageViewSet,
    InstrumentChannelViewSet,
)

router = DefaultRouter()
router.register(r"channels", InstrumentChannelViewSet, basename="instrument-channel")
router.register(r"messages", AnalyzerMessageViewSet, basename="analyzer-message")
router.register(r"templates", AnalyzerDriverTemplateViewSet, basename="driver-template")

urlpatterns = [
    path("dashboard/", AnalyzerDashboardView.as_view(), name="analyzer-dashboard"),
] + router.urls

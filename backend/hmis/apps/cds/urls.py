"""
URL configuration for CDS (Clinical Decision Support) module.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import CDSAlertViewSet, CDSRuleViewSet

app_name = "cds"

router = DefaultRouter()
router.register(r"rules", CDSRuleViewSet, basename="rule")
router.register(r"alerts", CDSAlertViewSet, basename="alert")

urlpatterns = [
    path("", include(router.urls)),
]

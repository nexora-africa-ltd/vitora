"""URL configuration for autoverify module."""

from rest_framework.routers import DefaultRouter

from .views import (
    AutoVerifyConfigViewSet,
    AutoVerifyLogViewSet,
    AutoVerifyRuleViewSet,
    DeltaCheckResultViewSet,
    DeltaCheckRuleViewSet,
)

router = DefaultRouter()
router.register(r"delta-rules", DeltaCheckRuleViewSet, basename="delta-check-rule")
router.register(r"delta-results", DeltaCheckResultViewSet, basename="delta-check-result")
router.register(r"rules", AutoVerifyRuleViewSet, basename="auto-verify-rule")
router.register(r"config", AutoVerifyConfigViewSet, basename="auto-verify-config")
router.register(r"logs", AutoVerifyLogViewSet, basename="auto-verify-log")

urlpatterns = router.urls

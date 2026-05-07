"""URL configuration for critical values module."""

from rest_framework.routers import DefaultRouter

from .views import CriticalValueNotificationViewSet, CriticalValueRangeViewSet

router = DefaultRouter()
router.register(r"ranges", CriticalValueRangeViewSet, basename="critical-value-range")
router.register(
    r"notifications", CriticalValueNotificationViewSet, basename="critical-value-notification"
)

urlpatterns = router.urls

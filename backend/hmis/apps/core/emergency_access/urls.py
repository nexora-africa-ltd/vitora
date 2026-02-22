"""
URL configuration for Emergency Access module.
"""

from rest_framework import routers

from .views import EmergencyAccessViewSet

router = routers.DefaultRouter()
router.register(r"", EmergencyAccessViewSet, basename="emergency-access")

urlpatterns = router.urls

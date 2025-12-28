"""
URL configuration for core app.
"""

from rest_framework import routers

from .views import AuditLogViewSet

router = routers.DefaultRouter()
router.register(r"auditlogs", AuditLogViewSet, basename="auditlog")

urlpatterns = router.urls

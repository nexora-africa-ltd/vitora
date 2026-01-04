"""
URL configuration for core app.
"""

from rest_framework import routers

from .views import (
    AuditLogViewSet,
    DepartmentViewSet,
    NotificationViewSet,
    RoleViewSet,
    StaffProfileViewSet,
)

router = routers.DefaultRouter()
router.register(r"auditlogs", AuditLogViewSet, basename="auditlog")
router.register(r"departments", DepartmentViewSet, basename="department")
router.register(r"roles", RoleViewSet, basename="role")
router.register(r"staff", StaffProfileViewSet, basename="staffprofile")
router.register(r"notifications", NotificationViewSet, basename="notification")

urlpatterns = router.urls

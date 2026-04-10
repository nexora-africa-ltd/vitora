"""MOH Reporting URL configuration."""

from rest_framework.routers import DefaultRouter

from .views import MOH705ReportViewSet, MOH711ReportViewSet, MOH717ReportViewSet

app_name = "moh_reporting"

router = DefaultRouter()
router.register(r"705", MOH705ReportViewSet, basename="moh705")
router.register(r"711", MOH711ReportViewSet, basename="moh711")
router.register(r"717", MOH717ReportViewSet, basename="moh717")

urlpatterns = router.urls

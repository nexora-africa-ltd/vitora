"""URL configuration for worksheets module."""

from rest_framework.routers import DefaultRouter

from .views import (
    LabelPrintJobViewSet,
    LabelTemplateViewSet,
    WorksheetTemplateViewSet,
    WorksheetViewSet,
)

router = DefaultRouter()
router.register(r"templates", WorksheetTemplateViewSet, basename="worksheet-template")
router.register(r"batches", WorksheetViewSet, basename="worksheet")
router.register(r"labels/templates", LabelTemplateViewSet, basename="label-template")
router.register(r"labels/jobs", LabelPrintJobViewSet, basename="label-print-job")

urlpatterns = router.urls

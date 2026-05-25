"""
URL configuration for imaging app.
"""

from django.urls import include, path, re_path
from rest_framework.routers import DefaultRouter

from .views import (
    DICOMFrameRenderView,
    DICOMRetrieveView,
    DICOMStudyViewSet,
    DICOMUploadView,
    ImagingCalendarView,
    ImagingEquipmentViewSet,
    ImagingOrderViewSet,
    ImagingProcedureViewSet,
    ImagingResourceViewSet,
    RadiologyReportViewSet,
    StudyShareAccessView,
    StudyShareDownloadView,
    StudyShareFrameView,
    StudyShareInstanceView,
)

router = DefaultRouter()
router.register(r"procedures", ImagingProcedureViewSet, basename="imaging-procedure")
router.register(r"orders", ImagingOrderViewSet, basename="imaging-order")
router.register(r"resources", ImagingResourceViewSet, basename="imaging-resource")
router.register(r"equipment", ImagingEquipmentViewSet, basename="imaging-equipment")
router.register(r"studies", DICOMStudyViewSet, basename="dicom-study")
router.register(r"reports", RadiologyReportViewSet, basename="radiology-report")

urlpatterns = [
    # DICOM-specific endpoints (must be before router to avoid conflicts)
    path("studies/upload/", DICOMUploadView.as_view(), name="dicom-upload"),
    re_path(
        r"^dicom/(?P<sop_instance_uid>[\d.]+)/$",
        DICOMRetrieveView.as_view(),
        name="dicom-retrieve",
    ),
    re_path(
        r"^dicom/(?P<sop_instance_uid>[\d.]+)/frame/$",
        DICOMFrameRenderView.as_view(),
        name="dicom-frame-render",
    ),
    # Public share endpoints (no JWT — token-authenticated)
    path(
        "share/<str:token>/",
        StudyShareAccessView.as_view(),
        name="dicom-share-access",
    ),
    re_path(
        r"^share/(?P<token>[\w\-]+)/instance/(?P<sop_instance_uid>[\d.]+)/$",
        StudyShareInstanceView.as_view(),
        name="dicom-share-instance",
    ),
    path(
        "share/<str:token>/download/",
        StudyShareDownloadView.as_view(),
        name="dicom-share-download",
    ),
    re_path(
        r"^share/(?P<token>[\w\-]+)/instance/(?P<sop_instance_uid>[\d.]+)/frame/$",
        StudyShareFrameView.as_view(),
        name="dicom-share-frame",
    ),
    path("calendar/", ImagingCalendarView.as_view(), name="imaging-calendar"),
    path("standalone/", include("hmis.apps.imaging.standalone.urls")),
    path("", include(router.urls)),
]

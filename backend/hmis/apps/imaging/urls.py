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
    ImagingOrderViewSet,
    ImagingProcedureViewSet,
    ImagingResourceViewSet,
    RadiologyReportViewSet,
)

router = DefaultRouter()
router.register(r"procedures", ImagingProcedureViewSet, basename="imaging-procedure")
router.register(r"orders", ImagingOrderViewSet, basename="imaging-order")
router.register(r"resources", ImagingResourceViewSet, basename="imaging-resource")
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
    path("calendar/", ImagingCalendarView.as_view(), name="imaging-calendar"),
    path("", include(router.urls)),
]

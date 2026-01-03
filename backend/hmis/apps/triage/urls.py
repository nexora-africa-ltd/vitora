"""
URL configuration for Triage app.

Sprint 1.5-1.6 Track E: Triage Module MVP - Phase 5
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    TriageAssessmentViewSet,
    TriageQueueViewSet,
    VitalThresholdsViewSet,
    WaitTimesReportView,
    VolumeReportView,
)

router = DefaultRouter()
router.register(r'assessments', TriageAssessmentViewSet, basename='triageassessment')
router.register(r'queue', TriageQueueViewSet, basename='triagequeue')
router.register(r'vital-thresholds', VitalThresholdsViewSet, basename='vitalthreshold')

app_name = 'triage'

urlpatterns = [
    # Report endpoints
    path('reports/wait-times/', WaitTimesReportView.as_view(), name='wait-times-report'),
    path('reports/volume/', VolumeReportView.as_view(), name='volume-report'),
    path('', include(router.urls)),
]

"""
URL configuration for inpatient app.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AdmissionRecommendationViewSet,
    AdmissionViewSet,
    BedViewSet,
    DischargeViewSet,
    NursingKardexViewSet,
    ShiftHandoverViewSet,
    TransferViewSet,
    WardRoundViewSet,
    WardViewSet,
)

app_name = 'inpatient'

# Create router for inpatient endpoints
router = DefaultRouter()
router.register(r'wards', WardViewSet, basename='ward')
router.register(r'beds', BedViewSet, basename='bed')
router.register(r'admission-recommendations', AdmissionRecommendationViewSet, basename='admission-recommendation')
router.register(r'admissions', AdmissionViewSet, basename='admission')
router.register(r'discharges', DischargeViewSet, basename='discharge')
router.register(r'transfers', TransferViewSet, basename='transfer')
router.register(r'ward-rounds', WardRoundViewSet, basename='ward-round')
router.register(r'kardex', NursingKardexViewSet, basename='kardex')
router.register(r'shift-handovers', ShiftHandoverViewSet, basename='shift-handover')

urlpatterns = [
    path('', include(router.urls)),
]

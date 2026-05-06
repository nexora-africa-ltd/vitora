"""
URL configuration for QC module.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    EQASampleViewSet,
    EQASubmissionViewSet,
    EQASurveyViewSet,
    QCLotViewSet,
    QCMaterialViewSet,
    QCResultViewSet,
    QCRuleViewSet,
    QCRuleViolationViewSet,
    QCTargetViewSet,
)

router = DefaultRouter()
router.register(r"materials", QCMaterialViewSet, basename="qc-material")
router.register(r"lots", QCLotViewSet, basename="qc-lot")
router.register(r"targets", QCTargetViewSet, basename="qc-target")
router.register(r"results", QCResultViewSet, basename="qc-result")
router.register(r"rules", QCRuleViewSet, basename="qc-rule")
router.register(r"violations", QCRuleViolationViewSet, basename="qc-violation")
router.register(r"eqa/surveys", EQASurveyViewSet, basename="eqa-survey")
router.register(r"eqa/samples", EQASampleViewSet, basename="eqa-sample")
router.register(r"eqa/submissions", EQASubmissionViewSet, basename="eqa-submission")

urlpatterns = [
    path("", include(router.urls)),
]

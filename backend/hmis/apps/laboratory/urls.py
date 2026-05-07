"""
URL configuration for laboratory app.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AnalyzerRunViewSet,
    DiagnosticReportViewSet,
    EncounterLabOrderViewSet,
    InstrumentViewSet,
    LabAttachmentViewSet,
    LabBarcodeConfigViewSet,
    LabCriticalValuesReportView,
    LabOrderViewSet,
    LabQueueViewSet,
    LabResultViewSet,
    LabSampleRejectionReportView,
    LabTurnaroundTimeReportView,
    LabWorkflowSettingsViewSet,
    LabWorkloadReportView,
    LOINCCodeViewSet,
    PatientLabOrderViewSet,
    PatientLabResultViewSet,
    ReferralLabViewSet,
    ResultCommentTemplateViewSet,
    SampleLabelTemplateViewSet,
    SpecimenRejectionReasonViewSet,
    SpecimenViewSet,
    TestCatalogViewSet,
)

router = DefaultRouter()
router.register(r"tests", TestCatalogViewSet, basename="test-catalog")
router.register(r"orders", LabOrderViewSet, basename="lab-order")
router.register(r"results", LabResultViewSet, basename="lab-result")
router.register(r"attachments", LabAttachmentViewSet, basename="lab-attachment")
router.register(r"queue", LabQueueViewSet, basename="lab-queue")
router.register(r"loinc-codes", LOINCCodeViewSet, basename="loinc-code")
router.register(r"instruments", InstrumentViewSet, basename="instrument")
router.register(r"analyzer-runs", AnalyzerRunViewSet, basename="analyzer-run")
router.register(r"diagnostic-reports", DiagnosticReportViewSet, basename="diagnostic-report")
router.register(r"specimens", SpecimenViewSet, basename="specimen")
# Settings
router.register(
    r"settings/rejection-reasons", SpecimenRejectionReasonViewSet, basename="rejection-reason"
)
router.register(
    r"settings/comment-templates", ResultCommentTemplateViewSet, basename="comment-template"
)
router.register(r"settings/referral-labs", ReferralLabViewSet, basename="referral-lab")
router.register(r"settings/label-templates", SampleLabelTemplateViewSet, basename="label-template")
router.register(r"settings/barcode-config", LabBarcodeConfigViewSet, basename="barcode-config")
router.register(r"settings/workflow", LabWorkflowSettingsViewSet, basename="workflow-settings")

urlpatterns = [
    path("reports/turnaround-time/", LabTurnaroundTimeReportView.as_view(), name="lab-report-tat"),
    path("reports/workload/", LabWorkloadReportView.as_view(), name="lab-report-workload"),
    path(
        "reports/critical-values/",
        LabCriticalValuesReportView.as_view(),
        name="lab-report-critical-values",
    ),
    path(
        "reports/rejections/", LabSampleRejectionReportView.as_view(), name="lab-report-rejections"
    ),
    path("qc/", include("hmis.apps.laboratory.qc.urls")),
    path("autoverify/", include("hmis.apps.laboratory.autoverify.urls")),
    path("reporting/", include("hmis.apps.laboratory.reporting.urls")),
    path("microbiology/", include("hmis.apps.laboratory.microbiology.urls")),
    path("analyzers/", include("hmis.apps.laboratory.analyzers.urls")),
    path("worksheets/", include("hmis.apps.laboratory.worksheets.urls")),
    path("reflex/", include("hmis.apps.laboratory.reflex.urls")),
    path("critical-values/", include("hmis.apps.laboratory.critical_values.urls")),
    path("standalone/", include("hmis.apps.laboratory.standalone.urls")),
    path("", include(router.urls)),
]

# Nested routes for patients and encounters (to be included in main urls.py)
patient_lab_patterns = [
    path(
        "lab-orders/",
        PatientLabOrderViewSet.as_view({"get": "list"}),
        name="patient-lab-orders-list",
    ),
    path(
        "lab-orders/<str:order_number>/",
        PatientLabOrderViewSet.as_view({"get": "retrieve"}),
        name="patient-lab-orders-detail",
    ),
    path(
        "lab-results/",
        PatientLabResultViewSet.as_view({"get": "list"}),
        name="patient-lab-results-list",
    ),
]

encounter_lab_patterns = [
    path(
        "lab-orders/",
        EncounterLabOrderViewSet.as_view({"get": "list"}),
        name="encounter-lab-orders-list",
    ),
    path(
        "lab-orders/<str:order_number>/",
        EncounterLabOrderViewSet.as_view({"get": "retrieve"}),
        name="encounter-lab-orders-detail",
    ),
]

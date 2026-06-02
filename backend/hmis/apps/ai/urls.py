"""
URL configuration for AI proxy endpoints.
"""

from django.urls import path

from .views import (
    AIAdvisoryHasOrdersView,
    AIAdvisoryOrderLinkActionView,
    AIAdvisoryOrderLinkListView,
    AIFeedbackStatsView,
    AIFeedbackView,
    AIInsightsView,
    AIStatusView,
    AISuggestionAuditView,
    AutopopulateView,
    CarePlanConditionsListView,
    CarePlanGenerateFHIRView,
    CarePlanGenerateView,
    CDSEvaluateView,
    ClerkingAutocompleteView,
    ClerkingStructureView,
    ClinicalAssistView,
    ClinicalChatSessionDetailView,
    ClinicalChatSessionListView,
    ClinicalChatView,
    ClinicalDocumentGenerateView,
    ConditionPredictView,
    DischargeAssessView,
    DischargeConditionsListView,
    EGFRCalculateView,
    ICD10SuggestView,
    ICULabEnrichmentView,
    ICUPredictView,
    InvestigationSuggestView,
    LabInterpretView,
    ProactiveInsightsView,
    StoredCarePlanDeleteView,
    StoredCarePlanListView,
    StoredCDSResultListView,
    StoredDischargeResultListView,
    StoredEGFRResultListView,
    StoredICURiskResultListView,
    StoredInvestigationSuggestListView,
    StoredLabInterpretListView,
    StoredSurgicalChecklistSessionListView,
    StoredSurgicalPostOpCarePlanListView,
    StoredSurgicalPreOpAssessListView,
    SurgicalChecklistAdvanceView,
    SurgicalChecklistStartView,
    SurgicalChecklistStatusView,
    SurgicalPostOpCarePlanView,
    SurgicalPreOpAssessView,
    SurgicalProcedureDetailView,
    SurgicalProcedureListView,
)
from .views_formulary import FormularySearchView, FormularySmpcDetailView, FormularyStatsView

app_name = "ai"

urlpatterns = [
    path("icd10-suggest/", ICD10SuggestView.as_view(), name="icd10-suggest"),
    path("status/", AIStatusView.as_view(), name="status"),
    # eGFR Calculator
    path("egfr/calculate/", EGFRCalculateView.as_view(), name="egfr-calculate"),
    # Phase 2 — Clinical Chat & Assist
    path("clinical/chat/", ClinicalChatView.as_view(), name="clinical-chat"),
    path("clinical/assist/", ClinicalAssistView.as_view(), name="clinical-assist"),
    # Phase 6 — Clinical Document Generation
    path(
        "clinical/document/",
        ClinicalDocumentGenerateView.as_view(),
        name="clinical-document",
    ),
    # Phase 2 — Session Management
    path(
        "clinical/chat/sessions/",
        ClinicalChatSessionListView.as_view(),
        name="clinical-chat-sessions",
    ),
    path(
        "clinical/chat/session/<str:session_id>/",
        ClinicalChatSessionDetailView.as_view(),
        name="clinical-chat-session-detail",
    ),
    # Phase 3 — Condition Predictor
    path(
        "predict/condition/",
        ConditionPredictView.as_view(),
        name="predict-condition",
    ),
    # Phase 3 — Feedback
    path("feedback/", AIFeedbackView.as_view(), name="feedback"),
    path("feedback/stats/", AIFeedbackStatsView.as_view(), name="feedback-stats"),
    path("insights/", AIInsightsView.as_view(), name="insights"),
    path("suggestion-audit/", AISuggestionAuditView.as_view(), name="suggestion-audit"),
    # Phase 4 — ICU Predictor
    path(
        "predict/icu/",
        ICUPredictView.as_view(),
        name="predict-icu",
    ),
    path(
        "predict/icu/labs/",
        ICULabEnrichmentView.as_view(),
        name="predict-icu-labs",
    ),
    # Phase 4a — Smart Autopopulate
    path("autopopulate/", AutopopulateView.as_view(), name="autopopulate"),
    # Phase 5 — Lab Assist
    path("lab/interpret/", LabInterpretView.as_view(), name="lab-interpret"),
    # Phase 5 — Discharge Readiness
    path("discharge/assess/", DischargeAssessView.as_view(), name="discharge-assess"),
    path(
        "discharge/conditions/",
        DischargeConditionsListView.as_view(),
        name="discharge-conditions",
    ),
    # Phase 5 — Care Plan Generator
    path(
        "care-plan/generate/",
        CarePlanGenerateView.as_view(),
        name="care-plan-generate",
    ),
    path(
        "care-plan/generate/fhir/",
        CarePlanGenerateFHIRView.as_view(),
        name="care-plan-generate-fhir",
    ),
    path(
        "care-plan/conditions/",
        CarePlanConditionsListView.as_view(),
        name="care-plan-conditions",
    ),
    # Phase 5 — Clerking Assist
    path(
        "clerking/autocomplete/",
        ClerkingAutocompleteView.as_view(),
        name="clerking-autocomplete",
    ),
    path(
        "clerking/structure/",
        ClerkingStructureView.as_view(),
        name="clerking-structure",
    ),
    # Phase 5 — Enhanced CDS
    path("cds/evaluate/", CDSEvaluateView.as_view(), name="cds-evaluate"),
    # Phase 7 — Investigation Suggestions
    path(
        "investigations/suggest/",
        InvestigationSuggestView.as_view(),
        name="investigations-suggest",
    ),
    # Phase 8 — Surgical Assistant
    path(
        "surgical/pre-op/assess/",
        SurgicalPreOpAssessView.as_view(),
        name="surgical-pre-op-assess",
    ),
    path(
        "surgical/checklist/start/",
        SurgicalChecklistStartView.as_view(),
        name="surgical-checklist-start",
    ),
    path(
        "surgical/checklist/<str:session_id>/advance/",
        SurgicalChecklistAdvanceView.as_view(),
        name="surgical-checklist-advance",
    ),
    path(
        "surgical/checklist/<str:session_id>/status/",
        SurgicalChecklistStatusView.as_view(),
        name="surgical-checklist-status",
    ),
    path(
        "surgical/post-op/care-plan/",
        SurgicalPostOpCarePlanView.as_view(),
        name="surgical-post-op-care-plan",
    ),
    path(
        "surgical/procedures/",
        SurgicalProcedureListView.as_view(),
        name="surgical-procedures",
    ),
    path(
        "surgical/procedures/<str:procedure_key>/",
        SurgicalProcedureDetailView.as_view(),
        name="surgical-procedure-detail",
    ),
    # Stored AI result retrieval
    path("results/care-plans/", StoredCarePlanListView.as_view(), name="results-care-plans"),
    path(
        "results/care-plans/<uuid:pk>/",
        StoredCarePlanDeleteView.as_view(),
        name="results-care-plans-delete",
    ),
    path("results/cds/", StoredCDSResultListView.as_view(), name="results-cds"),
    path(
        "results/lab-interpretations/",
        StoredLabInterpretListView.as_view(),
        name="results-lab-interpretations",
    ),
    path("results/discharge/", StoredDischargeResultListView.as_view(), name="results-discharge"),
    path("results/icu-risk/", StoredICURiskResultListView.as_view(), name="results-icu-risk"),
    path("results/egfr/", StoredEGFRResultListView.as_view(), name="results-egfr"),
    path(
        "results/investigation-suggestions/",
        StoredInvestigationSuggestListView.as_view(),
        name="results-investigation-suggestions",
    ),
    path(
        "results/surgical/pre-op-assessments/",
        StoredSurgicalPreOpAssessListView.as_view(),
        name="results-surgical-pre-op-assessments",
    ),
    path(
        "results/surgical/checklist-sessions/",
        StoredSurgicalChecklistSessionListView.as_view(),
        name="results-surgical-checklist-sessions",
    ),
    path(
        "results/surgical/post-op-care-plans/",
        StoredSurgicalPostOpCarePlanListView.as_view(),
        name="results-surgical-post-op-care-plans",
    ),
    # ── Advisory order links ──────────────────────────────────────────
    path(
        "advisory-links/",
        AIAdvisoryOrderLinkListView.as_view(),
        name="advisory-links-list",
    ),
    path(
        "advisory-links/has-orders/",
        AIAdvisoryHasOrdersView.as_view(),
        name="advisory-links-has-orders",
    ),
    path(
        "advisory-links/<int:pk>/action/",
        AIAdvisoryOrderLinkActionView.as_view(),
        name="advisory-links-action",
    ),
    # ── Proactive Insights ─────────────────────────────────────────────
    path(
        "clinical/proactive-insights/",
        ProactiveInsightsView.as_view(),
        name="proactive-insights",
    ),
    # ── Drug Formulary ────────────────────────────────────────────────
    path(
        "formulary/search/",
        FormularySearchView.as_view(),
        name="formulary-search",
    ),
    path(
        "formulary/smpc/<str:doc_id>/",
        FormularySmpcDetailView.as_view(),
        name="formulary-smpc-detail",
    ),
    path(
        "formulary/stats/",
        FormularyStatsView.as_view(),
        name="formulary-stats",
    ),
]

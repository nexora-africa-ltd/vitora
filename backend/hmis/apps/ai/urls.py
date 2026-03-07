"""
URL configuration for AI proxy endpoints.
"""

from django.urls import path

from .views import (
    AIFeedbackStatsView,
    AIFeedbackView,
    AISuggestionAuditView,
    AIStatusView,
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
    ConditionPredictView,
    DischargeAssessView,
    DischargeConditionsListView,
    ICD10SuggestView,
    ICUPredictView,
    LabInterpretView,
)

app_name = "ai"

urlpatterns = [
    path("icd10-suggest/", ICD10SuggestView.as_view(), name="icd10-suggest"),
    path("status/", AIStatusView.as_view(), name="status"),
    # Phase 2 — Clinical Chat & Assist
    path("clinical/chat/", ClinicalChatView.as_view(), name="clinical-chat"),
    path("clinical/assist/", ClinicalAssistView.as_view(), name="clinical-assist"),
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
    path("suggestion-audit/", AISuggestionAuditView.as_view(), name="suggestion-audit"),
    # Phase 4 — ICU Predictor
    path(
        "predict/icu/",
        ICUPredictView.as_view(),
        name="predict-icu",
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
]

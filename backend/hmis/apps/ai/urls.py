"""
URL configuration for AI proxy endpoints.
"""

from django.urls import path

from .views import (
    AIStatusView,
    ClinicalAssistView,
    ClinicalChatView,
    ICD10SuggestView,
)

app_name = "ai"

urlpatterns = [
    path("icd10-suggest/", ICD10SuggestView.as_view(), name="icd10-suggest"),
    path("status/", AIStatusView.as_view(), name="status"),
    # Phase 2 — Clinical Chat & Assist
    path("clinical/chat/", ClinicalChatView.as_view(), name="clinical-chat"),
    path("clinical/assist/", ClinicalAssistView.as_view(), name="clinical-assist"),
]

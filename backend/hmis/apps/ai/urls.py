"""
URL configuration for AI proxy endpoints.
"""

from django.urls import path

from .views import (
    AIStatusView,
    ClinicalAssistView,
    ClinicalChatSessionDetailView,
    ClinicalChatSessionListView,
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
]

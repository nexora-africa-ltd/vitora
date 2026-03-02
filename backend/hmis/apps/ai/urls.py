"""
URL configuration for AI proxy endpoints.
"""

from django.urls import path

from .views import AIStatusView, ICD10SuggestView

app_name = "ai"

urlpatterns = [
    path("icd10-suggest/", ICD10SuggestView.as_view(), name="icd10-suggest"),
    path("status/", AIStatusView.as_view(), name="status"),
]

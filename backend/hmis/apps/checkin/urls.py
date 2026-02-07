"""
URL configuration for Check-in API endpoints.

Sprint: Returning Patient Workflow - Sprint 1
"""

from django.urls import path

from .views import PatientCheckinView, PatientLookupView, TodayCheckinsViewSet

app_name = "checkin"

urlpatterns = [
    # Patient lookup with clinical snapshot
    path(
        "lookup/",
        PatientLookupView.as_view(),
        name="patient-lookup",
    ),
    # Check in a patient
    path(
        "patients/<int:patient_id>/checkin/",
        PatientCheckinView.as_view(),
        name="patient-checkin",
    ),
    # Today's check-ins
    path(
        "today/",
        TodayCheckinsViewSet.as_view({"get": "list"}),
        name="today-checkins",
    ),
]

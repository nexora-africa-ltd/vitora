"""URL configuration for projection read-only APIs."""

from django.urls import path

from hmis.apps.core.projections.views import (
    clinic_queue_stats,
    pharmacy_queue_stats,
    ward_occupancy_stats,
)

app_name = "projections"

urlpatterns = [
    path("clinic-queue/", clinic_queue_stats, name="clinic-queue-stats"),
    path("ward-occupancy/", ward_occupancy_stats, name="ward-occupancy-stats"),
    path("pharmacy-queue/", pharmacy_queue_stats, name="pharmacy-queue-stats"),
]

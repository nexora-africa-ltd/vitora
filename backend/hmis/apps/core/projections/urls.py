"""URL configuration for projection read-only APIs."""

from django.urls import path

from hmis.apps.core.projections.views import (
    clinic_queue_stats,
    pharmacy_queue_stats,
    room_utilization_stats,
    room_utilization_summary,
    ward_occupancy_stats,
)

app_name = "projections"

urlpatterns = [
    path("clinic-queue/", clinic_queue_stats, name="clinic-queue-stats"),
    path("ward-occupancy/", ward_occupancy_stats, name="ward-occupancy-stats"),
    path("pharmacy-queue/", pharmacy_queue_stats, name="pharmacy-queue-stats"),
    path("room-utilization/", room_utilization_stats, name="room-utilization-stats"),
    path(
        "room-utilization/summary/",
        room_utilization_summary,
        name="room-utilization-summary",
    ),
]

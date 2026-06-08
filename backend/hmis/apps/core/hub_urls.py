"""URL configuration for hub health endpoint."""

from django.urls import path

from .hub_views import hub_health

urlpatterns = [
    path("", hub_health, name="hub-health"),
]

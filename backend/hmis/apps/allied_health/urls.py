"""
URL configuration for the Allied Health module.
"""

from django.urls import path

from hmis.apps.allied_health.views import AlliedHealthDashboardView

app_name = "allied_health"

urlpatterns = [
    path("dashboard/", AlliedHealthDashboardView.as_view(), name="dashboard"),
]

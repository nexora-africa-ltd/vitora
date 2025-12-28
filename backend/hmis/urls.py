"""
URL configuration for Vitora HMIS project.

The `urlpatterns` list routes URLs to views.
"""

from django.contrib import admin
from django.urls import include, path
from rest_framework import routers

from hmis.apps.encounters.views import EncounterViewSet
from hmis.apps.patients.views import PatientViewSet

# Create a router for API endpoints
router = routers.DefaultRouter()

# Register viewsets
router.register(r"patients", PatientViewSet, basename="patient")
router.register(r"encounters", EncounterViewSet, basename="encounter")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("api-auth/", include("rest_framework.urls", namespace="rest_framework")),
]

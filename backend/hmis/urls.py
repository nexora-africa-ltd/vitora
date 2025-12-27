"""
URL configuration for Vitora HMIS project.

The `urlpatterns` list routes URLs to views.
"""

from django.contrib import admin
from django.urls import include, path
from rest_framework import routers

# Create a router for API endpoints
router = routers.DefaultRouter()

# API URL patterns will be registered here as we add viewsets
# Example: router.register(r'patients', PatientViewSet)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
    path("api-auth/", include("rest_framework.urls", namespace="rest_framework")),
]

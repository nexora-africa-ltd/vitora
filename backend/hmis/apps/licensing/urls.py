"""
URL routes for the licensing API.
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("installations", views.InstallationViewSet, basename="installation")

urlpatterns = [
    path("activate/", views.activate_installation, name="licensing-activate"),
    path("check-in/", views.check_in, name="licensing-check-in"),
    path("status/", views.license_status, name="licensing-status"),
    path("generate-code/", views.generate_activation_code, name="licensing-generate-code"),
] + router.urls

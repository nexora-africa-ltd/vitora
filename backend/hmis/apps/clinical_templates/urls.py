"""
URL configuration for Clinical Templates.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ClinicalTemplateViewSet

router = DefaultRouter()
router.register(r"clinical-templates", ClinicalTemplateViewSet, basename="clinical-template")

urlpatterns = [
    path("", include(router.urls)),
]

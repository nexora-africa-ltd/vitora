"""HL7 endpoint and message URL configuration."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import HL7EndpointViewSet, HL7MessageViewSet

app_name = "hl7"

router = DefaultRouter()
router.register(r"endpoints", HL7EndpointViewSet, basename="hl7-endpoint")
router.register(r"messages", HL7MessageViewSet, basename="hl7-message")

urlpatterns = [
    path("", include(router.urls)),
]

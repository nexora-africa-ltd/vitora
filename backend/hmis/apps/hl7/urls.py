"""HL7 message URL configuration."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import HL7MessageViewSet

app_name = "hl7"

router = DefaultRouter()
router.register(r"messages", HL7MessageViewSet, basename="hl7-message")

urlpatterns = [
    path("", include(router.urls)),
]

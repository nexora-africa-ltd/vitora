"""Blood Bank URL routing."""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BloodDonorViewSet,
    BloodIssueViewSet,
    BloodRequestViewSet,
    BloodUnitViewSet,
    CrossMatchViewSet,
)

router = DefaultRouter()
router.register(r"donors", BloodDonorViewSet, basename="donor")
router.register(r"units", BloodUnitViewSet, basename="unit")
router.register(r"requests", BloodRequestViewSet, basename="request")
router.register(r"crossmatches", CrossMatchViewSet, basename="crossmatch")
router.register(r"issues", BloodIssueViewSet, basename="issue")

app_name = "blood_bank"

urlpatterns = [
    path("", include(router.urls)),
]

"""
URL configuration for the counselling module.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.counselling.views import (
    CounsellingReferralViewSet,
    CounsellingSessionViewSet,
    CounsellingTypeViewSet,
)

app_name = "counselling"

router = DefaultRouter()
router.register(r"types", CounsellingTypeViewSet, basename="type")
router.register(r"referrals", CounsellingReferralViewSet, basename="referral")
router.register(r"sessions", CounsellingSessionViewSet, basename="session")

urlpatterns = [
    path("", include(router.urls)),
]

"""
URL configuration for the social work module.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.social_work.views import (
    CaseNoteViewSet,
    SocialWorkCaseViewSet,
    SocialWorkInterventionViewSet,
    SocialWorkReferralViewSet,
)

app_name = "social_work"

router = DefaultRouter()
router.register(r"referrals", SocialWorkReferralViewSet, basename="referral")
router.register(r"cases", SocialWorkCaseViewSet, basename="case")
router.register(r"notes", CaseNoteViewSet, basename="note")
router.register(r"interventions", SocialWorkInterventionViewSet, basename="intervention")

urlpatterns = [
    path("", include(router.urls)),
]

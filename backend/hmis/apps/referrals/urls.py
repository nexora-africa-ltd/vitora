"""
URL configuration for the referrals module.

Routes:
    /api/referrals/                     - List/create referrals
    /api/referrals/{id}/                - Retrieve/update/delete referral
    /api/referrals/{id}/accept/         - Accept a referral
    /api/referrals/{id}/decline/        - Decline a referral
    /api/referrals/{id}/cancel/         - Cancel a referral
    /api/referrals/for-encounter/{id}/  - List referrals for an encounter
    /api/referrals/pending/             - List pending referrals
    /api/referrals/my-referrals/        - List current user's referrals
    /api/referrals/stats/               - Referral statistics
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from hmis.apps.referrals.views import ClinicalReferralViewSet

app_name = "referrals"

router = DefaultRouter()
router.register(r"", ClinicalReferralViewSet, basename="referral")

urlpatterns = [
    path("", include(router.urls)),
]

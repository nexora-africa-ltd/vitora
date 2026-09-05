# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Routes for the DHA Shared Health Record consent lifecycle API."""

from django.urls import path

from hmis.apps.shr.views import (
    SHRCloseVisitView,
    SHRConsentCollectionView,
    SHRConsentDetailView,
    SHRConsentStatusView,
    SHROTPVerificationView,
    SHRRefreshVisitView,
    SHRResendOTPView,
)

app_name = "shr"

urlpatterns = [
    path("consents/", SHRConsentCollectionView.as_view(), name="consent-collection"),
    path("consents/<int:pk>/", SHRConsentDetailView.as_view(), name="consent-detail"),
    path("consents/<int:pk>/verify/", SHROTPVerificationView.as_view(), name="consent-verify"),
    path("consents/<int:pk>/status/", SHRConsentStatusView.as_view(), name="consent-status"),
    path("consents/<int:pk>/resend-otp/", SHRResendOTPView.as_view(), name="consent-resend-otp"),
    path("visits/<int:pk>/refresh/", SHRRefreshVisitView.as_view(), name="visit-refresh"),
    path("visits/<int:pk>/close/", SHRCloseVisitView.as_view(), name="visit-close"),
]

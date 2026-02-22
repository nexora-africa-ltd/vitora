"""
MFA URL configuration for Vitora HMIS.
"""

from django.urls import path

from hmis.apps.core.mfa.views import (
    BackupCodesRegenerateView,
    MFADisableView,
    MFAStatusView,
    MFAVerifyView,
    TOTPConfirmView,
    TOTPSetupView,
)

app_name = "mfa"

urlpatterns = [
    # Status
    path("status/", MFAStatusView.as_view(), name="status"),
    # TOTP enrollment
    path("totp/setup/", TOTPSetupView.as_view(), name="totp-setup"),
    path("totp/confirm/", TOTPConfirmView.as_view(), name="totp-confirm"),
    # Disable
    path("disable/", MFADisableView.as_view(), name="disable"),
    # Backup codes
    path(
        "backup-codes/regenerate/",
        BackupCodesRegenerateView.as_view(),
        name="backup-codes-regenerate",
    ),
    # Login verification
    path("verify/", MFAVerifyView.as_view(), name="verify"),
]

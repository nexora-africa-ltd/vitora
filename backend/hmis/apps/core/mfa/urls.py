"""
MFA URL configuration for Vitora HMIS.
"""

from django.urls import path

from hmis.apps.core.mfa.views import (
    BackupCodesDownloadView,
    BackupCodesRegenerateView,
    MFADisableView,
    MFAStatusView,
    MFAVerifyView,
    TOTPConfirmView,
    TOTPSetupView,
    WebAuthnAuthenticateBeginView,
    WebAuthnAuthenticateCompleteView,
    WebAuthnCredentialDeleteView,
    WebAuthnCredentialsListView,
    WebAuthnRegisterBeginView,
    WebAuthnRegisterCompleteView,
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
    path(
        "backup-codes/download/",
        BackupCodesDownloadView.as_view(),
        name="backup-codes-download",
    ),
    # Login verification
    path("verify/", MFAVerifyView.as_view(), name="verify"),
    # WebAuthn / Passkey
    path(
        "webauthn/register/begin/",
        WebAuthnRegisterBeginView.as_view(),
        name="webauthn-register-begin",
    ),
    path(
        "webauthn/register/complete/",
        WebAuthnRegisterCompleteView.as_view(),
        name="webauthn-register-complete",
    ),
    path(
        "webauthn/credentials/",
        WebAuthnCredentialsListView.as_view(),
        name="webauthn-credentials-list",
    ),
    path(
        "webauthn/credentials/<int:credential_id>/",
        WebAuthnCredentialDeleteView.as_view(),
        name="webauthn-credential-delete",
    ),
    path(
        "webauthn/authenticate/begin/",
        WebAuthnAuthenticateBeginView.as_view(),
        name="webauthn-authenticate-begin",
    ),
    path(
        "webauthn/authenticate/complete/",
        WebAuthnAuthenticateCompleteView.as_view(),
        name="webauthn-authenticate-complete",
    ),
]

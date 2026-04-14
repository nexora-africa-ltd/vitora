"""
MFA serializers for Vitora HMIS.

Serializers for MFA-related API endpoints.
"""

from rest_framework import serializers


class MFAStatusSerializer(serializers.Serializer):
    """Serializer for MFA status response."""

    mfa_enabled = serializers.BooleanField()
    mfa_required = serializers.BooleanField()
    devices_count = serializers.IntegerField()
    webauthn_credentials_count = serializers.IntegerField(default=0)
    backup_codes_remaining = serializers.IntegerField()
    has_pending_setup = serializers.BooleanField(required=False)
    available_methods = serializers.ListField(child=serializers.CharField(), default=list)


class TOTPSetupSerializer(serializers.Serializer):
    """Serializer for TOTP setup response."""

    secret = serializers.CharField()
    qr_code = serializers.CharField()  # Base64 encoded QR image
    provisioning_uri = serializers.CharField()


class TOTPConfirmSerializer(serializers.Serializer):
    """Serializer for TOTP confirmation request."""

    token = serializers.CharField(
        min_length=6,
        max_length=6,
        help_text="6-digit TOTP token from authenticator app",
    )

    def validate_token(self, value):
        """Ensure token is numeric."""
        if not value.isdigit():
            raise serializers.ValidationError("Token must be a 6-digit number")
        return value


class TOTPConfirmResponseSerializer(serializers.Serializer):
    """Serializer for TOTP confirmation response."""

    confirmed = serializers.BooleanField()
    backup_codes = serializers.ListField(
        child=serializers.CharField(),
        help_text="List of backup codes (store securely!)",
    )


class MFADisableSerializer(serializers.Serializer):
    """Serializer for MFA disable request."""

    password = serializers.CharField(
        write_only=True,
        help_text="Current password to confirm identity",
    )


class MFAVerifySerializer(serializers.Serializer):
    """Serializer for MFA verification during login."""

    mfa_token = serializers.CharField(
        help_text="Temporary MFA token from login response",
    )
    token = serializers.CharField(
        required=False,
        min_length=6,
        max_length=6,
        help_text="6-digit TOTP token",
    )
    backup_code = serializers.CharField(
        required=False,
        help_text="8-character backup code",
    )

    def validate(self, attrs):
        """Ensure either token or backup_code is provided."""
        token = attrs.get("token")
        backup_code = attrs.get("backup_code")

        if not token and not backup_code:
            raise serializers.ValidationError(
                "Either 'token' (TOTP) or 'backup_code' must be provided"
            )

        if token and not token.isdigit():
            raise serializers.ValidationError({"token": "Token must be a 6-digit number"})

        return attrs


class BackupCodesRegenerateSerializer(serializers.Serializer):
    """Serializer for backup code regeneration request."""

    token = serializers.CharField(
        min_length=6,
        max_length=6,
        help_text="6-digit TOTP token to confirm identity",
    )

    def validate_token(self, value):
        """Ensure token is numeric."""
        if not value.isdigit():
            raise serializers.ValidationError("Token must be a 6-digit number")
        return value


class BackupCodesResponseSerializer(serializers.Serializer):
    """Serializer for backup codes response."""

    backup_codes = serializers.ListField(
        child=serializers.CharField(),
        help_text="List of backup codes (store securely!)",
    )


# =============================================================================
# WebAuthn / FIDO2 / Passkey Serializers
# =============================================================================


class WebAuthnRegisterBeginSerializer(serializers.Serializer):
    """Response serializer for WebAuthn registration begin."""

    options = serializers.JSONField(help_text="PublicKeyCredentialCreationOptions as JSON")


class WebAuthnRegisterCompleteSerializer(serializers.Serializer):
    """Request serializer for WebAuthn registration complete."""

    credential = serializers.JSONField(
        help_text="The PublicKeyCredential response from navigator.credentials.create()"
    )
    name = serializers.CharField(
        max_length=200,
        default="Security Key",
        help_text="Friendly name for this credential",
    )


class WebAuthnCredentialSerializer(serializers.Serializer):
    """Serializer for a single WebAuthn credential (read-only)."""

    id = serializers.IntegerField()
    name = serializers.CharField()
    created_at = serializers.DateTimeField()
    last_used_at = serializers.DateTimeField(allow_null=True)
    backed_up = serializers.BooleanField()
    transports = serializers.ListField(child=serializers.CharField())


class WebAuthnAuthenticateBeginSerializer(serializers.Serializer):
    """Response serializer for WebAuthn authentication begin."""

    options = serializers.JSONField(help_text="PublicKeyCredentialRequestOptions as JSON")


class WebAuthnAuthenticateCompleteSerializer(serializers.Serializer):
    """Request serializer for WebAuthn authentication complete (MFA verify flow)."""

    mfa_token = serializers.CharField(help_text="Temporary MFA token from login response")
    credential = serializers.JSONField(
        help_text="The PublicKeyCredential response from navigator.credentials.get()"
    )


class WebAuthnDeleteSerializer(serializers.Serializer):
    """Request serializer for deleting a WebAuthn credential."""

    password = serializers.CharField(
        write_only=True,
        help_text="Current password to confirm identity",
    )

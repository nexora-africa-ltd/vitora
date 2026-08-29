# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Serializers for the licensing API.
"""

from rest_framework import serializers

from .models import Installation


class ActivationRequestSerializer(serializers.Serializer):
    """Request body for activating an installation."""

    installation_id = serializers.CharField(
        max_length=200,
        help_text="Unique client identifier generated on first run.",
    )
    activation_code = serializers.CharField(
        max_length=64,
        help_text="One-time activation code provided by Nexora.",
    )
    name = serializers.CharField(
        max_length=200,
        required=False,
        default="",
        help_text="Optional human-friendly name for this installation.",
    )
    app_version = serializers.CharField(
        max_length=50,
        required=False,
        default="",
    )
    os_info = serializers.CharField(
        max_length=200,
        required=False,
        default="",
    )
    os = serializers.CharField(
        max_length=200,
        required=False,
        default="",
        help_text="Legacy alias for os_info used by older check-in clients.",
    )
    eula_accepted = serializers.BooleanField(
        required=True,
        help_text="Must be true to confirm acceptance of the Hub EULA.",
    )
    eula_version = serializers.CharField(
        max_length=32,
        required=True,
        help_text="Version of the EULA accepted by the installer/user.",
    )

    def validate_eula_accepted(self, value: bool) -> bool:
        if not value:
            raise serializers.ValidationError(
                "EULA acceptance is required to activate this installation."
            )
        return value


class CheckInRequestSerializer(serializers.Serializer):
    """Request body for periodic license check-in (Phase 3 enhanced)."""

    class Meta:
        ref_name = "LicensingCheckInRequest"

    installation_id = serializers.CharField(
        max_length=200,
        help_text="Unique client identifier of the installation checking in.",
    )
    app_version = serializers.CharField(
        max_length=50,
        required=False,
        default="",
    )
    os_info = serializers.CharField(
        max_length=200,
        required=False,
        default="",
    )
    # Phase 3 additions
    license_jti = serializers.CharField(
        max_length=200,
        required=False,
        default="",
        help_text="JTI of the current license JWT.",
    )
    version = serializers.CharField(
        max_length=50,
        required=False,
        default="",
        help_text="Alias for app_version (Phase 3 payload format).",
    )
    uptime_seconds = serializers.IntegerField(
        required=False,
        default=0,
    )
    hostname = serializers.CharField(
        max_length=255,
        required=False,
        default="",
    )
    ip_address = serializers.CharField(
        max_length=45,
        required=False,
        default="",
    )
    user_count_24h = serializers.IntegerField(
        required=False,
        default=0,
    )
    encounter_count_24h = serializers.IntegerField(
        required=False,
        default=0,
    )
    binary_hashes = serializers.DictField(
        child=serializers.CharField(),
        required=False,
        default=dict,
        help_text="Map of relative file path → SHA-256 hash of compiled binaries.",
    )
    hardware_fingerprint = serializers.CharField(
        max_length=128,
        required=False,
        default="",
        help_text="SHA-256 of hardware identifiers.",
    )


class ActivationResponseSerializer(serializers.Serializer):
    """Response body after successful activation or check-in."""

    license_token = serializers.CharField(help_text="Signed RS256 JWT license token.")
    installation_id = serializers.CharField()
    org_name = serializers.CharField()
    tier = serializers.CharField()
    features = serializers.DictField()
    expires_at = serializers.IntegerField(help_text="Unix timestamp when the token expires.")
    check_in_by = serializers.IntegerField(
        help_text="Unix timestamp by which the next check-in is required."
    )


class InstallationListSerializer(serializers.ModelSerializer):
    """List view of installations (admin)."""

    org_name = serializers.CharField(source="organization.name", read_only=True)

    class Meta:
        model = Installation
        fields = [
            "id",
            "installation_id",
            "name",
            "org_name",
            "status",
            "activated_at",
            "last_check_in",
            "app_version",
            "os_info",
            "created_at",
        ]


class InstallationDetailSerializer(serializers.ModelSerializer):
    """Detail view of an installation (admin)."""

    org_name = serializers.CharField(source="organization.name", read_only=True)
    facility_name = serializers.CharField(source="facility.name", read_only=True, default="")
    is_tampered = serializers.BooleanField(read_only=True)

    class Meta:
        model = Installation
        fields = [
            "id",
            "installation_id",
            "name",
            "organization",
            "org_name",
            "facility",
            "facility_name",
            "status",
            "activation_code",
            "activated_at",
            "eula_accepted_at",
            "eula_version",
            "activated_by",
            "last_check_in",
            "check_in_ip",
            "check_in_count",
            "app_version",
            "os_info",
            "hostname",
            "hardware_fingerprint",
            "binary_manifest_id",
            "tamper_flagged_at",
            "tamper_resolved_at",
            "revocation_epoch",
            "last_reported_hashes",
            "revoked_at",
            "revoked_reason",
            "is_tampered",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "installation_id",
            "status",
            "activated_at",
            "activated_by",
            "last_check_in",
            "check_in_ip",
            "revoked_at",
            "license_jwt",
            "created_at",
            "updated_at",
        ]


class GenerateActivationCodeSerializer(serializers.Serializer):
    """Request to generate a new activation code for an organization."""

    organization_id = serializers.IntegerField(
        help_text="Organization ID to generate an activation code for."
    )
    name = serializers.CharField(
        max_length=200,
        required=False,
        default="",
        help_text="Optional name for the installation.",
    )
    facility_id = serializers.IntegerField(
        required=False,
        help_text="Optional facility ID for this installation.",
    )


class RevokeSerializer(serializers.Serializer):
    """Request to revoke an installation."""

    reason = serializers.CharField(
        max_length=500,
        required=False,
        default="",
    )


class LicenseStatusSerializer(serializers.Serializer):
    """Response for /api/licensing/status/ (local verification)."""

    valid = serializers.BooleanField()
    tier = serializers.CharField(allow_blank=True)
    features = serializers.DictField()
    org_name = serializers.CharField(allow_blank=True)
    subscription_status = serializers.CharField(allow_blank=True)
    expires_at = serializers.IntegerField(allow_null=True)
    check_in_by = serializers.IntegerField(allow_null=True)
    check_in_overdue = serializers.BooleanField()
    error = serializers.CharField(allow_blank=True)

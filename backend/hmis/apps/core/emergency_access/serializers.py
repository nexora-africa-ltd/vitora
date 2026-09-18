# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Serializers for Emergency Access module.
"""

from rest_framework import serializers

from hmis.apps.patients.models import Patient

from .models import (
    EmergencyAccess,
    EmergencyAccessAccessMode,
    EmergencyAccessReason,
    EmergencyAccessScope,
)

SYSTEM_SCOPE_REASONS = {
    EmergencyAccessReason.DISASTER_RESPONSE,
    EmergencyAccessReason.MASS_CASUALTY,
}


class EmergencyAccessCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating emergency access requests."""

    patient_mrn = serializers.CharField(
        required=False,
        allow_blank=True,
        write_only=True,
        help_text="Patient MRN (optional, for patient-specific access)",
    )
    duration_minutes = serializers.IntegerField(
        min_value=15,
        max_value=1440,  # Max 24 hours
        default=240,  # Default 4 hours
        help_text="Duration in minutes (15-1440)",
    )
    scope_type = serializers.ChoiceField(
        choices=EmergencyAccessScope.choices,
        default=EmergencyAccessScope.PATIENT,
        help_text="Scope of access requested",
    )
    access_mode = serializers.ChoiceField(
        choices=EmergencyAccessAccessMode.choices,
        default=EmergencyAccessAccessMode.READ_ONLY,
        help_text="Access mode for emergency session",
    )

    class Meta:
        """Meta options for EmergencyAccessCreateSerializer."""

        model = EmergencyAccess
        fields = [
            "reason",
            "reason_details",
            "duration_minutes",
            "patient_mrn",
            "scope_type",
            "access_mode",
        ]

    def validate_reason_details(self, value: str) -> str:
        """Validate that reason details are provided."""
        if not value or len(value.strip()) < 10:
            raise serializers.ValidationError(
                "Reason details must be at least 10 characters to provide sufficient justification."
            )
        return value.strip()

    def validate_patient_mrn(self, value: str) -> str | None:
        """Validate patient MRN if provided."""
        if not value:
            return None
        try:
            Patient.objects.get(mrn=value)
        except Patient.DoesNotExist as err:
            raise serializers.ValidationError(f"Patient with MRN '{value}' not found.") from err
        return value

    def validate(self, attrs):
        """Validate scope and reason compatibility for break-glass requests."""
        scope_type = attrs.get("scope_type", EmergencyAccessScope.PATIENT)
        reason = attrs.get("reason")
        patient_mrn = attrs.get("patient_mrn")

        if scope_type == EmergencyAccessScope.PATIENT and not patient_mrn:
            raise serializers.ValidationError(
                {"patient_mrn": "Patient MRN is required for patient scope."}
            )

        if scope_type == EmergencyAccessScope.SYSTEM and reason not in SYSTEM_SCOPE_REASONS:
            raise serializers.ValidationError(
                {
                    "scope_type": (
                        "System-wide emergency access is only allowed for mass casualty or "
                        "disaster response events."
                    )
                }
            )

        return attrs

    def create(self, validated_data: dict) -> EmergencyAccess:
        """Create emergency access with patient lookup."""
        patient_mrn = validated_data.pop("patient_mrn", None)
        access_mode = validated_data.get("access_mode", EmergencyAccessAccessMode.READ_ONLY)
        patient = None
        if patient_mrn:
            patient = Patient.objects.get(mrn=patient_mrn)

        granted_permissions = ["patient.read_sensitive"]
        if access_mode == EmergencyAccessAccessMode.LIMITED_WRITE:
            granted_permissions.append("patient.write_limited")
        validated_data["granted_permissions"] = granted_permissions

        # User is set in the view
        return EmergencyAccess.objects.create(patient=patient, **validated_data)


class EmergencyAccessSerializer(serializers.ModelSerializer):
    """Full serializer for emergency access records."""

    user_username = serializers.CharField(source="user.username", read_only=True)
    user_full_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True, allow_null=True)
    patient_name = serializers.SerializerMethodField()
    approver_username = serializers.CharField(
        source="approver.username", read_only=True, allow_null=True
    )
    revoked_by_username = serializers.CharField(
        source="revoked_by.username", read_only=True, allow_null=True
    )
    is_active = serializers.BooleanField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    remaining_minutes = serializers.IntegerField(read_only=True)
    reason_display = serializers.CharField(source="get_reason_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    scope_type_display = serializers.CharField(source="get_scope_type_display", read_only=True)
    access_mode_display = serializers.CharField(source="get_access_mode_display", read_only=True)

    class Meta:
        """Meta options for EmergencyAccessSerializer."""

        model = EmergencyAccess
        fields = [
            "id",
            "user",
            "user_username",
            "user_full_name",
            "patient",
            "patient_mrn",
            "patient_name",
            "reason",
            "reason_display",
            "reason_details",
            "requested_at",
            "expires_at",
            "duration_minutes",
            "scope_type",
            "scope_type_display",
            "access_mode",
            "access_mode_display",
            "granted_permissions",
            "review_due_at",
            "closed_at",
            "status",
            "status_display",
            "is_active",
            "is_expired",
            "remaining_minutes",
            "approver",
            "approver_username",
            "approved_at",
            "approval_notes",
            "revoked_by",
            "revoked_by_username",
            "revoked_at",
            "revocation_reason",
            "escalation_sent",
            "escalation_sent_at",
            "ip_address",
        ]
        read_only_fields = [
            "id",
            "user",
            "user_username",
            "user_full_name",
            "requested_at",
            "expires_at",
            "scope_type",
            "access_mode",
            "granted_permissions",
            "review_due_at",
            "closed_at",
            "status",
            "approver",
            "approver_username",
            "approved_at",
            "revoked_by",
            "revoked_by_username",
            "revoked_at",
            "escalation_sent",
            "escalation_sent_at",
            "ip_address",
        ]

    def get_user_full_name(self, obj: EmergencyAccess) -> str:
        """Get user's full name."""
        return f"{obj.user.first_name} {obj.user.last_name}".strip() or obj.user.username

    def get_patient_name(self, obj: EmergencyAccess) -> str | None:
        """Get patient's full name."""
        if not obj.patient:
            return None
        return f"{obj.patient.first_name} {obj.patient.last_name}".strip()


class EmergencyAccessReviewSerializer(serializers.Serializer):
    """Serializer for reviewing/approving emergency access."""

    action = serializers.ChoiceField(
        choices=["approve", "revoke"],
        help_text="Action to take: approve (mark as reviewed) or revoke",
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=2000,
        help_text="Review notes or revocation reason",
    )


class EmergencyAccessDashboardStatsSerializer(serializers.Serializer):
    """Serializer for dashboard statistics."""

    total_active = serializers.IntegerField()
    total_pending_review = serializers.IntegerField()
    total_today = serializers.IntegerField()
    total_this_week = serializers.IntegerField()
    by_reason = serializers.DictField(child=serializers.IntegerField())
    by_status = serializers.DictField(child=serializers.IntegerField())

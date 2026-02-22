"""
Serializers for Emergency Access module.
"""

from rest_framework import serializers

from hmis.apps.patients.models import Patient

from .models import EmergencyAccess


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

    class Meta:
        """Meta options for EmergencyAccessCreateSerializer."""

        model = EmergencyAccess
        fields = [
            "reason",
            "reason_details",
            "duration_minutes",
            "patient_mrn",
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

    def create(self, validated_data: dict) -> EmergencyAccess:
        """Create emergency access with patient lookup."""
        patient_mrn = validated_data.pop("patient_mrn", None)
        patient = None
        if patient_mrn:
            patient = Patient.objects.get(mrn=patient_mrn)

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

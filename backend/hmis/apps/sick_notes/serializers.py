"""
Serializers for the sick_notes module.

Provides REST API serialization for SickNote with
role-appropriate field exposure:
- ListSerializer: Lightweight for table views
- DetailSerializer: Full record for viewing
- CreateSerializer: Only clinician-fillable fields
- IssueSerializer: Transition DRAFT → ISSUED
- RevokeSerializer: Revoke with reason
"""

from rest_framework import serializers

from hmis.apps.sick_notes.models import SickNote


class SickNoteListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for sick note list views."""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()
    issued_by_name = serializers.SerializerMethodField()
    leave_days = serializers.IntegerField(read_only=True)

    class Meta:
        model = SickNote
        fields = [
            "id",
            "note_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "status",
            "status_display",
            "diagnosis_text",
            "leave_start_date",
            "leave_end_date",
            "leave_days",
            "issued_by",
            "issued_by_name",
            "issued_at",
            "created_at",
        ]

    def get_patient_name(self, obj):
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return ""

    def get_patient_mrn(self, obj):
        if obj.patient:
            return obj.patient.mrn
        return ""

    def get_issued_by_name(self, obj):
        if obj.issued_by:
            name = f"{obj.issued_by.first_name} {obj.issued_by.last_name}".strip()
            return name or obj.issued_by.username
        return ""


class SickNoteSerializer(serializers.ModelSerializer):
    """Full detail serializer for SickNote."""

    status_display = serializers.CharField(source="get_status_display", read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()
    issued_by_name = serializers.SerializerMethodField()
    revoked_by_name = serializers.SerializerMethodField()
    cancelled_by_name = serializers.SerializerMethodField()
    leave_days = serializers.IntegerField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = SickNote
        fields = [
            "id",
            "note_number",
            # Patient
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            # Clinician
            "issued_by",
            "issued_by_name",
            # Leave dates
            "leave_start_date",
            "leave_end_date",
            "leave_days",
            # Diagnosis
            "diagnosis_text",
            "diagnosis_code",
            # Employer
            "employer_name",
            "employer_contact",
            # Clinical
            "recommendations",
            "notes",
            # Status
            "status",
            "status_display",
            "is_active",
            "issued_at",
            "revoked_at",
            "revoked_by",
            "revoked_by_name",
            "revoke_reason",
            "cancelled_at",
            "cancelled_by",
            "cancelled_by_name",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "note_number",
            "issued_by",
            "status",
            "issued_at",
            "revoked_at",
            "revoked_by",
            "cancelled_at",
            "cancelled_by",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj):
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return ""

    def get_patient_mrn(self, obj):
        if obj.patient:
            return obj.patient.mrn
        return ""

    def get_issued_by_name(self, obj):
        if obj.issued_by:
            name = f"{obj.issued_by.first_name} {obj.issued_by.last_name}".strip()
            return name or obj.issued_by.username
        return ""

    def get_revoked_by_name(self, obj):
        if obj.revoked_by:
            name = f"{obj.revoked_by.first_name} {obj.revoked_by.last_name}".strip()
            return name or obj.revoked_by.username
        return ""

    def get_cancelled_by_name(self, obj):
        if obj.cancelled_by:
            name = f"{obj.cancelled_by.first_name} {obj.cancelled_by.last_name}".strip()
            return name or obj.cancelled_by.username
        return ""


class SickNoteCreateSerializer(serializers.ModelSerializer):
    """Create serializer — only clinician-fillable fields."""

    class Meta:
        model = SickNote
        fields = [
            "encounter",
            "patient",
            "leave_start_date",
            "leave_end_date",
            "diagnosis_text",
            "diagnosis_code",
            "employer_name",
            "employer_contact",
            "recommendations",
            "notes",
        ]

    def validate(self, attrs):
        start = attrs.get("leave_start_date")
        end = attrs.get("leave_end_date")
        if start and end and end < start:
            raise serializers.ValidationError(
                {"leave_end_date": "End date cannot be before start date."}
            )
        encounter = attrs.get("encounter")
        patient = attrs.get("patient")
        if encounter and patient:
            if encounter.patient_id != patient.id:
                raise serializers.ValidationError(
                    {"patient": "Patient does not match the encounter."}
                )
        elif encounter and not patient:
            attrs["patient"] = encounter.patient
        return attrs

    def create(self, validated_data):
        user = self.context["request"].user
        validated_data["issued_by"] = user
        return super().create(validated_data)


class SickNoteIssueSerializer(serializers.Serializer):
    """Empty serializer for issuing a draft sick note."""

    pass


class SickNoteRevokeSerializer(serializers.Serializer):
    """Serializer for revoking an issued sick note."""

    reason = serializers.CharField(required=True, min_length=1)

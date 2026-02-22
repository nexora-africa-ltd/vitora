"""
Serializers for Disease Surveillance module.

Provides serialization for NotifiableDisease, NotifiableCase,
SurveillanceAlert, and reporting endpoints.
"""

from rest_framework import serializers

from .models import (
    NotifiableCase,
    NotifiableDisease,
    NotificationStatus,
    OutbreakThreshold,
    SurveillanceAlert,
)


class NotifiableDiseaseSerializer(serializers.ModelSerializer):
    """Serializer for NotifiableDisease model."""

    icd10_code_list = serializers.SerializerMethodField()
    is_immediate = serializers.BooleanField(read_only=True)

    class Meta:
        model = NotifiableDisease
        fields = [
            "id",
            "name",
            "icd10_codes",
            "icd10_code_list",
            "category",
            "reporting_hours",
            "description",
            "case_definition",
            "laboratory_criteria",
            "is_ihr_notifiable",
            "is_active",
            "is_immediate",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "icd10_code_list", "is_immediate"]

    def get_icd10_code_list(self, obj) -> list[str]:
        """Return list of ICD-10 codes."""
        return obj.get_icd10_code_list()


class NotifiableDiseaseListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for disease list views."""

    class Meta:
        model = NotifiableDisease
        fields = ["id", "name", "category", "reporting_hours", "is_immediate", "is_active"]


class NotifiableCaseSerializer(serializers.ModelSerializer):
    """Full serializer for NotifiableCase."""

    disease_name = serializers.CharField(source="disease.name", read_only=True)
    disease_category = serializers.CharField(source="disease.category", read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    county_name = serializers.CharField(source="county.name", read_only=True)
    sub_county_name = serializers.CharField(source="sub_county.name", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    hours_until_deadline = serializers.IntegerField(read_only=True)
    is_immediate = serializers.BooleanField(read_only=True)
    reported_by_name = serializers.CharField(source="reported_by.username", read_only=True)
    notified_by_name = serializers.CharField(
        source="notified_by.username", read_only=True, allow_null=True
    )

    class Meta:
        model = NotifiableCase
        fields = [
            "id",
            "disease",
            "disease_name",
            "disease_category",
            "patient",
            "patient_name",
            "patient_mrn",
            "encounter",
            "diagnosis",
            "onset_date",
            "severity",
            "outcome",
            "laboratory_confirmed",
            "lab_result_date",
            "notification_status",
            "detected_at",
            "notified_at",
            "notification_deadline",
            "is_overdue",
            "hours_until_deadline",
            "is_immediate",
            "county",
            "county_name",
            "sub_county",
            "sub_county_name",
            "contact_tracing_initiated",
            "contacts_identified",
            "investigation_notes",
            "reported_by",
            "reported_by_name",
            "notified_by",
            "notified_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "detected_at",
            "notification_deadline",
            "is_overdue",
            "hours_until_deadline",
            "is_immediate",
            "reported_by",
            "notified_by",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class NotifiableCaseListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for case list views."""

    disease_name = serializers.CharField(source="disease.name", read_only=True)
    disease_category = serializers.CharField(source="disease.category", read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    county_name = serializers.CharField(source="county.name", read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    is_immediate = serializers.BooleanField(read_only=True)

    class Meta:
        model = NotifiableCase
        fields = [
            "id",
            "disease",
            "disease_name",
            "disease_category",
            "patient",
            "patient_name",
            "patient_mrn",
            "severity",
            "outcome",
            "notification_status",
            "detected_at",
            "notification_deadline",
            "is_overdue",
            "is_immediate",
            "county_name",
            "laboratory_confirmed",
        ]

    def get_patient_name(self, obj) -> str:
        """Return patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class NotifiableCaseCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new cases."""

    class Meta:
        model = NotifiableCase
        fields = [
            "id",
            "disease",
            "patient",
            "encounter",
            "diagnosis",
            "onset_date",
            "severity",
            "outcome",
            "laboratory_confirmed",
            "lab_result_date",
            "contact_tracing_initiated",
            "contacts_identified",
            "investigation_notes",
            "notification_status",
            "notification_deadline",
            "detected_at",
        ]
        read_only_fields = ["id", "notification_status", "notification_deadline", "detected_at"]

    def create(self, validated_data):
        """Create case with reported_by from request user."""
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["reported_by"] = request.user
        return super().create(validated_data)


class NotifyCountySerializer(serializers.Serializer):
    """Serializer for marking a case as notified."""

    notification_notes = serializers.CharField(required=False, allow_blank=True)


class SurveillanceAlertSerializer(serializers.ModelSerializer):
    """Full serializer for SurveillanceAlert."""

    case_disease_name = serializers.CharField(source="case.disease.name", read_only=True)
    case_patient_mrn = serializers.CharField(source="case.patient.mrn", read_only=True)
    case_county = serializers.CharField(source="case.county.name", read_only=True)
    acknowledged_by_name = serializers.CharField(
        source="acknowledged_by.username", read_only=True, allow_null=True
    )

    class Meta:
        model = SurveillanceAlert
        fields = [
            "id",
            "case",
            "case_disease_name",
            "case_patient_mrn",
            "case_county",
            "alert_type",
            "message",
            "is_acknowledged",
            "acknowledged_by",
            "acknowledged_by_name",
            "acknowledged_at",
            "sent_via_websocket",
            "sent_via_sms",
            "sent_via_email",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "acknowledged_by",
            "acknowledged_at",
            "sent_via_websocket",
            "sent_via_sms",
            "sent_via_email",
            "created_at",
        ]


class SurveillanceAlertListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for alert list views."""

    case_disease_name = serializers.CharField(source="case.disease.name", read_only=True)
    case_patient_mrn = serializers.CharField(source="case.patient.mrn", read_only=True)

    class Meta:
        model = SurveillanceAlert
        fields = [
            "id",
            "case",
            "case_disease_name",
            "case_patient_mrn",
            "alert_type",
            "message",
            "is_acknowledged",
            "created_at",
        ]


class OutbreakThresholdSerializer(serializers.ModelSerializer):
    """Serializer for OutbreakThreshold model."""

    disease_name = serializers.CharField(source="disease.name", read_only=True)
    county_name = serializers.CharField(source="county.name", read_only=True, allow_null=True)
    threshold_status = serializers.SerializerMethodField()

    class Meta:
        model = OutbreakThreshold
        fields = [
            "id",
            "disease",
            "disease_name",
            "county",
            "county_name",
            "case_threshold",
            "period_days",
            "is_active",
            "threshold_status",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "threshold_status"]

    def get_threshold_status(self, obj) -> dict:
        """Return current threshold status."""
        exceeded, count = obj.check_threshold()
        return {
            "is_exceeded": exceeded,
            "current_count": count,
            "threshold": obj.case_threshold,
        }


class CountyReportSerializer(serializers.Serializer):
    """Serializer for county disease report endpoint."""

    county_id = serializers.IntegerField()
    county_name = serializers.CharField()
    period_start = serializers.DateTimeField()
    period_end = serializers.DateTimeField()
    cases_by_disease = serializers.ListField(child=serializers.DictField())
    total_cases = serializers.IntegerField()
    pending_notifications = serializers.IntegerField()
    overdue_notifications = serializers.IntegerField()


class SurveillanceDashboardSerializer(serializers.Serializer):
    """Serializer for surveillance dashboard stats."""

    total_active_cases = serializers.IntegerField()
    immediate_cases_pending = serializers.IntegerField()
    overdue_notifications = serializers.IntegerField()
    cases_today = serializers.IntegerField()
    cases_this_week = serializers.IntegerField()
    outbreak_alerts = serializers.IntegerField()
    top_diseases = serializers.ListField(child=serializers.DictField())
    cases_by_county = serializers.ListField(child=serializers.DictField())

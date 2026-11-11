# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""
Serializers for Disease Surveillance module.

Provides serialization for NotifiableDisease, NotifiableCase,
SurveillanceAlert, IDSRWeeklyReport, and reporting endpoints.
"""

from rest_framework import serializers

from .models import (
    ContactTracingContact,
    ContactTracingFollowUp,
    CountyNotificationDelivery,
    IDSRDiseaseSummary,
    IDSRSubmissionAttempt,
    IDSRWeeklyReport,
    IHRNotification,
    NotifiableCase,
    NotifiableDisease,
    OutbreakThreshold,
    SurveillanceAlert,
    SurveillanceFacilitySettings,
)


def _display_user_name(user) -> str | None:
    """Return full name when available, otherwise fall back to username."""
    if not user:
        return None
    full_name = user.get_full_name().strip() if hasattr(user, "get_full_name") else ""
    if full_name:
        return full_name
    return getattr(user, "username", None)


def _mask_recipient(value: str | None) -> str:
    """Return a masked representation of a recipient value."""
    text = (value or "").strip()
    if not text:
        return ""
    if "@" in text:
        local, _, domain = text.partition("@")
        local_mask = (local[:2] + "***") if len(local) > 2 else "***"
        return f"{local_mask}@{domain}"
    digits = text[-3:] if len(text) >= 3 else text
    return f"***{digits}"


class CountyNotificationDeliverySerializer(serializers.ModelSerializer):
    """Serializer for county notification delivery records."""

    recipient_masked = serializers.SerializerMethodField()
    triggered_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CountyNotificationDelivery
        fields = [
            "id",
            "case",
            "channel",
            "status",
            "recipient_masked",
            "attempt_count",
            "max_retry_attempts",
            "retry_backoff_minutes",
            "last_error",
            "provider",
            "provider_message_id",
            "provider_event",
            "sent_at",
            "delivered_at",
            "terminal_status_at",
            "last_attempt_at",
            "next_retry_at",
            "triggered_by",
            "triggered_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "week_label",
            "is_submitted",
            "can_edit",
            "auto_submission_enabled",
            "generated_at",
            "generated_by",
            "approved_at",
            "approved_by",
            "dhis2_submitted_at",
            "dhis2_response",
            "dhis2_import_summary",
            "disease_summaries",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_recipient_masked(self, obj) -> str:
        """Return masked recipient value."""
        return _mask_recipient(obj.recipient)

    def get_triggered_by_name(self, obj) -> str | None:
        """Return trigger actor display name."""
        return _display_user_name(obj.triggered_by)


class SurveillanceFacilitySettingsSerializer(serializers.ModelSerializer):
    """Serializer for facility surveillance county-notification settings."""

    sms_recipient = serializers.CharField(write_only=True, required=False, allow_blank=True)
    email_recipient = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    sms_recipient_masked = serializers.SerializerMethodField()
    email_recipient_masked = serializers.SerializerMethodField()

    class Meta:
        model = SurveillanceFacilitySettings
        fields = [
            "id",
            "facility",
            "notify_via_sms",
            "notify_via_email",
            "sms_recipient",
            "email_recipient",
            "sms_recipient_masked",
            "email_recipient_masked",
            "include_patient_identifiers",
            "max_retry_attempts",
            "retry_backoff_minutes",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "facility",
            "sms_recipient_masked",
            "email_recipient_masked",
            "created_at",
            "updated_at",
        ]

    def get_sms_recipient_masked(self, obj) -> str:
        """Return masked sms recipient."""
        return _mask_recipient(obj.sms_recipient)

    def get_email_recipient_masked(self, obj) -> str:
        """Return masked email recipient."""
        return _mask_recipient(obj.email_recipient)

    def create(self, validated_data):
        """Persist encrypted recipients from write-only fields."""
        sms_recipient = validated_data.pop("sms_recipient", "")
        email_recipient = validated_data.pop("email_recipient", "")
        instance = super().create(validated_data)
        if sms_recipient is not None:
            instance.sms_recipient = sms_recipient
        if email_recipient is not None:
            instance.email_recipient = email_recipient
        instance.save(
            update_fields=["sms_recipient_encrypted", "email_recipient_encrypted", "updated_at"]
        )
        return instance

    def update(self, instance, validated_data):
        """Persist encrypted recipients from write-only fields."""
        sms_recipient = validated_data.pop("sms_recipient", None)
        email_recipient = validated_data.pop("email_recipient", None)
        instance = super().update(instance, validated_data)
        update_fields: list[str] = []
        if sms_recipient is not None:
            instance.sms_recipient = sms_recipient
            update_fields.append("sms_recipient_encrypted")
        if email_recipient is not None:
            instance.email_recipient = email_recipient
            update_fields.append("email_recipient_encrypted")
        if update_fields:
            update_fields.append("updated_at")
            instance.save(update_fields=update_fields)
        return instance


class NotifiableDiseaseSerializer(serializers.ModelSerializer):
    """Serializer for NotifiableDisease model."""

    icd10_code_list = serializers.SerializerMethodField()
    is_immediate = serializers.BooleanField(read_only=True)
    requires_county_notification = serializers.BooleanField(read_only=True)

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
            "requires_county_notification",
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
    reported_by_name = serializers.SerializerMethodField()
    notified_by_name = serializers.SerializerMethodField()

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

    def get_reported_by_name(self, obj) -> str | None:
        """Return reporter display name."""
        return _display_user_name(obj.reported_by)

    def get_notified_by_name(self, obj) -> str | None:
        """Return notifier display name."""
        return _display_user_name(obj.notified_by)


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
    notes = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate(self, attrs):
        """Accept `notes` as an alias for backward-compatible clients."""
        if not attrs.get("notification_notes") and attrs.get("notes"):
            attrs["notification_notes"] = attrs["notes"]
        return attrs


class NotificationStatusActionSerializer(serializers.Serializer):
    """Input payload for case status workflow transitions."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")


class ContactTracingFollowUpSerializer(serializers.ModelSerializer):
    """Serializer for contact follow-up records."""

    recorded_by_name = serializers.SerializerMethodField()
    next_followup_date = serializers.DateField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = ContactTracingFollowUp
        fields = [
            "id",
            "contact",
            "followup_date",
            "method",
            "symptoms_present",
            "temperature_c",
            "notes",
            "outcome",
            "next_followup_date",
            "recorded_by",
            "recorded_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "contact",
            "recorded_by",
            "recorded_by_name",
            "created_at",
            "updated_at",
        ]

    def get_recorded_by_name(self, obj) -> str | None:
        """Return recorder display name."""
        return _display_user_name(obj.recorded_by)


class ContactTracingContactSerializer(serializers.ModelSerializer):
    """Serializer for contact tracing contacts."""

    case_id = serializers.IntegerField(source="case.id", read_only=True)
    case_disease_name = serializers.CharField(source="case.disease.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    updated_by_name = serializers.SerializerMethodField()
    phone_number_masked = serializers.SerializerMethodField()
    phone_number = serializers.CharField(required=False, allow_blank=True, write_only=True)
    followups = ContactTracingFollowUpSerializer(many=True, read_only=True)

    class Meta:
        model = ContactTracingContact
        fields = [
            "id",
            "case",
            "case_id",
            "case_disease_name",
            "full_name",
            "phone_number",
            "phone_number_masked",
            "relationship_to_case",
            "risk_level",
            "status",
            "exposure_date",
            "monitoring_start_date",
            "monitoring_end_date",
            "next_followup_date",
            "last_followup_at",
            "last_contact_attempt_at",
            "notes",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "followups",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "case_id",
            "case_disease_name",
            "phone_number_masked",
            "last_followup_at",
            "last_contact_attempt_at",
            "created_by",
            "created_by_name",
            "updated_by",
            "updated_by_name",
            "followups",
            "created_at",
            "updated_at",
        ]

    def get_created_by_name(self, obj) -> str | None:
        """Return creator display name."""
        return _display_user_name(obj.created_by)

    def create(self, validated_data):
        """Persist encrypted phone number from write-only payload field."""
        phone_number = validated_data.pop("phone_number", "")
        instance = super().create(validated_data)
        if phone_number is not None:
            instance.phone_number = phone_number
            instance.save(update_fields=["phone_number_encrypted", "updated_at"])
        return instance

    def update(self, instance, validated_data):
        """Persist encrypted phone number from write-only payload field."""
        phone_number = validated_data.pop("phone_number", None)
        instance = super().update(instance, validated_data)
        if phone_number is not None:
            instance.phone_number = phone_number
            instance.save(update_fields=["phone_number_encrypted", "updated_at"])
        return instance

    def get_updated_by_name(self, obj) -> str | None:
        """Return updater display name."""
        return _display_user_name(obj.updated_by)

    def get_phone_number_masked(self, obj) -> str:
        """Return masked phone number."""
        return _mask_recipient(obj.phone_number)


class ContactTracingStatusActionSerializer(serializers.Serializer):
    """Input for contact workflow transition actions."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")
    monitoring_days = serializers.IntegerField(
        required=False, min_value=1, max_value=30, default=14
    )


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

    def validate(self, attrs):
        disease = attrs.get("disease", getattr(self.instance, "disease", None))
        county = attrs.get("county", getattr(self.instance, "county", None))
        qs = OutbreakThreshold.objects.filter(disease=disease, county=county)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            scope = county.name if county else "National"
            raise serializers.ValidationError(
                f"A threshold for this disease already exists at the {scope} level."
            )
        return attrs

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


# ============================================================================
# IDSR Weekly Reporting Serializers
# ============================================================================


class IDSRDiseaseSummarySerializer(serializers.ModelSerializer):
    """Serializer for IDSRDiseaseSummary within a weekly report."""

    disease_name = serializers.CharField(source="disease.name", read_only=True)
    disease_category = serializers.CharField(source="disease.category", read_only=True)

    class Meta:
        # from .models import IDSRDiseaseSummary

        model = IDSRDiseaseSummary
        fields = [
            "id",
            "disease",
            "disease_name",
            "disease_category",
            "cases_under_5",
            "cases_5_and_above",
            "total_cases",
            "deaths_under_5",
            "deaths_5_and_above",
            "total_deaths",
            "lab_confirmed",
            "case_fatality_rate",
            "is_outbreak",
            "notes",
        ]
        read_only_fields = ["id", "total_cases", "total_deaths", "case_fatality_rate"]


class IDSRWeeklyReportSerializer(serializers.ModelSerializer):
    """Full serializer for IDSRWeeklyReport."""

    disease_summaries = IDSRDiseaseSummarySerializer(many=True, read_only=True)
    county_name = serializers.CharField(source="county.name", read_only=True, allow_null=True)
    sub_county_name = serializers.CharField(
        source="sub_county.name", read_only=True, allow_null=True
    )
    generated_by_name = serializers.CharField(
        source="generated_by.username", read_only=True, allow_null=True
    )
    reviewed_by_name = serializers.CharField(
        source="reviewed_by.username", read_only=True, allow_null=True
    )
    approved_by_name = serializers.CharField(
        source="approved_by.username", read_only=True, allow_null=True
    )
    week_label = serializers.CharField(read_only=True)
    is_submitted = serializers.BooleanField(read_only=True)
    can_edit = serializers.BooleanField(read_only=True)
    auto_submission_enabled = serializers.SerializerMethodField()

    class Meta:
        # from .models import IDSRWeeklyReport

        model = IDSRWeeklyReport
        fields = [
            "id",
            "epi_year",
            "epi_week",
            "week_label",
            "week_start_date",
            "week_end_date",
            "facility_code",
            "facility_name",
            "county",
            "county_name",
            "sub_county",
            "sub_county_name",
            "total_cases",
            "total_deaths",
            "immediate_cases",
            "lab_confirmed_cases",
            "outbreak_declared",
            "outbreak_diseases",
            "status",
            "is_submitted",
            "can_edit",
            "auto_submission_enabled",
            "generated_at",
            "generated_by",
            "generated_by_name",
            "reviewed_at",
            "reviewed_by",
            "reviewed_by_name",
            "approved_at",
            "approved_by",
            "approved_by_name",
            "dhis2_submitted_at",
            "dhis2_import_summary",
            "notes",
            "disease_summaries",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "week_label",
            "is_submitted",
            "can_edit",
            "auto_submission_enabled",
            "generated_at",
            "generated_by",
            "approved_at",
            "approved_by",
            "dhis2_submitted_at",
            "dhis2_response",
            "dhis2_import_summary",
            "disease_summaries",
            "created_at",
            "updated_at",
        ]

    def get_auto_submission_enabled(self, _obj) -> bool:
        """Expose the platform automation state for the reporting UI."""
        from hmis.apps.core.models import FeatureFlag

        return FeatureFlag.is_flag_enabled("idsr_auto_submission")


class IDSRSubmissionAttemptSerializer(serializers.ModelSerializer):
    """Read-only serializer for auditable IDSR outbound attempts."""

    class Meta:
        model = IDSRSubmissionAttempt
        fields = [
            "id",
            "report",
            "status",
            "trigger",
            "attempt_number",
            "validation_response",
            "response",
            "http_status",
            "error_message",
            "attempted_at",
            "completed_at",
            "next_retry_at",
            "created_at",
        ]
        read_only_fields = fields


class IDSRWeeklyReportListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for IDSR report list views."""

    county_name = serializers.CharField(source="county.name", read_only=True, allow_null=True)
    week_label = serializers.CharField(read_only=True)
    disease_count = serializers.SerializerMethodField()

    class Meta:
        from .models import IDSRWeeklyReport

        model = IDSRWeeklyReport
        fields = [
            "id",
            "epi_year",
            "epi_week",
            "week_label",
            "week_start_date",
            "week_end_date",
            "facility_name",
            "county_name",
            "total_cases",
            "total_deaths",
            "outbreak_declared",
            "status",
            "disease_count",
            "generated_at",
        ]

    def get_disease_count(self, obj) -> int:
        """Return count of diseases in report."""
        return obj.disease_summaries.count()


class IDSRReportGenerateSerializer(serializers.Serializer):
    """Serializer for triggering IDSR report generation."""

    epi_year = serializers.IntegerField(required=False, min_value=2020, max_value=2100)
    epi_week = serializers.IntegerField(required=False, min_value=1, max_value=53)

    def validate(self, attrs):
        """Ensure both year and week are provided together or neither."""
        epi_year = attrs.get("epi_year")
        epi_week = attrs.get("epi_week")

        if (epi_year is None) != (epi_week is None):
            raise serializers.ValidationError(
                "Both epi_year and epi_week must be provided together, or neither."
            )
        return attrs


class IDSRReportApproveSerializer(serializers.Serializer):
    """Serializer for approving an IDSR report."""

    notes = serializers.CharField(required=False, allow_blank=True)


class IDSRDashboardSerializer(serializers.Serializer):
    """Serializer for IDSR dashboard stats."""

    current_week = serializers.DictField()
    previous_weeks = serializers.ListField(child=serializers.DictField())
    total_reports_this_year = serializers.IntegerField()
    pending_submission = serializers.IntegerField()
    submitted_this_month = serializers.IntegerField()
    outbreak_weeks = serializers.IntegerField()


# ============================================================================
# IHR Notification Serializers
# ============================================================================


class IHRNotificationSerializer(serializers.ModelSerializer):
    """Full serializer for IHRNotification."""

    disease_name = serializers.CharField(source="disease.name", read_only=True)
    disease_category = serializers.CharField(source="disease.category", read_only=True)
    case_id = serializers.IntegerField(source="case.id", read_only=True, allow_null=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.SerializerMethodField()
    county_name = serializers.CharField(source="county.name", read_only=True, allow_null=True)
    sub_county_name = serializers.CharField(
        source="sub_county.name", read_only=True, allow_null=True
    )
    reported_by_name = serializers.SerializerMethodField()
    county_reviewed_by_name = serializers.SerializerMethodField()
    national_reviewed_by_name = serializers.SerializerMethodField()
    notification_reference = serializers.CharField(read_only=True)
    is_escalated = serializers.BooleanField(read_only=True)
    is_who_notified = serializers.BooleanField(read_only=True)
    hours_since_detection = serializers.IntegerField(read_only=True, allow_null=True)
    is_overdue = serializers.BooleanField(read_only=True)

    class Meta:
        model = IHRNotification
        fields = [
            "id",
            "disease",
            "disease_name",
            "disease_category",
            "case",
            "case_id",
            "patient",
            "patient_name",
            "patient_mrn",
            "event_description",
            "event_date",
            "urgency",
            "annex2_criteria",
            "is_annex2_positive",
            "cases_count",
            "deaths_count",
            "affected_area",
            "county",
            "county_name",
            "sub_county",
            "sub_county_name",
            "status",
            "notification_reference",
            "is_escalated",
            "is_who_notified",
            "hours_since_detection",
            "is_overdue",
            "reported_by",
            "reported_by_name",
            "report_date",
            "county_notified_at",
            "county_reviewed_by",
            "county_reviewed_by_name",
            "county_notes",
            "national_notified_at",
            "national_reviewed_by",
            "national_reviewed_by_name",
            "national_notes",
            "who_notified_at",
            "who_reference_number",
            "who_acknowledged_at",
            "resolved_at",
            "resolution_notes",
            "risk_assessment",
            "response_measures",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "notification_reference",
            "is_escalated",
            "is_who_notified",
            "hours_since_detection",
            "is_overdue",
            "reported_by",
            "report_date",
            "county_notified_at",
            "county_reviewed_by",
            "national_notified_at",
            "national_reviewed_by",
            "who_notified_at",
            "who_acknowledged_at",
            "resolved_at",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str | None:
        """Return patient full name."""
        if obj.patient:
            return f"{obj.patient.first_name} {obj.patient.last_name}"
        return None

    def get_patient_mrn(self, obj) -> str | None:
        """Return patient MRN."""
        if obj.patient:
            return obj.patient.mrn
        return None

    def get_reported_by_name(self, obj) -> str | None:
        """Return reporter display name."""
        return _display_user_name(obj.reported_by)

    def get_county_reviewed_by_name(self, obj) -> str | None:
        """Return county reviewer display name."""
        return _display_user_name(obj.county_reviewed_by)

    def get_national_reviewed_by_name(self, obj) -> str | None:
        """Return national reviewer display name."""
        return _display_user_name(obj.national_reviewed_by)

    def validate_disease(self, value):
        """Ensure disease is IHR-notifiable."""
        if not value.is_ihr_notifiable:
            raise serializers.ValidationError(
                f"'{value.name}' is not marked as IHR-notifiable. "
                "Only diseases with is_ihr_notifiable=True can have IHR notifications."
            )
        return value


class IHRNotificationListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for IHR notification list views."""

    disease_name = serializers.CharField(source="disease.name", read_only=True)
    county_name = serializers.CharField(source="county.name", read_only=True, allow_null=True)
    notification_reference = serializers.CharField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    hours_since_detection = serializers.IntegerField(read_only=True, allow_null=True)

    class Meta:
        model = IHRNotification
        fields = [
            "id",
            "disease",
            "disease_name",
            "urgency",
            "status",
            "notification_reference",
            "cases_count",
            "deaths_count",
            "county_name",
            "report_date",
            "is_overdue",
            "hours_since_detection",
            "event_date",
        ]


class IHRNotificationCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating new IHR notifications."""

    class Meta:
        model = IHRNotification
        fields = [
            "id",
            "disease",
            "case",
            "patient",
            "event_description",
            "event_date",
            "urgency",
            "annex2_criteria",
            "is_annex2_positive",
            "cases_count",
            "deaths_count",
            "affected_area",
            "county",
            "sub_county",
            "risk_assessment",
            "response_measures",
        ]
        read_only_fields = ["id"]

    def validate_disease(self, value):
        """Ensure disease is IHR-notifiable."""
        if not value.is_ihr_notifiable:
            raise serializers.ValidationError(f"'{value.name}' is not marked as IHR-notifiable.")
        return value

    def create(self, validated_data):
        """Create notification with reported_by from request user."""
        request = self.context.get("request")
        if request and hasattr(request, "user"):
            validated_data["reported_by"] = request.user
        return super().create(validated_data)


class IHRSubmitToCountySerializer(serializers.Serializer):
    """Serializer for submitting IHR notification to county."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")


class IHREscalateToNationalSerializer(serializers.Serializer):
    """Serializer for escalating IHR notification to MOH."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")


class IHRNotifyWHOSerializer(serializers.Serializer):
    """Serializer for notifying WHO."""

    reference_number = serializers.CharField(required=False, allow_blank=True, default="")


class IHRRejectSerializer(serializers.Serializer):
    """Serializer for rejecting an IHR notification."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")


class IHRCloseSerializer(serializers.Serializer):
    """Serializer for closing an IHR notification."""

    notes = serializers.CharField(required=False, allow_blank=True, default="")

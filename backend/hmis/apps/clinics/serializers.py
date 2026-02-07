"""
Serializers for Clinic API endpoints.

This module provides DRF serializers for:
- Clinic CRUD operations
- ClinicSession management
- ClinicVisit queue operations
- ClinicStaff assignments
- ClinicSchedule management
- ClinicEnrollment chronic care tracking
"""

from rest_framework import serializers

from .models import (
    Clinic,
    ClinicEnrollment,
    ClinicSchedule,
    ClinicSession,
    ClinicStaff,
    ClinicVisit,
    MonthlyClinicReport,
)

# =============================================================================
# Clinic Serializers
# =============================================================================


class ClinicSerializer(serializers.ModelSerializer):
    """Serializer for Clinic model."""

    is_open_today = serializers.SerializerMethodField()
    clinic_type_display = serializers.CharField(source="get_clinic_type_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        """Meta options for ClinicSerializer."""

        model = Clinic
        fields = [
            "id",
            "name",
            "clinic_type",
            "clinic_type_display",
            "code",
            "description",
            "location",
            "floor",
            "capacity",
            "status",
            "status_display",
            "requires_appointment",
            "requires_referral",
            "accepts_walk_ins",
            "triage_required",
            "eligibility_rules",
            "default_service_fee",
            "sha_service_code",
            "dhis2_org_unit_id",
            "moh_code",
            "default_clinical_template",
            "is_sensitive",
            "required_permission",
            "is_open_today",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_is_open_today(self, obj) -> bool:
        """Check if clinic is open today."""
        return obj.is_open_today()

    def validate_code(self, value):
        """Validate clinic code uniqueness."""
        instance = getattr(self, "instance", None)
        if instance and instance.code == value:
            return value
        if Clinic.objects.filter(code=value).exists():
            raise serializers.ValidationError("A clinic with this code already exists.")
        return value

    def validate_clinic_type(self, value):
        """Validate clinic type is in choices."""
        valid_types = [choice[0] for choice in Clinic.CLINIC_TYPE_CHOICES]
        if value not in valid_types:
            raise serializers.ValidationError(
                f"Invalid clinic type. Must be one of: {', '.join(valid_types)}"
            )
        return value


class ClinicListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing clinics."""

    clinic_type_display = serializers.CharField(source="get_clinic_type_display", read_only=True)
    is_open_today = serializers.SerializerMethodField()

    class Meta:
        """Meta options for ClinicListSerializer."""

        model = Clinic
        fields = [
            "id",
            "name",
            "clinic_type",
            "clinic_type_display",
            "code",
            "location",
            "status",
            "is_sensitive",
            "is_open_today",
        ]

    def get_is_open_today(self, obj) -> bool:
        """Check if clinic is open today."""
        return obj.is_open_today()


# =============================================================================
# ClinicSession Serializers
# =============================================================================


class ClinicSessionSerializer(serializers.ModelSerializer):
    """Serializer for ClinicSession model."""

    clinic_name = serializers.CharField(source="clinic.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    opened_by_name = serializers.CharField(source="opened_by.get_full_name", read_only=True)
    closed_by_name = serializers.CharField(source="closed_by.get_full_name", read_only=True)

    class Meta:
        """Meta options for ClinicSessionSerializer."""

        model = ClinicSession
        fields = [
            "id",
            "clinic",
            "clinic_name",
            "session_date",
            "status",
            "status_display",
            "opened_at",
            "closed_at",
            "opened_by",
            "opened_by_name",
            "closed_by",
            "closed_by_name",
            "notes",
            "patients_registered",
            "patients_seen",
            "patients_waiting",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "clinic",
            "opened_at",
            "closed_at",
            "opened_by",
            "closed_by",
            "patients_registered",
            "patients_seen",
            "patients_waiting",
            "created_at",
            "updated_at",
        ]


# =============================================================================
# ClinicVisit Serializers
# =============================================================================


class ClinicVisitPatientSerializer(serializers.Serializer):
    """Nested patient serializer for ClinicVisit responses.

    Provides the patient object shape expected by the frontend:
    { id, mrn, first_name, last_name, full_name, date_of_birth, age, gender, phone_number }
    """

    id = serializers.IntegerField()
    mrn = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    full_name = serializers.CharField()
    date_of_birth = serializers.DateField()
    age = serializers.IntegerField()
    gender = serializers.CharField()
    phone_number = serializers.SerializerMethodField()

    def get_phone_number(self, obj) -> str:
        """Get phone number, returning empty string if encrypted/unavailable."""
        try:
            return obj.phone_number or ""
        except Exception:
            return ""


class ClinicVisitSerializer(serializers.ModelSerializer):
    """Serializer for ClinicVisit model."""

    patient = ClinicVisitPatientSerializer(read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    clinic_name = serializers.CharField(source="session.clinic.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    visit_type_display = serializers.CharField(source="get_visit_type_display", read_only=True)
    source_display = serializers.CharField(source="get_source_display", read_only=True)
    wait_time_minutes = serializers.ReadOnlyField()
    assigned_clinician_name = serializers.CharField(
        source="assigned_clinician.get_full_name", read_only=True
    )
    registered_by_name = serializers.SerializerMethodField()

    class Meta:
        """Meta options for ClinicVisitSerializer."""

        model = ClinicVisit
        fields = [
            "id",
            "session",
            "patient",
            "patient_name",
            "patient_mrn",
            "clinic_name",
            "queue_number",
            "status",
            "status_display",
            "priority",
            "priority_display",
            "visit_type",
            "visit_type_display",
            "source",
            "source_display",
            "registered_at",
            "called_at",
            "consultation_started_at",
            "completed_at",
            "encounter",
            "triage_assessment",
            "referred_from",
            "referred_to_clinic",
            "referral_reason",
            "assigned_clinician",
            "assigned_clinician_name",
            "registered_by",
            "registered_by_name",
            "chief_complaint",
            "notes",
            "consultation_fee_charged",
            "billing_line_item",
            "wait_time_minutes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "queue_number",
            "registered_at",
            "called_at",
            "consultation_started_at",
            "completed_at",
            "encounter",
            "registered_by",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_registered_by_name(self, obj) -> str:
        """Get the name of the user who registered this visit."""
        if obj.registered_by:
            return obj.registered_by.get_full_name() or obj.registered_by.username
        return ""


class ClinicVisitCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating clinic visits."""

    class Meta:
        """Meta options for ClinicVisitCreateSerializer."""

        model = ClinicVisit
        fields = [
            "session",
            "patient",
            "priority",
            "visit_type",
            "source",
            "chief_complaint",
            "notes",
            "triage_assessment",
        ]

    def create(self, validated_data):
        """Create a clinic visit with auto queue number."""
        validated_data["registered_by"] = self.context["request"].user
        return super().create(validated_data)


class ClinicVisitReferSerializer(serializers.Serializer):
    """Serializer for referring a patient to another clinic."""

    target_clinic = serializers.PrimaryKeyRelatedField(queryset=Clinic.objects.all())
    reason = serializers.CharField(max_length=500)


# =============================================================================
# ClinicStaff Serializers
# =============================================================================


class ClinicStaffSerializer(serializers.ModelSerializer):
    """Serializer for ClinicStaff model."""

    user_name = serializers.CharField(source="user.get_full_name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)
    clinic_name = serializers.CharField(source="clinic.name", read_only=True)

    class Meta:
        """Meta options for ClinicStaffSerializer."""

        model = ClinicStaff
        fields = [
            "id",
            "clinic",
            "clinic_name",
            "user",
            "user_name",
            "user_email",
            "role",
            "role_display",
            "is_primary",
            "start_date",
            "end_date",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "clinic", "created_at", "updated_at"]


# =============================================================================
# ClinicSchedule Serializers
# =============================================================================


class ClinicScheduleSerializer(serializers.ModelSerializer):
    """Serializer for ClinicSchedule model."""

    day_display = serializers.CharField(source="get_day_of_week_display", read_only=True)
    clinic_name = serializers.CharField(source="clinic.name", read_only=True)

    class Meta:
        """Meta options for ClinicScheduleSerializer."""

        model = ClinicSchedule
        fields = [
            "id",
            "clinic",
            "clinic_name",
            "day_of_week",
            "day_display",
            "start_time",
            "end_time",
            "max_patients",
            "is_active",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "clinic", "created_at", "updated_at"]


# =============================================================================
# ClinicEnrollment Serializers
# =============================================================================


class ClinicEnrollmentSerializer(serializers.ModelSerializer):
    """Serializer for ClinicEnrollment model with full chronic care fields."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    clinic_name = serializers.CharField(source="clinic.name", read_only=True)
    clinic_type = serializers.CharField(source="clinic.clinic_type", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_overdue = serializers.SerializerMethodField()
    is_defaulter = serializers.SerializerMethodField()
    days_since_last_visit = serializers.SerializerMethodField()
    days_overdue = serializers.SerializerMethodField()
    enrolled_by_name = serializers.CharField(source="enrolled_by.get_full_name", read_only=True)
    enrollment_type = serializers.SerializerMethodField()
    clinic_specific_summary = serializers.SerializerMethodField()

    # CCC computed fields
    days_on_art = serializers.SerializerMethodField()
    viral_load_due = serializers.SerializerMethodField()
    cd4_due = serializers.SerializerMethodField()
    is_virally_suppressed = serializers.SerializerMethodField()

    # ANC computed fields
    gestation_weeks = serializers.SerializerMethodField()
    gestation_display = serializers.SerializerMethodField()
    trimester = serializers.SerializerMethodField()
    days_to_edd = serializers.SerializerMethodField()

    # Diabetic computed fields
    hba1c_controlled = serializers.SerializerMethodField()
    hba1c_due = serializers.SerializerMethodField()

    class Meta:
        """Meta options for ClinicEnrollmentSerializer."""

        model = ClinicEnrollment
        fields = [
            "id",
            "clinic",
            "clinic_name",
            "clinic_type",
            "patient",
            "patient_name",
            "patient_mrn",
            "enrollment_number",
            "enrollment_date",
            "status",
            "status_display",
            "enrollment_data",
            "next_appointment",
            "appointment_interval_days",
            "enrolled_by",
            "enrolled_by_name",
            "last_visit_date",
            "total_visits",
            "outcome_date",
            "outcome_reason",
            "transfer_facility",
            "is_overdue",
            "is_defaulter",
            "days_since_last_visit",
            "days_overdue",
            "enrollment_type",
            "clinic_specific_summary",
            # CCC fields
            "art_start_date",
            "current_art_regimen",
            "art_regimen_line",
            "who_clinical_stage",
            "baseline_cd4_count",
            "latest_cd4_count",
            "latest_cd4_date",
            "latest_viral_load",
            "latest_viral_load_date",
            "viral_load_suppressed",
            "days_on_art",
            "viral_load_due",
            "cd4_due",
            "is_virally_suppressed",
            # ANC fields
            "gravida",
            "para",
            "lmp",
            "edd",
            "height_cm",
            "blood_group",
            "rhesus_factor",
            "hiv_status",
            "partner_hiv_status",
            "previous_cesarean",
            "high_risk_pregnancy",
            "high_risk_factors",
            "gestation_weeks",
            "gestation_display",
            "trimester",
            "days_to_edd",
            # Diabetic fields
            "diabetes_type",
            "diabetes_diagnosis_date",
            "latest_hba1c",
            "latest_hba1c_date",
            "latest_fbs",
            "latest_fbs_date",
            "on_insulin",
            "diabetes_complications",
            "hba1c_controlled",
            "hba1c_due",
            # Alert tracking
            "last_reminder_sent",
            "missed_appointment_alerts",
            # Timestamps
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "enrolled_by",
            "last_visit_date",
            "total_visits",
            "last_reminder_sent",
            "missed_appointment_alerts",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_is_overdue(self, obj) -> bool:
        """Check if patient is overdue."""
        return obj.is_overdue()

    def get_is_defaulter(self, obj) -> bool:
        """Check if patient is a defaulter."""
        return obj.is_defaulter()

    def get_days_since_last_visit(self, obj) -> str:
        """Get days since last visit."""
        return obj.days_since_last_visit()

    def get_days_overdue(self, obj) -> str:
        """Get days overdue for appointment."""
        return obj.days_overdue()

    def get_enrollment_type(self, obj) -> str:
        """Get enrollment type based on clinic."""
        return obj.enrollment_type()

    def get_clinic_specific_summary(self, obj) -> str:
        """Get clinic-specific data summary."""
        return obj.get_clinic_specific_summary()

    # CCC getters
    def get_days_on_art(self, obj) -> str:
        """Get days on ART."""
        return obj.days_on_art()

    def get_viral_load_due(self, obj) -> str:
        """Check if viral load test is due."""
        return obj.viral_load_due()

    def get_cd4_due(self, obj) -> str:
        """Check if CD4 count is due."""
        return obj.cd4_due()

    def get_is_virally_suppressed(self, obj) -> bool:
        """Check if patient is virally suppressed."""
        return obj.is_virally_suppressed()

    # ANC getters
    def get_gestation_weeks(self, obj) -> str:
        """Get gestation in weeks."""
        return obj.gestation_weeks()

    def get_gestation_display(self, obj) -> str:
        """Get gestation display string."""
        return obj.gestation_display()

    def get_trimester(self, obj) -> str:
        """Get current trimester."""
        return obj.trimester()

    def get_days_to_edd(self, obj) -> str:
        """Get days remaining to EDD."""
        return obj.days_to_edd()

    # Diabetic getters
    def get_hba1c_controlled(self, obj) -> str:
        """Check if HbA1c is controlled."""
        return obj.hba1c_controlled()

    def get_hba1c_due(self, obj) -> str:
        """Check if HbA1c test is due."""
        return obj.hba1c_due()

    def create(self, validated_data):
        """Create enrollment with enrolled_by set and auto-calculate EDD for ANC."""
        validated_data["enrolled_by"] = self.context["request"].user
        instance = super().create(validated_data)

        # Auto-calculate EDD for ANC enrollments
        if instance.lmp and not instance.edd:
            instance.calculate_edd()

        return instance

    def update(self, instance, validated_data):
        """Update enrollment and recalculate EDD if LMP changed."""
        old_lmp = instance.lmp
        instance = super().update(instance, validated_data)

        # Recalculate EDD if LMP changed
        if instance.lmp and instance.lmp != old_lmp:
            instance.calculate_edd()

        return instance


class ClinicEnrollmentListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing enrollments."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    clinic_name = serializers.CharField(source="clinic.name", read_only=True)
    clinic_type = serializers.CharField(source="clinic.clinic_type", read_only=True)
    is_overdue = serializers.SerializerMethodField()
    is_defaulter = serializers.SerializerMethodField()
    days_overdue = serializers.SerializerMethodField()
    enrollment_type = serializers.SerializerMethodField()

    class Meta:
        """Meta options for ClinicEnrollmentListSerializer."""

        model = ClinicEnrollment
        fields = [
            "id",
            "clinic",
            "clinic_name",
            "clinic_type",
            "patient",
            "patient_name",
            "patient_mrn",
            "enrollment_number",
            "enrollment_date",
            "status",
            "next_appointment",
            "is_overdue",
            "is_defaulter",
            "days_overdue",
            "enrollment_type",
            "last_visit_date",
            "total_visits",
        ]

    def get_patient_name(self, obj) -> str:
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_is_overdue(self, obj) -> bool:
        """Check if patient is overdue."""
        return obj.is_overdue()

    def get_is_defaulter(self, obj) -> bool:
        """Check if patient is a defaulter."""
        return obj.is_defaulter()

    def get_days_overdue(self, obj) -> str:
        """Get days overdue."""
        return obj.days_overdue()

    def get_enrollment_type(self, obj) -> str:
        """Get enrollment type."""
        return obj.enrollment_type()


# =============================================================================
# Queue Statistics Serializer
# =============================================================================


class QueueStatsSerializer(serializers.Serializer):
    """Serializer for queue statistics."""

    waiting = serializers.IntegerField()
    called = serializers.IntegerField()
    in_consultation = serializers.IntegerField()
    completed = serializers.IntegerField()
    referred = serializers.IntegerField()
    no_show = serializers.IntegerField()
    total = serializers.IntegerField()
    average_wait_time = serializers.FloatField()


# =============================================================================
# Monthly Clinic Reports
# =============================================================================


class MonthlyClinicReportSerializer(serializers.ModelSerializer):
    """Serializer for MonthlyClinicReport model."""

    class Meta:
        model = MonthlyClinicReport
        fields = [
            "id",
            "clinic",
            "year",
            "month",
            "total_visits",
            "new_visits",
            "revisits",
            "priority_red",
            "priority_orange",
            "priority_yellow",
            "priority_green",
            "priority_blue",
            "male_visits",
            "female_visits",
            "under_5_visits",
            "under_18_visits",
            "adult_visits",
            "over_60_visits",
            "new_enrollments",
            "active_enrollments",
            "defaulters",
            "anc_first_visits",
            "anc_revisits",
            "deliveries",
            "total_revenue",
            "sha_claims_amount",
            "cash_amount",
            "dhis2_submitted",
            "dhis2_submitted_at",
            "dhis2_response",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

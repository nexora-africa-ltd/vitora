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

    def get_is_open_today(self, obj):
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
        ]


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


class ClinicVisitSerializer(serializers.ModelSerializer):
    """Serializer for ClinicVisit model."""

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

    def get_patient_name(self, obj):
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"


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
    """Serializer for ClinicEnrollment model."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    clinic_name = serializers.CharField(source="clinic.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    is_overdue = serializers.SerializerMethodField()
    days_since_last_visit = serializers.SerializerMethodField()
    enrolled_by_name = serializers.CharField(source="enrolled_by.get_full_name", read_only=True)

    class Meta:
        """Meta options for ClinicEnrollmentSerializer."""

        model = ClinicEnrollment
        fields = [
            "id",
            "clinic",
            "clinic_name",
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
            "days_since_last_visit",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "enrolled_by",
            "last_visit_date",
            "total_visits",
            "created_at",
            "updated_at",
        ]

    def get_patient_name(self, obj):
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_is_overdue(self, obj):
        """Check if patient is overdue."""
        return obj.is_overdue()

    def get_days_since_last_visit(self, obj):
        """Get days since last visit."""
        return obj.days_since_last_visit()

    def create(self, validated_data):
        """Create enrollment with enrolled_by set."""
        validated_data["enrolled_by"] = self.context["request"].user
        return super().create(validated_data)


class ClinicEnrollmentListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing enrollments."""

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    clinic_name = serializers.CharField(source="clinic.name", read_only=True)
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        """Meta options for ClinicEnrollmentListSerializer."""

        model = ClinicEnrollment
        fields = [
            "id",
            "clinic",
            "clinic_name",
            "patient",
            "patient_name",
            "patient_mrn",
            "enrollment_number",
            "enrollment_date",
            "status",
            "next_appointment",
            "is_overdue",
        ]

    def get_patient_name(self, obj):
        """Get patient full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_is_overdue(self, obj):
        """Check if patient is overdue."""
        return obj.is_overdue()


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

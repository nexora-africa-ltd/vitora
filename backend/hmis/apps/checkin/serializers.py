"""
Serializers for the check-in app.

Sprint: Returning Patient Workflow - Sprint 1
"""

from rest_framework import serializers

from hmis.apps.clinics.models import Clinic
from hmis.apps.encounters.models import Encounter
from hmis.apps.patients.models import Patient

from .models import CheckIn


class ClinicalSnapshotSerializer(serializers.Serializer):
    """
    Read-only serializer for clinical snapshot data.

    Provides a summary of patient's clinical information
    for display at check-in.
    """

    allergies = serializers.ListField(child=serializers.CharField(), read_only=True)
    active_conditions = serializers.ListField(child=serializers.CharField(), read_only=True)
    current_medications = serializers.ListField(child=serializers.CharField(), read_only=True)
    last_visit_date = serializers.DateField(read_only=True, allow_null=True)
    last_visit_clinic = serializers.CharField(read_only=True, allow_null=True)
    pending_results = serializers.ListField(child=serializers.DictField(), read_only=True)
    alerts = serializers.ListField(child=serializers.CharField(), read_only=True)


class PatientSearchResultSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for patient search results.

    Used for listing multiple patients matching a search query.
    Does NOT include clinical snapshot (that's loaded after selection).
    """

    full_name = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()
    last_visit_date = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "mrn",
            "first_name",
            "middle_name",
            "last_name",
            "full_name",
            "date_of_birth",
            "age",
            "gender",
            "phone_number",
            "identification_type",
            "identification_number",
            "county",
            "sub_county",
            "last_visit_date",
        ]
        read_only_fields = fields

    def get_full_name(self, obj) -> str:
        """Get patient's full name."""
        parts = [obj.first_name]
        if obj.middle_name:
            parts.append(obj.middle_name)
        parts.append(obj.last_name)
        return " ".join(parts)

    def get_age(self, obj) -> int:
        """Get patient's age in years."""
        from datetime import date

        today = date.today()
        born = obj.date_of_birth
        return today.year - born.year - ((today.month, today.day) < (born.month, born.day))

    def get_last_visit_date(self, obj) -> str | None:
        """Get date of most recent encounter."""
        last_encounter = obj.encounters.order_by("-encounter_date").first()
        if last_encounter:
            return str(last_encounter.encounter_date)
        return None


class PatientLookupSerializer(serializers.ModelSerializer):
    """
    Serializer for patient lookup response.

    Includes patient details plus clinical snapshot
    and suggested visit context.
    """

    clinical_snapshot = ClinicalSnapshotSerializer(read_only=True)
    suggested_visit_type = serializers.CharField(read_only=True)
    suggested_visit_reason = serializers.CharField(read_only=True)
    full_name = serializers.SerializerMethodField()
    age = serializers.SerializerMethodField()
    last_encounter_date = serializers.SerializerMethodField()

    class Meta:
        model = Patient
        fields = [
            "id",
            "mrn",
            "first_name",
            "middle_name",
            "last_name",
            "full_name",
            "date_of_birth",
            "age",
            "gender",
            "phone_number",
            "identification_type",
            "identification_number",
            "county",
            "sub_county",
            "ward",
            "clinical_snapshot",
            "suggested_visit_type",
            "suggested_visit_reason",
            "last_encounter_date",
        ]
        read_only_fields = fields

    def get_full_name(self, obj) -> str:
        """Get patient's full name."""
        parts = [obj.first_name]
        if obj.middle_name:
            parts.append(obj.middle_name)
        parts.append(obj.last_name)
        return " ".join(parts)

    def get_age(self, obj) -> int:
        """Get patient's age in years."""
        from datetime import date

        today = date.today()
        born = obj.date_of_birth
        return today.year - born.year - ((today.month, today.day) < (born.month, born.day))

    def get_last_encounter_date(self, obj) -> str | None:
        """Get date of most recent encounter."""
        last_encounter = obj.encounters.order_by("-encounter_date").first()
        if last_encounter:
            return last_encounter.encounter_date
        return None


class CheckInRequestSerializer(serializers.Serializer):
    """
    Serializer for patient check-in request.

    Validates the check-in request data and handles
    destination routing.
    """

    destination = serializers.CharField(
        help_text="TRIAGE or clinic ID",
    )
    visit_type = serializers.ChoiceField(
        choices=CheckIn.VISIT_TYPE_CHOICES,
        required=False,
        allow_null=True,
        help_text="Visit type (auto-detected if not provided)",
    )
    visit_reason = serializers.ChoiceField(
        choices=CheckIn.VISIT_REASON_CHOICES,
        required=False,
        default="NEW_COMPLAINT",
    )
    skip_triage = serializers.BooleanField(
        required=False,
        default=False,
    )
    chief_complaint = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )
    linked_encounter_id = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="ID of previous encounter for follow-up",
    )
    identity_method = serializers.ChoiceField(
        choices=CheckIn.IDENTITY_METHOD_CHOICES,
        required=False,
        default="MRN",
    )
    procedure_order = serializers.IntegerField(
        required=False,
        allow_null=True,
        help_text="ID of scheduled procedure order (for SCHEDULED_PROCEDURE visits)",
    )

    def validate_destination(self, value):
        """Validate destination is TRIAGE, EMERGENCY, or valid clinic ID."""
        upper_value = value.upper()
        if upper_value == "TRIAGE":
            return "TRIAGE"
        if upper_value == "EMERGENCY":
            return "EMERGENCY"

        # Try to parse as clinic ID
        try:
            clinic_id = int(value)
            if not Clinic.objects.filter(id=clinic_id, status="ACTIVE").exists():
                raise serializers.ValidationError(
                    f"Clinic with ID {clinic_id} not found or not active."
                )
            return clinic_id
        except ValueError:
            raise serializers.ValidationError(
                "Destination must be 'TRIAGE', 'EMERGENCY', or a valid clinic ID."
            )

    def validate_linked_encounter_id(self, value):
        """Validate linked encounter exists."""
        if value is not None:
            if not Encounter.objects.filter(id=value).exists():
                raise serializers.ValidationError(f"Encounter with ID {value} not found.")
        return value

    def validate_procedure_order(self, value):
        """Validate procedure order exists and is in a schedulable state."""
        if value is None:
            return None
        from hmis.apps.procedures.models import ProcedureOrder

        try:
            order = ProcedureOrder.objects.get(id=value)
        except ProcedureOrder.DoesNotExist:
            raise serializers.ValidationError(f"Procedure order with ID {value} not found.")
        if order.status in ("COMPLETED", "CANCELLED"):
            raise serializers.ValidationError(
                f"Procedure order {order.order_number} is {order.status} and cannot be linked."
            )
        return value


class CheckInResponseSerializer(serializers.ModelSerializer):
    """
    Serializer for check-in response.

    Returns details of the created check-in.
    """

    checkin_id = serializers.IntegerField(source="id")
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn")
    destination = serializers.SerializerMethodField()
    destination_clinic_id = serializers.IntegerField(
        source="destination_clinic.id",
        allow_null=True,
    )
    destination_clinic_name = serializers.CharField(
        source="destination_clinic.name",
        allow_null=True,
    )
    queue_position = serializers.SerializerMethodField()
    estimated_wait_minutes = serializers.SerializerMethodField()
    encounter_id = serializers.IntegerField(source="encounter.id", allow_null=True)
    linked_encounter_id = serializers.IntegerField(
        source="linked_encounter.id",
        allow_null=True,
    )
    clinic_visit_id = serializers.IntegerField(
        source="clinic_visit.id",
        allow_null=True,
    )
    warning = serializers.CharField(required=False, allow_null=True)

    class Meta:
        model = CheckIn
        fields = [
            "checkin_id",
            "patient_name",
            "patient_mrn",
            "destination",
            "destination_clinic_id",
            "destination_clinic_name",
            "visit_type",
            "visit_reason",
            "skip_triage",
            "status",
            "queue_position",
            "estimated_wait_minutes",
            "checked_in_at",
            "encounter_id",
            "linked_encounter_id",
            "clinic_visit_id",
            "warning",
        ]

    def get_patient_name(self, obj) -> str:
        """Get patient's full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_destination(self, obj) -> str:
        """Get human-readable destination."""
        if obj.destination_type == "TRIAGE":
            return "TRIAGE"
        elif obj.destination_type == "EMERGENCY":
            return "EMERGENCY"
        elif obj.destination_clinic:
            return obj.destination_clinic.name
        return obj.destination_type

    def get_queue_position(self, obj) -> str:
        """Get current queue position."""
        # Calculate based on waiting queue or clinic visit
        if obj.waiting_queue_entry:
            from hmis.apps.triage.models import WaitingQueue

            return (
                WaitingQueue.objects.filter(
                    status__in=["WAITING_TRIAGE", "IN_TRIAGE"],
                    check_in_time__lt=obj.waiting_queue_entry.check_in_time,
                ).count()
                + 1
            )
        elif obj.clinic_visit:
            from hmis.apps.clinics.models import ClinicVisit

            return (
                ClinicVisit.objects.filter(
                    session=obj.clinic_visit.session,
                    status__in=["REGISTERED", "WAITING"],
                    queue_number__lt=obj.clinic_visit.queue_number,
                ).count()
                + 1
            )
        return 1

    def get_estimated_wait_minutes(self, obj) -> int:
        """Estimate wait time based on queue position."""
        position = self.get_queue_position(obj)
        # Simple estimate: 10 minutes per person ahead
        return position * 10


class TodayCheckinSerializer(serializers.ModelSerializer):
    """
    Serializer for today's check-ins list.

    Compact representation for the front desk view.
    """

    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn")
    destination = serializers.SerializerMethodField()
    destination_clinic_id = serializers.IntegerField(
        source="destination_clinic.id",
        allow_null=True,
    )
    checked_in_by_name = serializers.SerializerMethodField()

    class Meta:
        model = CheckIn
        fields = [
            "id",
            "patient_name",
            "patient_mrn",
            "destination",
            "destination_clinic_id",
            "visit_type",
            "visit_reason",
            "status",
            "checked_in_at",
            "checked_in_by_name",
            "skip_triage",
        ]

    def get_patient_name(self, obj) -> str:
        """Get patient's full name."""
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_destination(self, obj) -> str:
        """Get human-readable destination."""
        if obj.destination_type == "TRIAGE":
            return "Triage"
        elif obj.destination_type == "EMERGENCY":
            return "Emergency"
        elif obj.destination_clinic:
            return obj.destination_clinic.name
        return obj.destination_type

    def get_checked_in_by_name(self, obj) -> str:
        """Get name of staff who performed check-in."""
        if obj.checked_in_by:
            return obj.checked_in_by.get_full_name() or obj.checked_in_by.username
        return None

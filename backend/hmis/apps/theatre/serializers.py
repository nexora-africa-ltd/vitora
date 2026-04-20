"""
Theatre module serializers.

Split Create/Read pattern per codebase convention.
Action serializers for workflow transitions.
"""

from rest_framework import serializers

from .models import (
    AnesthesiaRecord,
    IntraOpVitalReading,
    OperatingTheatre,
    OperativeNote,
    PACURecord,
    PACUVitalReading,
    SurgeryCase,
    SurgicalTeamMember,
    TheatreConsumable,
    WHOSafetyChecklist,
)
from .services import scheduling as theatre_scheduling

# ═══════════════════════════════════════════════════════════════════════════
#  Operating Theatre
# ═══════════════════════════════════════════════════════════════════════════


class OperatingTheatreListSerializer(serializers.ModelSerializer):
    scheduling_resource = serializers.IntegerField(source="scheduling_resource_id", read_only=True)
    scheduling_resource_name = serializers.CharField(
        source="scheduling_resource.name", read_only=True
    )
    has_resource_schedule = serializers.SerializerMethodField()

    class Meta:
        model = OperatingTheatre
        fields = [
            "id",
            "code",
            "name",
            "theatre_type",
            "location",
            "is_active",
            "operating_hours_start",
            "operating_hours_end",
            "slot_duration_minutes",
            "scheduling_resource",
            "scheduling_resource_name",
            "has_resource_schedule",
        ]

    def get_has_resource_schedule(self, obj) -> bool:
        return theatre_scheduling.has_resource_schedule(obj)


class OperatingTheatreDetailSerializer(serializers.ModelSerializer):
    scheduling_resource_name = serializers.CharField(
        source="scheduling_resource.name", read_only=True
    )
    has_resource_schedule = serializers.SerializerMethodField()

    class Meta:
        model = OperatingTheatre
        fields = "__all__"

    def get_has_resource_schedule(self, obj) -> bool:
        return theatre_scheduling.has_resource_schedule(obj)


class OperatingTheatreCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OperatingTheatre
        fields = [
            "code",
            "name",
            "theatre_type",
            "location",
            "has_laminar_flow",
            "has_cath_lab",
            "has_image_intensifier",
            "equipment_notes",
            "operating_hours_start",
            "operating_hours_end",
            "slot_duration_minutes",
            "is_active",
            "maintenance_notes",
        ]


# ═══════════════════════════════════════════════════════════════════════════
#  Surgical Team Member
# ═══════════════════════════════════════════════════════════════════════════


class SurgicalTeamMemberSerializer(serializers.ModelSerializer):
    staff_name = serializers.SerializerMethodField()

    class Meta:
        model = SurgicalTeamMember
        fields = [
            "id",
            "surgery_case",
            "staff_member",
            "staff_name",
            "role",
            "scrub_in_time",
            "scrub_out_time",
            "notes",
            "created_at",
        ]
        read_only_fields = ["surgery_case"]

    def get_staff_name(self, obj) -> str:
        u = obj.staff_member
        return f"{u.first_name} {u.last_name}".strip() or u.username


class SurgicalTeamMemberCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SurgicalTeamMember
        fields = ["staff_member", "role", "notes"]

    def validate(self, attrs):
        case = self.context["view"].get_object()
        conflicts = theatre_scheduling.detect_staff_conflicts(
            attrs["staff_member"].id,
            case.scheduled_date,
            case.scheduled_start_time,
            case.estimated_duration_minutes,
            exclude_case_id=case.id,
        )
        if conflicts:
            raise serializers.ValidationError(
                {
                    "staff_member": "Staff member is already assigned to another overlapping surgery case.",
                    "conflicts": conflicts,
                }
            )

        coverage = theatre_scheduling.get_staff_shift_coverage(
            case,
            attrs["staff_member"].id,
            attrs.get("role", ""),
        )
        if not coverage["has_shift_coverage"]:
            raise serializers.ValidationError({"staff_member": coverage["message"]})

        return attrs


# ═══════════════════════════════════════════════════════════════════════════
#  Surgery Case
# ═══════════════════════════════════════════════════════════════════════════


class SurgeryCaseListSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    theatre_name = serializers.CharField(source="theatre.name", read_only=True)
    primary_procedure_name = serializers.CharField(source="primary_procedure.name", read_only=True)

    class Meta:
        model = SurgeryCase
        fields = [
            "id",
            "case_number",
            "patient",
            "patient_name",
            "patient_mrn",
            "primary_procedure",
            "primary_procedure_name",
            "theatre",
            "theatre_name",
            "scheduled_date",
            "scheduled_start_time",
            "estimated_duration_minutes",
            "status",
            "priority",
            "asa_class",
            "anesthesia_type",
            "laterality",
            "requested_at",
        ]

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"


class SurgeryCaseCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SurgeryCase
        fields = [
            "patient",
            "encounter",
            "admission",
            "primary_procedure",
            "additional_procedures",
            "procedure_notes",
            "theatre",
            "scheduled_date",
            "scheduled_start_time",
            "estimated_duration_minutes",
            "priority",
            "diagnosis",
            "laterality",
            "asa_class",
            "anesthesia_type",
        ]

    def validate(self, attrs):
        slot_check = theatre_scheduling.check_slot_available(
            attrs["theatre"],
            attrs["scheduled_date"],
            attrs["scheduled_start_time"],
            attrs["estimated_duration_minutes"],
        )
        if not slot_check["available"]:
            raise serializers.ValidationError(
                {
                    "scheduled_start_time": slot_check["reason"],
                    "conflicts": slot_check.get("conflicts", []),
                }
            )

        if getattr(attrs["primary_procedure"], "category", "") != "SURGICAL":
            raise serializers.ValidationError(
                {"primary_procedure": "Only SURGICAL procedures can be booked in theatre."}
            )

        return attrs


class SurgeryCaseDetailSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_mrn = serializers.CharField(source="patient.mrn", read_only=True)
    theatre_name = serializers.CharField(source="theatre.name", read_only=True)
    theatre_code = serializers.CharField(source="theatre.code", read_only=True)
    primary_procedure_name = serializers.CharField(source="primary_procedure.name", read_only=True)
    requesting_doctor_name = serializers.SerializerMethodField()
    team_members = SurgicalTeamMemberSerializer(many=True, read_only=True)
    has_who_checklist = serializers.SerializerMethodField()
    has_operative_note = serializers.SerializerMethodField()
    has_anesthesia_record = serializers.SerializerMethodField()
    has_pacu_record = serializers.SerializerMethodField()
    theatre_scheduling_resource = serializers.IntegerField(
        source="theatre.scheduling_resource_id", read_only=True
    )
    theatre_has_resource_schedule = serializers.SerializerMethodField()

    class Meta:
        model = SurgeryCase
        fields = "__all__"

    def get_patient_name(self, obj) -> str:
        return f"{obj.patient.first_name} {obj.patient.last_name}"

    def get_requesting_doctor_name(self, obj) -> str:
        u = obj.requesting_doctor
        return f"{u.first_name} {u.last_name}".strip() or u.username

    def get_has_who_checklist(self, obj) -> bool:
        return hasattr(obj, "who_checklist")

    def get_has_operative_note(self, obj) -> bool:
        return hasattr(obj, "operative_note")

    def get_has_anesthesia_record(self, obj) -> bool:
        return hasattr(obj, "anesthesia_record")

    def get_has_pacu_record(self, obj) -> bool:
        return hasattr(obj, "pacu_record")

    def get_theatre_has_resource_schedule(self, obj) -> bool:
        return theatre_scheduling.has_resource_schedule(obj.theatre)


# ═══════════════════════════════════════════════════════════════════════════
#  WHO Safety Checklist
# ═══════════════════════════════════════════════════════════════════════════


class WHOSafetyChecklistSerializer(serializers.ModelSerializer):
    sign_in_complete = serializers.BooleanField(read_only=True)
    time_out_complete = serializers.BooleanField(read_only=True)
    sign_out_complete = serializers.BooleanField(read_only=True)

    class Meta:
        model = WHOSafetyChecklist
        fields = "__all__"


class WHOSignInSerializer(serializers.Serializer):
    """POST .../who-checklist/sign-in/"""

    patient_identity_confirmed = serializers.BooleanField()
    procedure_site_marked = serializers.BooleanField()
    consent_signed = serializers.BooleanField()
    anesthesia_machine_checked = serializers.BooleanField()
    pulse_oximeter_attached = serializers.BooleanField()
    allergies_reviewed = serializers.BooleanField()
    allergy_notes = serializers.CharField(required=False, default="", allow_blank=True)
    difficult_airway_risk = serializers.BooleanField(required=False, default=False)
    aspiration_risk = serializers.BooleanField(required=False, default=False)
    airway_equipment_available = serializers.BooleanField(required=False, default=False)
    blood_loss_risk = serializers.CharField(required=False, default="", allow_blank=True)
    iv_access_adequate = serializers.BooleanField(required=False, default=False)
    blood_products_available = serializers.BooleanField(required=False, default=False)


class WHOTimeOutSerializer(serializers.Serializer):
    """POST .../who-checklist/time-out/"""

    team_members_introduced = serializers.BooleanField()
    patient_name_confirmed = serializers.BooleanField()
    procedure_confirmed = serializers.BooleanField()
    site_confirmed = serializers.BooleanField()
    surgeon_critical_steps_discussed = serializers.BooleanField(required=False, default=False)
    anesthesia_concerns_discussed = serializers.BooleanField(required=False, default=False)
    nursing_concerns_discussed = serializers.BooleanField(required=False, default=False)
    prophylactic_antibiotics_given = serializers.BooleanField(required=False, default=False)
    antibiotics_timing_within_60_min = serializers.BooleanField(required=False, default=False)
    antibiotics_not_applicable = serializers.BooleanField(required=False, default=False)
    essential_imaging_displayed = serializers.BooleanField(required=False, default=False)
    imaging_not_applicable = serializers.BooleanField(required=False, default=False)


class WHOSignOutSerializer(serializers.Serializer):
    """POST .../who-checklist/sign-out/"""

    procedure_name_recorded = serializers.BooleanField()
    instrument_count_correct = serializers.BooleanField()
    sponge_count_correct = serializers.BooleanField()
    needle_count_correct = serializers.BooleanField()
    specimens_labeled = serializers.BooleanField(required=False, default=False)
    specimen_count = serializers.IntegerField(required=False, default=0)
    equipment_problems_noted = serializers.BooleanField(required=False, default=False)
    equipment_problems_description = serializers.CharField(
        required=False, default="", allow_blank=True
    )
    key_recovery_concerns = serializers.CharField(required=False, default="", allow_blank=True)


# ═══════════════════════════════════════════════════════════════════════════
#  Anesthesia Record
# ═══════════════════════════════════════════════════════════════════════════


class AnesthesiaRecordSerializer(serializers.ModelSerializer):
    anesthesiologist_name = serializers.SerializerMethodField()

    class Meta:
        model = AnesthesiaRecord
        fields = "__all__"

    def get_anesthesiologist_name(self, obj) -> str:
        u = obj.anesthesiologist
        return f"{u.first_name} {u.last_name}".strip() or u.username


class AnesthesiaRecordCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = AnesthesiaRecord
        fields = [
            "anesthesiologist",
            # Pre-op
            "mallampati_class",
            "mouth_opening",
            "neck_mobility",
            "dentition_notes",
            "last_solid_food",
            "last_clear_fluids",
            "npo_confirmed",
            "premedication_given",
            "anesthesia_consent_obtained",
            "risks_explained",
        ]


class IntraOpVitalReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntraOpVitalReading
        fields = "__all__"
        read_only_fields = ["anesthesia_record"]


class IntraOpVitalReadingCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntraOpVitalReading
        fields = [
            "recorded_at",
            "recorded_by",
            "systolic_bp",
            "diastolic_bp",
            "heart_rate",
            "respiratory_rate",
            "spo2",
            "etco2",
            "fio2",
            "tidal_volume",
            "peak_pressure",
            "temperature",
            "notes",
        ]


# ═══════════════════════════════════════════════════════════════════════════
#  Operative Note
# ═══════════════════════════════════════════════════════════════════════════


class OperativeNoteSerializer(serializers.ModelSerializer):
    dictated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = OperativeNote
        fields = "__all__"

    def get_dictated_by_name(self, obj) -> str:
        u = obj.dictated_by
        return f"{u.first_name} {u.last_name}".strip() or u.username


class OperativeNoteCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OperativeNote
        fields = [
            "dictated_by",
            "incision_time",
            "closure_time",
            "pre_operative_diagnosis",
            "post_operative_diagnosis",
            "procedure_performed",
            "findings",
            "technique_description",
            "implants_used",
            "drains_placed",
            "sutures_used",
            "estimated_blood_loss",
            "specimens_sent",
            "frozen_section",
            "frozen_section_result",
            "intraoperative_complications",
            "post_operative_plan",
        ]


# ═══════════════════════════════════════════════════════════════════════════
#  Theatre Consumable
# ═══════════════════════════════════════════════════════════════════════════


class TheatreConsumableSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.generic_name", read_only=True)
    total_cost = serializers.SerializerMethodField()
    allocation_count = serializers.SerializerMethodField()
    source_batches = serializers.SerializerMethodField()

    class Meta:
        model = TheatreConsumable
        fields = "__all__"

    def get_total_cost(self, obj):
        return f"{obj.total_cost:.2f}"

    def get_allocation_count(self, obj) -> int:
        return obj.allocations.count()

    def get_source_batches(self, obj) -> list[str]:
        return list(obj.allocations.values_list("batch__batch_number", flat=True))


class TheatreConsumableCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TheatreConsumable
        fields = [
            "item",
            "lot_number",
            "expiry_date",
            "quantity_used",
            "unit_cost",
            "is_implant",
            "implant_serial_number",
        ]


# ═══════════════════════════════════════════════════════════════════════════
#  PACU Record
# ═══════════════════════════════════════════════════════════════════════════


class PACURecordSerializer(serializers.ModelSerializer):
    vital_readings = serializers.SerializerMethodField()

    class Meta:
        model = PACURecord
        fields = "__all__"

    def get_vital_readings(self, obj) -> list[dict]:
        return PACUVitalReadingSerializer(obj.vital_readings.all(), many=True).data


class PACURecordCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PACURecord
        fields = [
            "arrival_time",
            "arriving_nurse",
            "initial_aldrete_score",
            "initial_pain_score",
        ]


class PACUVitalReadingSerializer(serializers.ModelSerializer):
    class Meta:
        model = PACUVitalReading
        fields = "__all__"
        read_only_fields = ["pacu_record"]


class PACUVitalReadingCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PACUVitalReading
        fields = [
            "recorded_at",
            "recorded_by",
            "systolic_bp",
            "diastolic_bp",
            "heart_rate",
            "respiratory_rate",
            "spo2",
            "temperature",
            "aldrete_score",
            "pain_score",
            "sedation_level",
            "notes",
        ]


class PACUDischargeSerializer(serializers.Serializer):
    """POST .../pacu/discharge/"""

    discharge_aldrete_score = serializers.IntegerField()
    discharge_destination = serializers.ChoiceField(
        choices=PACURecord.DischargeDestination.choices,
    )
    discharge_notes = serializers.CharField(required=False, default="", allow_blank=True)


# ═══════════════════════════════════════════════════════════════════════════
#  Action Serializers (thin workflow endpoints)
# ═══════════════════════════════════════════════════════════════════════════


class CaseScheduleSerializer(serializers.Serializer):
    """POST .../schedule/"""

    theatre = serializers.IntegerField(required=False)
    scheduled_date = serializers.DateField(required=False)
    scheduled_start_time = serializers.TimeField(required=False)
    estimated_duration_minutes = serializers.IntegerField(required=False)

    def validate(self, attrs):
        case = self.context["view"].get_object()
        theatre = attrs.get("theatre") or case.theatre_id
        if isinstance(theatre, int):
            theatre = OperatingTheatre.objects.get(pk=theatre)
        scheduled_date = attrs.get("scheduled_date", case.scheduled_date)
        scheduled_start_time = attrs.get("scheduled_start_time", case.scheduled_start_time)
        estimated_duration_minutes = attrs.get(
            "estimated_duration_minutes", case.estimated_duration_minutes
        )

        slot_check = theatre_scheduling.check_slot_available(
            theatre,
            scheduled_date,
            scheduled_start_time,
            estimated_duration_minutes,
            exclude_case_id=case.id,
        )
        if not slot_check["available"]:
            raise serializers.ValidationError(
                {
                    "scheduled_start_time": slot_check["reason"],
                    "conflicts": slot_check.get("conflicts", []),
                }
            )

        return attrs


class CaseCancelSerializer(serializers.Serializer):
    """POST .../cancel/"""

    reason = serializers.CharField()


class CasePostponeSerializer(serializers.Serializer):
    """POST .../postpone/"""

    postponed_to_date = serializers.DateField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, default="", allow_blank=True)

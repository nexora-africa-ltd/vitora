"""
Theatre module serializers.

Split Create/Read pattern per codebase convention.
Action serializers for workflow transitions.
"""

from rest_framework import serializers

from hmis.apps.blood_bank.models import CrossMatch

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
    primary_procedure_tibabot_key = serializers.CharField(
        source="primary_procedure.tibabot_procedure_key", read_only=True
    )

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
            "primary_procedure_tibabot_key",
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
    patient_date_of_birth = serializers.DateField(source="patient.date_of_birth", read_only=True)
    patient_gender = serializers.CharField(source="patient.gender", read_only=True)
    theatre_name = serializers.CharField(source="theatre.name", read_only=True)
    theatre_code = serializers.CharField(source="theatre.code", read_only=True)
    primary_procedure_name = serializers.CharField(source="primary_procedure.name", read_only=True)
    primary_procedure_tibabot_key = serializers.CharField(
        source="primary_procedure.tibabot_procedure_key", read_only=True
    )
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
    ai_surgical_summary = serializers.SerializerMethodField()

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

    def get_ai_surgical_summary(self, obj) -> dict:
        latest_pre_op = obj.ai_surgical_pre_op_assessments.order_by("-created_at").first()
        latest_checklist = obj.ai_surgical_checklist_sessions.order_by("-created_at").first()
        latest_post_op = obj.ai_surgical_post_op_care_plans.order_by("-created_at").first()

        return {
            "pre_op": {
                "has_result": latest_pre_op is not None,
                "latest_result_id": str(latest_pre_op.id) if latest_pre_op else None,
                "overall_risk_level": (latest_pre_op.overall_risk_level if latest_pre_op else ""),
                "facility_capable": (latest_pre_op.facility_capable if latest_pre_op else None),
                "created_at": latest_pre_op.created_at if latest_pre_op else None,
            },
            "checklist": {
                "has_session": latest_checklist is not None,
                "latest_result_id": str(latest_checklist.id) if latest_checklist else None,
                "tibabot_session_id": (
                    latest_checklist.tibabot_session_id if latest_checklist else ""
                ),
                "current_phase": latest_checklist.current_phase if latest_checklist else "",
                "percent_complete": (
                    latest_checklist.percent_complete if latest_checklist else None
                ),
                "phase_complete": (latest_checklist.phase_complete if latest_checklist else False),
                "created_at": latest_checklist.created_at if latest_checklist else None,
            },
            "post_op": {
                "has_result": latest_post_op is not None,
                "latest_result_id": str(latest_post_op.id) if latest_post_op else None,
                "procedure_key": latest_post_op.procedure_key if latest_post_op else "",
                "surgical_apgar_score": (
                    latest_post_op.surgical_apgar_score if latest_post_op else None
                ),
                "risk_level": latest_post_op.risk_level if latest_post_op else "",
                "created_at": latest_post_op.created_at if latest_post_op else None,
            },
        }


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
    cross_match = serializers.PrimaryKeyRelatedField(
        queryset=CrossMatch.objects.filter(result="COMPATIBLE"),
        required=False,
        allow_null=True,
        default=None,
        help_text="Completed cross-match ID (required when blood_loss_risk is HIGH)",
    )

    def validate(self, attrs):
        blood_loss_risk = attrs.get("blood_loss_risk", "").upper()
        if blood_loss_risk == "HIGH":
            if not attrs.get("blood_products_available"):
                raise serializers.ValidationError(
                    {
                        "blood_products_available": "Must confirm blood products are available when blood loss risk is HIGH."
                    }
                )
            if not attrs.get("cross_match"):
                raise serializers.ValidationError(
                    {
                        "cross_match": "A completed compatible cross-match is required when blood loss risk is HIGH."
                    }
                )
        return attrs


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
    alerts = serializers.ListField(child=serializers.CharField(), read_only=True)
    has_critical_vitals = serializers.BooleanField(read_only=True)
    mean_arterial_pressure = serializers.FloatField(read_only=True)

    class Meta:
        model = IntraOpVitalReading
        fields = "__all__"
        read_only_fields = ["anesthesia_record"]


class IntraOpVitalReadingCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = IntraOpVitalReading
        fields = [
            "recorded_at",
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
            "cvp",
            "bis_index",
            "tof_count",
            "blood_glucose",
            "pain_score",
            "notes",
        ]

    # -- Clinical range validation ------------------------------------------

    @staticmethod
    def _check_range(value, low, high, field_label):
        if value is not None and not (low <= value <= high):
            raise serializers.ValidationError(f"{field_label} must be between {low} and {high}.")
        return value

    def validate_systolic_bp(self, value):
        return self._check_range(value, 30, 300, "Systolic BP")

    def validate_diastolic_bp(self, value):
        return self._check_range(value, 10, 200, "Diastolic BP")

    def validate_heart_rate(self, value):
        return self._check_range(value, 20, 300, "Heart rate")

    def validate_respiratory_rate(self, value):
        return self._check_range(value, 2, 80, "Respiratory rate")

    def validate_spo2(self, value):
        if value is not None and not (0 <= value <= 100):
            raise serializers.ValidationError("SpO2 must be between 0 and 100.")
        return value

    def validate_etco2(self, value):
        return self._check_range(value, 0, 100, "EtCO2")

    def validate_fio2(self, value):
        return self._check_range(value, 21, 100, "FiO2")

    def validate_tidal_volume(self, value):
        return self._check_range(value, 50, 2000, "Tidal volume")

    def validate_peak_pressure(self, value):
        return self._check_range(value, 0, 80, "Peak pressure")

    def validate_temperature(self, value):
        if value is not None:
            try:
                t = float(value) if isinstance(value, str) else value
            except (ValueError, TypeError) as err:
                raise serializers.ValidationError("Temperature must be a number.") from err
            if not (28.0 <= t <= 45.0):
                raise serializers.ValidationError("Temperature must be between 28.0 and 45.0 °C.")
        return value

    def validate_cvp(self, value):
        return self._check_range(value, -5, 30, "CVP")

    def validate_bis_index(self, value):
        return self._check_range(value, 0, 100, "BIS index")

    def validate_tof_count(self, value):
        return self._check_range(value, 0, 4, "TOF count")

    def validate_blood_glucose(self, value):
        if value is not None and not (1.0 <= float(value) <= 40.0):
            raise serializers.ValidationError("Blood glucose must be between 1.0 and 40.0 mmol/L.")
        return value

    def validate_pain_score(self, value):
        return self._check_range(value, 0, 10, "Pain score")

    def validate(self, attrs):
        sbp = attrs.get("systolic_bp")
        dbp = attrs.get("diastolic_bp")
        if sbp is not None and dbp is not None and dbp >= sbp:
            raise serializers.ValidationError(
                {"diastolic_bp": "Diastolic BP must be less than systolic BP."}
            )
        return attrs


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
    latest_aldrete_score = serializers.IntegerField(read_only=True)
    active_complication_count = serializers.IntegerField(read_only=True)
    ready_for_discharge = serializers.BooleanField(read_only=True)
    discharge_blockers = serializers.ListField(child=serializers.CharField(), read_only=True)

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


class PACURecordUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = PACURecord
        fields = [
            "nausea_vomiting",
            "shivering",
            "respiratory_issues",
            "cardiovascular_issues",
            "complications_notes",
            "medications_given",
            "handover_given_to",
            "handover_notes",
        ]

    def validate(self, attrs):
        complication_flags = [
            attrs.get("nausea_vomiting", getattr(self.instance, "nausea_vomiting", False)),
            attrs.get("shivering", getattr(self.instance, "shivering", False)),
            attrs.get("respiratory_issues", getattr(self.instance, "respiratory_issues", False)),
            attrs.get(
                "cardiovascular_issues", getattr(self.instance, "cardiovascular_issues", False)
            ),
        ]
        notes = attrs.get("complications_notes", getattr(self.instance, "complications_notes", ""))
        if any(complication_flags) and not str(notes).strip():
            raise serializers.ValidationError(
                {
                    "complications_notes": "Complication details are required when an issue is flagged."
                }
            )
        return attrs


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
    handover_given_to = serializers.CharField()
    handover_notes = serializers.CharField()

    def validate(self, attrs):
        pacu_record = self.context.get("pacu_record")
        if pacu_record is None:
            return attrs

        if pacu_record.discharge_time is not None:
            raise serializers.ValidationError("PACU discharge has already been completed.")

        if attrs["discharge_aldrete_score"] < PACURecord.DISCHARGE_ALDRETE_THRESHOLD:
            raise serializers.ValidationError(
                {
                    "discharge_aldrete_score": (
                        f"PACU discharge requires an Aldrete score of at least "
                        f"{PACURecord.DISCHARGE_ALDRETE_THRESHOLD}."
                    )
                }
            )

        blockers = list(pacu_record.discharge_blockers)
        blockers = [
            blocker
            for blocker in blockers
            if blocker
            not in {
                (
                    f"Aldrete score must be at least "
                    f"{PACURecord.DISCHARGE_ALDRETE_THRESHOLD} before discharge."
                ),
                "Document who received the PACU handover before discharge.",
                "Document PACU handover notes before discharge.",
            }
        ]
        if blockers:
            raise serializers.ValidationError({"non_field_errors": blockers})
        return attrs


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
